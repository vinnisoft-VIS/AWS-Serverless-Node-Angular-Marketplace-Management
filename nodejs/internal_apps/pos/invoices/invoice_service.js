const InvoiceDAL = require('./dal/invoice_dal');
const PayableUtil = require('../../../invoice/utils/payable_invoice_utilities');
const InvoiceUtil = require('../../../invoice/utils/invoice_utilities');
const ParkInvoiceHelper = require('../register/park_invoice_helper');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const RegisterDAL = require('../register/dal/register_dal');
const { add } = require('../../../utils/calculation_utilities');

function mapPromotion(variantToInvoices, invoicePromotions) {
  return variantToInvoices.map((invoiceVariant) => {
    let promotionAmount;
    if (invoiceVariant.PromotionInvoiceVariant) {
      if (invoiceVariant.PromotionInvoiceVariant.invoicePromotionId) {
        const { invoicePromotionId } = invoiceVariant.PromotionInvoiceVariant;
        const matchingPromotion = invoicePromotions.find((ip) => ip.id === invoicePromotionId);
        invoiceVariant.promotionName = matchingPromotion ? matchingPromotion.name : '';
      } else {
        const invoicePromotion = invoicePromotions.find((ip) => ip.isAllProducts);
        invoiceVariant.promotionName = invoicePromotion ? invoicePromotion.name : '';
      }
      promotionAmount = invoiceVariant.PromotionInvoiceVariant.calculatedAmount;

      invoiceVariant.promotionAmount = promotionAmount;
      delete invoiceVariant.PromotionInvoiceVariant;
    }
    return invoiceVariant;
  });
}

module.exports.mapPromotion = mapPromotion;

function getTotalPromotionsAmount(variantToInvoices) {
  return variantToInvoices.map((invoiceVariant) => +invoiceVariant.promotionAmount)
    .reduce((a, b) => add(a, b), 0);
}

module.exports.getPosReturnInvoicesBySaleInvId = async (saleInvoiceId, clientDB) => InvoiceDAL.getPosReturnInvoices(saleInvoiceId, clientDB);
module.exports.getPOSInvoiceById = async (saleInvoiceId, clientDB, transaction) => {
  const posInvoice = await InvoiceDAL.getPOSInvoiceById(saleInvoiceId, clientDB, transaction)
    .then((i) => (i ? i.toJSON() : i));
  posInvoice.VariantToInvoices = mapPromotion(posInvoice.VariantToInvoices, posInvoice.InvoicePromotions);
  posInvoice.TotalPromotionsAmount = getTotalPromotionsAmount(posInvoice.VariantToInvoices);

  if (posInvoice.registerId && !posInvoice.registerJson) {
    const register = await RegisterDAL.getRegisterByIdEvenIfDeletedWithLocation(posInvoice.registerId, clientDB, transaction);
    posInvoice.registerJson = JSON.stringify(register);
  }

  if (posInvoice.saleInvoiceId) {
    posInvoice.saleInvoiceNumber = await InvoiceDAL
      .getInvoiceNumber(posInvoice.saleInvoiceId, clientDB);
  }

  if (posInvoice.userId) {
    posInvoice.userName = await MerchantDAL.getMerchantName({ id: posInvoice.userId });
  }

  return InvoiceUtil.addPrefixToInvoiceNumber(posInvoice);
};

module.exports.getCreatedPOSInvoiceById = async (invoiceId, clientDB, transaction) => {
  let result = await InvoiceDAL.getPOSInvoiceById(invoiceId, clientDB, transaction)
    .then((i) => (i ? i.toJSON() : i));
  result.VariantToInvoices = mapPromotion(result.VariantToInvoices, result.InvoicePromotions);
  result.TotalPromotionsAmount = getTotalPromotionsAmount(result.VariantToInvoices);

  if (result) {
    result.PayableInvoice.payableInvoices = PayableUtil.adjustPayablePayments(result.PayableInvoice.PaymentToPayableInvoices, result.type, result.PayableInvoice.totalBeforePayment);
  }

  if (result.saleInvoiceId) result.saleInvoiceNumber = await InvoiceDAL.getInvoiceNumber(result.saleInvoiceId, clientDB);

  if (result.userId) result.userName = await MerchantDAL.getMerchantName({ id: result.userId });

  result = InvoiceUtil.addPrefixToInvoiceNumber(result);
  return result;
};

module.exports.retrieveParkedInvoice = async (invoiceId, clientDB) => ParkInvoiceHelper.getParkedInvoice(invoiceId, clientDB);

module.exports.getLastInvoiceNumber =
 async (type, clientDB) => InvoiceDAL.getLastInvoiceNumber(type, clientDB);
