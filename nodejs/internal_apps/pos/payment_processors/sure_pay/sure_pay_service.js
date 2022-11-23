const { mapToPaymentProcess } = require('../../register/utilities/sell_invoice_mapper');
const PaymentProcessDAL = require('../../invoices/dal/payment_process_dal');

module.exports.saveFailedPayment = async (surePayResponse, clientDB) => {
  console.log(`failed payment for ${clientDB.clientDBName}: ${surePayResponse}`);
  if (!isResponseValid(surePayResponse)) {
    console.log(`sure pay response: '${surePayResponse}' is not valid`);
    return {};
  }
  const mappedProcess = mapToPaymentProcess({ surePayResponse });
  if (mappedProcess.success) {
    console.log(`sure pay response: '${surePayResponse}' is not a failure`);
    return {};
  }
  return PaymentProcessDAL.createPaymentProcess(mappedProcess, clientDB);
};

function isResponseValid(surePayResponse = '') {
  return surePayResponse.charAt(0) !== String.fromCharCode(0x02) ||
    surePayResponse.charAt(surePayResponse.length - 1) !== String.fromCharCode(0x03) ||
    surePayResponse.split('|').length === 10;
}
