const { HttpUtility } = require('../../../utils/http_utility');
const SurePayService = require('./sure_pay/sure_pay_service');
const { PAYMENT_PROCESSOR: { SURE_PAY } } = require('./constants');

module.exports.saveFailedPayment = async (event, context, callback, clientDB) => {
  try {
    const { processor } = event.pathParameters;
    const response = event.body;
    // We only have sure-pay now.
    let paymentProcess = {};
    switch (processor) {
      case SURE_PAY: {
        paymentProcess = await SurePayService.saveFailedPayment(response, clientDB);
        break;
      }
      default:
        break;
    }
    return HttpUtility.respondSuccess(paymentProcess);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};
