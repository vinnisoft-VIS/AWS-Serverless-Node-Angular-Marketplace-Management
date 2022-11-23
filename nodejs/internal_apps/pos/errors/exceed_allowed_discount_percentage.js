const { BusinessError } = require('../../../utils/error/business_error');

const EXCEED_ALLOWED_DISCOUNT_PERCENTAGE = {
  NAME: 'Exceed Allowed Discount Percentage'
};

class ExceedAllowedDiscountPercentage extends BusinessError {
  constructor(
    message,
    clientDatabaseName
  ) {
    EXCEED_ALLOWED_DISCOUNT_PERCENTAGE.MSG = message;
    EXCEED_ALLOWED_DISCOUNT_PERCENTAGE.CODE = message;
    super(EXCEED_ALLOWED_DISCOUNT_PERCENTAGE);
    this.clientDatabaseName = clientDatabaseName;
  }

  printDetails() {
    super.printDetails();
    console.error(`message = ${EXCEED_ALLOWED_DISCOUNT_PERCENTAGE.MSG} clientDatabaseName = ${this.clientDatabaseName}`);
  }
}

module.exports = {
  ExceedAllowedDiscountPercentage
};
