const { BusinessError } = require('../../../utils/error/business_error');

const PRICE_LESS_THAN_COST = {
  NAME: 'PRICE LESS THAN COST'
};

class PriceLessThanCost extends BusinessError {
  constructor(
    message,
    clientDatabaseName
  ) {
    PRICE_LESS_THAN_COST.MSG = message;
    PRICE_LESS_THAN_COST.CODE = message;
    super(PRICE_LESS_THAN_COST);
    this.clientDatabaseName = clientDatabaseName;
  }

  printDetails() {
    super.printDetails();
    console.error(`message = ${PRICE_LESS_THAN_COST.MSG} clientDatabaseName = ${this.clientDatabaseName}`);
  }
}

module.exports = {
  PriceLessThanCost
};
