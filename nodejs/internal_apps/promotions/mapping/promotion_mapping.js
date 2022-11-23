const constants = require('../constants');
const { convertDateStringToFullDate } = require('../../../utils/commonUtils');

module.exports.mapPromotionsStatus = (promotions) => promotions.map((promotion) => {
  promotion.status = getPromotionStatus(promotion);
  return promotion;
});

module.exports.mapPromotionStatus = (promotion) => {
  promotion.status = getPromotionStatus(promotion);
  return promotion;
};

function getPromotionStatus(promotion) {
  const now = new Date();
  const formattedNow = new Date(now);
  const formattedStartDate = new Date(promotion.startDate);
  const formattedEndDate = new Date(promotion.endDate);
  if (formattedStartDate.getTime() > formattedNow.getTime()) {
    return constants.PROMOTION_STATUSES.UPCOMING;
  }
  if (
    formattedStartDate.getTime() <= formattedNow.getTime()
    && (!promotion.endDate || formattedEndDate.getTime() >= formattedNow.getTime())
  ) {
    return constants.PROMOTION_STATUSES.ACTIVE;
  }
  if (formattedEndDate.getTime() < formattedNow.getTime()) {
    return constants.PROMOTION_STATUSES.EXPIRED;
  }
  return '';
}
