const { REGISTER_STATUS } = require('../utilities/constants');
const { PAYABLE_INVOICE_TAX_TYPE: { INCLUSIVE, EXCLUSIVE } } = require('../../../../invoice/utils/constants');
const { OPERATION_FAILURE_MESSAGE: { INVALID_USER_ID } } = require('../../../../utils/application_messages');

module.exports.validatePosInvoice = (register, invoice, variants, stockLocation, user, customer, clientDBName, invoiceId) => {
  if (!register) {
    throw new Error('register not found');
  }
  if (register.status !== REGISTER_STATUS.OPENED) {
    throw new Error('register is not opened');
  }
  if (!invoice.taxation || ![INCLUSIVE, EXCLUSIVE].includes(invoice.taxation)) {
    throw new Error(`taxation is not valid. valid values: ${[INCLUSIVE, EXCLUSIVE]}`);
  }
  if (invoice.customerId) {
    if (!customer) {
      throw new Error('customer not found');
    }
  }
  if (!invoice.userId) {
    throw new Error('userId is not provided');
  } else if (!user || user.schemaName !== clientDBName) {
    throw new Error(INVALID_USER_ID);
  }

  if (!invoice.products || invoice.products.length === 0) {
    throw new Error('products can not be empty.');
  }

  if (!invoiceId) {
    invoice.products.forEach((product) => {
      const matchingVariant = variants.find((variant) => variant.sku === product.sku);
      if (!matchingVariant) {
        throw new Error(`product with sku: ${product.sku} is not found`);
      }
    });
  }

  if (stockLocation && !stockLocation.isActive) {
    throw new Error('Stock location is not active');
  }
};
