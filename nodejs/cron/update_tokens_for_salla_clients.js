const { closeCommonDBConnection } = require('../models/common');
const { getClientDB, closeClientDBConnection } = require('../models/client');
const MerchantDAL = require('../merchant/dal/merchant_dal');
const SubscriptionService = require('../app/subscription/app_subscription_service');
const { APP_NAME } = require('../app/constants');
const SallaHttpQueryService = require('../integration/apps/salla/services/http_query_service');
const { BaseModel } = require('../utils/base-model');
const { invokeLambdaAsyncPromisified } = require('../utils/lambda_utility');

const WEEK_IN_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;
// designed to run every 5 days.
module.exports.updateTokens = async () => {
  const merchants = await MerchantDAL.getSchemaNameForMerchantsMainAccounts();
  const schemaNames = merchants.map((merchant) => merchant.schemaName) || [];
  const segments = [];
  const chunk = 400;
  for (let i = 0; i < schemaNames.length; i += chunk) {
    segments.push(schemaNames.slice(i, i + chunk));
  }
  console.log(segments);
  await Promise.all(segments.map((segment) => {
    const payload = { schemaNames: segment };
    return invokeLambdaAsyncPromisified('updateSallaTokensForSegment', payload);
  }));
  await closeCommonDBConnection();
};

module.exports.updateTokensForClientSegment = async ({ schemaNames = [] }) => {
  for (const schema of schemaNames) {
    let clientDB;
    try {
      clientDB = await getClientDB(schema);
      const sallaSubscription = await SubscriptionService
        .getMerchantSubscriptionByAppName(APP_NAME.SALLA, clientDB);
      if (sallaSubscription && shouldUpdateToken(sallaSubscription.AppSubscriptionAttributes)) {
        const attributes = sallaSubscription.AppSubscriptionAttributes;
        const refreshTokenAttribute = attributes.find((attribute) => attribute.name === 'refreshToken');
        const res = await SallaHttpQueryService.fetchAccessTokenFromRefreshToken(refreshTokenAttribute.value);
        await clientDB.sequelize.transaction(async (transaction) => {
          await updateAttributes(sallaSubscription, res, clientDB, transaction);
        });
        console.log(`new Token has been created for merchant db '${schema}'`);
      } else if (sallaSubscription) {
        console.log(`merchant with db name: '${schema}' doesn't need to update`);
      }
    } catch (e) {
      console.error(`failed to update salla token for merchant db ${schema}, error ==> ${JSON.stringify(e)}`);
    } finally {
      await closeClientDBConnection(clientDB);
    }
  }
  await closeCommonDBConnection();
};

function shouldUpdateToken(attributes = []) {
  const authType = attributes.find((attribute) => attribute.name === 'type');
  const expirationAttribute = attributes
    .find((attribute) => attribute.name === 'accessTokenExpiration');
  return authType
    && authType.value === 'oauth2'
    && expirationAttribute
    && new Date(+expirationAttribute.value).valueOf() - WEEK_IN_MILLISECONDS < Date.now();
}

async function updateAttributes(subscription = {}, response = {}, clientDB, transaction) {
  const {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn = 0
  } = response;
  await handleAttribute(subscription, 'accessToken', accessToken, clientDB, transaction);
  await handleAttribute(subscription, 'refreshToken', refreshToken, clientDB, transaction);
  await handleAttribute(subscription, 'accessTokenExpiration', new Date(Date.now() + (expiresIn * 1000)).valueOf(), clientDB, transaction);
}

async function handleAttribute(subscription, name, newValue, clientDB, transaction) {
  const { AppSubscriptionAttributes: attributes = [] } = subscription;
  const matchingAttribute = attributes.find((a) => a.name === name);
  if (matchingAttribute) {
    console.log(matchingAttribute.name, 'before:', matchingAttribute.value);
    console.log(matchingAttribute.name, 'after:', newValue);
    matchingAttribute.value = newValue;
    return matchingAttribute.save({ transaction });
  }
  const { AppSubscriptionAttributes } = clientDB;
  const attribute = {
    name,
    value: newValue,
    merchantAppSubscriptionId: subscription.id
  };
  console.log('creating: ', JSON.stringify(attribute));
  return BaseModel.create(AppSubscriptionAttributes, attribute, { transaction });
}
