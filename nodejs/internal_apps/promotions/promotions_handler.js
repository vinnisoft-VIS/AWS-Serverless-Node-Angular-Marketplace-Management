const PromotionService = require('./promotions_services');
const { HttpUtility } = require('../../utils/http_utility');
const {
  validatePromotionCreate,
  validatePromotionUpdate,
  validateExistingPromotion,
  validateDeletedPromotion
} = require('./validation/promotion_validation');
const LambdaUtility = require('../../utils/lambda_utility');
const { getClientDB } = require('../../models/client');

module.exports.create = async (event, context, callback, clientDB) => {
  try {
    if (event.importProducts) {
      const { schemaName } = event;
      const dbConnection = await getClientDB(schemaName);
      const imported = await PromotionService.import(event, dbConnection);
      return HttpUtility.respondSuccess(imported, 'Promotion imported Successfully');
    }
    const promotionBody = JSON.parse(event.body);
    await validatePromotionCreate(promotionBody, clientDB);
    const promotion = await PromotionService.createSimplePromotion(promotionBody, clientDB);
    if (promotionBody.isImport) {
      const processImportEvent = {
        ...event,
        importProducts: true,
        promotion,
        schemaName: clientDB.clientDBName
      };
      await LambdaUtility.invokeLambdaAsyncPromisified('processCreatePromotion', processImportEvent);
    }
    return HttpUtility.respondSuccess(promotion, 'Promotion was added Successfully');
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getPromotionList = async (event, context, callback, clientDB) => {
  try {
    const { queryStringParameters } = event;
    const promotions = await PromotionService.getPromotionList(queryStringParameters, clientDB);

    return HttpUtility.respondSuccess(promotions);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.update = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const promotionBody = JSON.parse(event.body);

    await validatePromotionUpdate(id, promotionBody, clientDB);
    const promotion = await PromotionService.updateSimplePromotion(id, promotionBody, clientDB);
    return HttpUtility.respondSuccess(promotion, 'Promotion was Updated Successfully');
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.searchProductVariants = async (event, context, callback, clientDB) => {
  try {
    const { query } = event.queryStringParameters;
    const variants = await PromotionService.searchProductVariants(query, clientDB);
    return HttpUtility.respondSuccess(variants);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
module.exports.searchActiveStockLocations = async (event, context, callback, clientDB) => {
  try {
    const { name } = event.queryStringParameters;
    const locations = await PromotionService.searchActiveStockLocations(name, clientDB);
    return HttpUtility.respondSuccess(locations);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getPromotionById = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const promotion = await PromotionService.getPromotionById(id, clientDB);
    validateExistingPromotion(promotion);
    return HttpUtility.respondSuccess(promotion);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.deletePromotions = async (event, context, callback, clientDB) => {
  try {
    const { ids } = event.queryStringParameters;

    const promotionIds = ids.split(',').map((id) => parseInt(id, 10));
    for (let i = 0; i < promotionIds.length; i++) {
      const id = promotionIds[i];
      const promotion = await PromotionService.getPromotionById(id, clientDB);
      validateDeletedPromotion(promotion);
    }
    const result = await PromotionService.deletePromotions(promotionIds, clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.checkIfIntersectedProductsExists = async (event, context, callback, clientDB) => {
  try {
    const promotionBody = JSON.parse(event.body);
    const promotionId = promotionBody.id ? promotionBody.id : null;

    const products = await PromotionService
      .getDuplicatedProductsExistsInPromotionBody(promotionBody, promotionId, clientDB);
    return HttpUtility.respondSuccess(products);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
