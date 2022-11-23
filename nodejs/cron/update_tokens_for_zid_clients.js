/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
const { closeCommonDBConnection } = require('../models/common');
const { getClientDB, closeClientDBConnection } = require('../models/client');
const MerchantDAL = require('../merchant/dal/merchant_dal');
const SubscriptionService = require('../app/subscription/app_subscription_service');
const { APP_NAME } = require('../app/constants');
const { MANAGER_TOKEN_RENEWAL_PERIOD, TWO_MONTHS } = require('../integration/apps/zid/utils/constants');
const ZidHttpQueryService = require('../integration/apps/zid/services/http_query_service');
const { BaseModel } = require('../utils/base-model');
const { invokeLambdaAsyncPromisified } = require('../utils/lambda_utility');

// TODO handle if the process took too much time in the future, limit is 900 seconds (15 minutes).
module.exports.updateTokens = async () => {
  const merchants = await MerchantDAL.getSchemaNameForMerchantsMainAccounts();
  const schemaNames = merchants.map((merchant) => merchant.schemaName);
  const segments = [];
  const chunk = 400;
  for (let i = 0; i < schemaNames.length; i += chunk) {
    segments.push(schemaNames.slice(i, i + chunk));
  }
  console.log(segments);
  await Promise.all(segments.map((segment) => {
    const payload = { schemaNames: segment };
    return invokeLambdaAsyncPromisified('updateZidTokensForSegment', payload);
  }));

  await closeCommonDBConnection();
};

module.exports.updateTokensForSegment = async ({ schemaNames = [] }) => {
  for (const schema of schemaNames) {
    let clientDB;
    try {
      clientDB = await getClientDB(schema);
      const zidSubscription = await SubscriptionService
        .getMerchantSubscriptionByAppName(APP_NAME.ZID, clientDB);
      if (zidSubscription) {
        const tokenAttribute = zidSubscription.AppSubscriptionAttributes.find((att) => att.name === 'managerToken');
        // old integration
        if (tokenAttribute) {
          if (shouldUpdateTokenOldIntegration(tokenAttribute.updatedAt)) {
            const newToken = await ZidHttpQueryService.getNewManagerToken(zidSubscription);
            console.log(`new Token has been created for merchant db ${schema}`, 'old integration');
            tokenAttribute.value = newToken;
            await tokenAttribute.save();
          }
        } else {
          const refreshTokenAttribute = zidSubscription.AppSubscriptionAttributes.find((att) => att.name === 'refreshToken');
          if (
            refreshTokenAttribute &&
            refreshTokenAttribute.value &&
            shouldUpdateTokenOauth2Integration(zidSubscription.AppSubscriptionAttributes)
          ) {
            const res = await ZidHttpQueryService.refreshAccessToken(refreshTokenAttribute.value);
            const {
              access_token: accessToken,
              expires_in: expiresIn,
              token_type: tokenType,
              authorization,
              refresh_token: refreshToken
            } = res;
            const accessTokenExpiration = new Date(Date.now() + (+expiresIn * 1000));

            await clientDB.sequelize.transaction(async (transaction) => {
              await updateOrCreateAttribute(zidSubscription, 'accessToken', accessToken, clientDB, transaction);
              await updateOrCreateAttribute(zidSubscription, 'authorization', authorization, clientDB, transaction);
              await updateOrCreateAttribute(zidSubscription, 'refreshToken', refreshToken, clientDB, transaction);
              await updateOrCreateAttribute(zidSubscription, 'tokenType', tokenType, clientDB, transaction);
              await updateOrCreateAttribute(zidSubscription, 'accessTokenExpiration', accessTokenExpiration.valueOf(), clientDB, transaction);
            });
            console.log(`new Token has been created for merchant db ${schema}`, 'new oauth2 integration');
          } else {
            console.log(`no need to update merchant db: ${schema}`);
          }
        }
      }
    } catch (e) {
      console.error(`failed to update zid token for merchant db ${schema}, error ==> ${JSON.stringify(e)}`);
    } finally {
      await closeClientDBConnection(clientDB);
    }
  }

  await closeCommonDBConnection();
};

function shouldUpdateTokenOldIntegration(managerTokenLastUpdateDate) {
  return Date.now() - managerTokenLastUpdateDate.valueOf() > MANAGER_TOKEN_RENEWAL_PERIOD;
}

function shouldUpdateTokenOauth2Integration(attributes = []) {
  let accessTokenExpiration = attributes.find((a) => a.name === 'accessTokenExpiration');
  if (accessTokenExpiration && accessTokenExpiration.value) {
    accessTokenExpiration = accessTokenExpiration.value;
    console.log('period left in days =', (+accessTokenExpiration - Date.now()) / (3600 * 24 * 1000));
    return +accessTokenExpiration - Date.now().valueOf() < TWO_MONTHS;
  }
  return false;
}

async function updateOrCreateAttribute(appSubscription, name = '', value = '', clientDB, transaction) {
  const attributes = appSubscription.AppSubscriptionAttributes;
  const matchingAttribute = attributes.find((a) => a.name === name);
  if (matchingAttribute) {
    matchingAttribute.value = value;
    return matchingAttribute.save({ transaction });
  }
  const attribute = {
    name,
    value,
    merchantAppSubscriptionId: appSubscription.id
  };
  const { AppSubscriptionAttributes } = clientDB;
  return BaseModel.create(AppSubscriptionAttributes, attribute, { transaction });
}
