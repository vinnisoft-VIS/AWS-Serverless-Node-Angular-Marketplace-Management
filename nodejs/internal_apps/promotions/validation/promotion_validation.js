const {
  OPERATION_FAILURE_MESSAGE: {
    PROMOTION_WRONG_DATA,
    PROMOTION_NOT_FOUND,
    PRODUCT_ADDED_TO_ANOTHER_PROMOTION,
    PROMOTION_EXPIRED_DATE,
    PROMOTION_REQUIRED,
    ALL_PRODUCT_PROMOTION_IS_ACTIVE,
    IS_ACTIVE_PROMOTION_DELETE,
    ARE_ACTIVE_PROMOTIONS
  }
} = require('../../../utils/application_messages');
const PromotionService = require('../promotions_services');
const { convertDateStringToFullDate } = require('../../../utils/commonUtils');

const checkValidData = async (promotion, id, startDate, endDate, clientDB, now, method = 'add') => {
  if (!promotion) {
    throw new Error(PROMOTION_NOT_FOUND);
  }
  const requiredFields = ['name', 'startDate', 'discountType'];
  requiredFields.forEach((rf) => {
    if (!promotion[rf]) {
      throwRequiredError(rf);
    }
  });

  if (!promotion.isAllProducts) {
    if ((!promotion.PromotionVariants || !promotion.PromotionVariants.length) && !promotion.isImport) {
      throwRequiredError('PromotionVariants');
    }
  }
  if (!promotion.isAllLocations) {
    if (!promotion.PromotionStockLocations || !promotion.PromotionStockLocations.length) {
      throwRequiredError('PromotionStockLocations');
    }
  }

  if (promotion.discountType !== 'percentage' && promotion.discountType !== 'fixed') {
    throw new Error(`discountType ${PROMOTION_WRONG_DATA}`);
  }
  const allProductsPromo = await PromotionService
    .getIntersectedAllProductsPromotion(promotion, id, clientDB);

  if (allProductsPromo && promotion.isAllProducts && method !== 'update') {
    throw new Error(
      ALL_PRODUCT_PROMOTION_IS_ACTIVE
    );
  }

  if (!startDate.getDate()) {
    throw new Error(`startDate ${PROMOTION_WRONG_DATA}`);
  }

  if (convertDateStringToFullDate(startDate) < now || convertDateStringToFullDate(endDate) < now) {
    throw new Error(PROMOTION_EXPIRED_DATE);
  }
};

function throwRequiredError(fieldName) {
  throw new Error(`${fieldName} ${PROMOTION_REQUIRED}`);
}

module.exports.validatePromotionCreate = async (promotion, clientDB) => {
  const now = new Date();
  const startDate = new Date(promotion.startDate);
  const endDate = new Date(promotion.endDate);
  await checkValidData(promotion, null, startDate, endDate, clientDB, now);
};

module.exports.validatePromotionUpdate = async (id, promotion, clientDB) => {
  const now = new Date();
  const startDate = new Date(promotion.startDate);
  const endDate = new Date(promotion.endDate);

  // let activePromotion = await PromotionService.checkIsActive(clientDB, id);

  // if(activePromotion)
  //   throw new Error(IS_ACTIVE_PROMOTION);

  await checkValidData(promotion, id, startDate, endDate, clientDB, now, 'update');
};

module.exports.validateExistingPromotion = (promotion) => {
  if (!promotion) {
    throw new Error(PROMOTION_NOT_FOUND);
  }
};

module.exports.validateDeletedPromotion = (promotion) => {
  if (!promotion) {
    throw new Error(PROMOTION_NOT_FOUND);
  }
  const now = new Date();
  const startDate = new Date(promotion.startDate);
  const endDate = new Date(promotion.endDate);
  if (startDate < now && (!promotion.endDate || endDate > now)) {
    throw new Error(`${promotion.name} ${IS_ACTIVE_PROMOTION_DELETE}`);
  }
};

module.exports.validateNoActivePromotions = async (clientDB) => {
  const areActivePromotions = await PromotionService.checkIsActive(clientDB);
  if (areActivePromotions) {
    return ARE_ACTIVE_PROMOTIONS;
  }
  return false;
};
