const { BaseModel } = require('../../../utils/base-model');
const PosRegisterService = require('../register/register_service');

module.exports.createSubToLocationRelationsAndDefaultRegisters = async (
  subscriptionId,
  merchantAppSubscriptionToStockLocations,
  clientDB,
  transaction
) => {
  const { MerchantAppSubscriptionToStockLocation } = clientDB;
  const subToLocations = merchantAppSubscriptionToStockLocations.map((subToLocation) => ({
    ...subToLocation,
    merchantAppSubscriptionId: subscriptionId
  }));
  await BaseModel.bulkCreate(MerchantAppSubscriptionToStockLocation, subToLocations, { transaction });
  await PosRegisterService.createDefaultRegisterForStockLocations(subToLocations.map((l) => l.stockLocationId), clientDB, transaction);
};

module.exports.getFormattedTime = (date) => date.toTimeString().slice(0, 8);

module.exports.getFormattedDate = (date) => date.toISOString().replace(/T.*/, '');
