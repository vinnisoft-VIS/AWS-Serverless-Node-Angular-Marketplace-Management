const qs = require('querystring');
const { HttpUtility } = require('../../../utils/http_utility');
const POSLocationsService = require('./pos_locations_service');

module.exports.getPOSLocationsWithRegisters = async (event, context, callback, clientDB) => {
  const { includeInactive } = event.queryStringParameters || {};
  try {
    const locations = await POSLocationsService
      .getPOSLocationsWithRegisters(clientDB, includeInactive);
    return HttpUtility.respondSuccess(locations);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.searchVariants = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters || {};
    const { query, limit, offset } = event.queryStringParameters || {};
    const variants = await POSLocationsService.searchVariants(id, query, clientDB,
      parseInt(limit, 10), parseInt(offset, 10));
    return HttpUtility.respondSuccess(variants);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getAllVariantsByLocationId = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters || {};
    const variants = await POSLocationsService.getAllVariantsByLocationId(id, clientDB);
    return HttpUtility.respondSuccess(variants);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getProductsWithoutPriceInPosLocations = async (
  event, context, callback, clientDB
) => {
  try {
    const res = await POSLocationsService.getProductsWithoutPriceInPosLocations(clientDB);
    return HttpUtility.respondSuccess(res);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getVariantByScannerCode = async (event, context, callback, clientDB) => {
  try {
    let { code, id } = event.pathParameters;
    code = qs.unescape(code);
    const variant = await POSLocationsService
      .getVariantbyScannerCode(code, id, clientDB);
    return HttpUtility.respondSuccess(variant);
  } catch (e) {
    if (e.message && e.message.startsWith('You can’t sell')) return HttpUtility.respondSuccess({}, e.message, true);

    return HttpUtility.respondFailure(e, e.message);
  }
};
