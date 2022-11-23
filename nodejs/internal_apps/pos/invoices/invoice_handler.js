const { INVOICES_TYPES } = require('../../../invoice/utils/constants');
const { HttpUtility } = require('../../../utils/http_utility');
const InvoiceService = require('./invoice_service');
const PayableUtil = require('../../../invoice/utils/payable_invoice_utilities');
const CountryService = require('../../../lookups/country_service');
const OrderInvoiceService = require('../../../order/invoice/order_invoice_service');

// return Invoices By saleInoviceID
module.exports.getReturnInvoicesBySaleInvoiceId = async (event, context, callback, clientDB) => {
  try {
    const { saleInvoiceId } = event.pathParameters;
    const posReturnInvoices = await InvoiceService.getPosReturnInvoicesBySaleInvId(saleInvoiceId, clientDB);
    return HttpUtility.respondSuccess(posReturnInvoices);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getPosInvoice = async (event, context, callback, clientDB) => {
  try {
    const { invoiceId } = event.pathParameters;
    const posInvoice = await OrderInvoiceService.getOrderInvoiceById(invoiceId, clientDB, undefined, true);
    return HttpUtility.respondSuccess(posInvoice);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getParkedInvoice = async (event, context, callback, clientDB) => {
  try {
    const { invoiceId } = event.pathParameters;
    const posInvoice = await InvoiceService.retrieveParkedInvoice(invoiceId, clientDB);
    return HttpUtility.respondSuccess(posInvoice);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getLastInvoiceNumber = async (event, context, callback, clientDB) => {
  try {
    const { type } = event.pathParameters || {};
    let invoiceType;
    if (type === 'Sell') {
      invoiceType = INVOICES_TYPES.POS_SALE;
    } else if (type === 'Return') {
      invoiceType = INVOICES_TYPES.POS_RETURN;
    } else {
      throw new Error('invoice type is not valid');
    }

    const invoiceNumber = await InvoiceService.getLastInvoiceNumber(invoiceType, clientDB);
    return HttpUtility.respondSuccess(invoiceNumber);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};
