const { BaseModel } = require('../../../../utils/base-model');

module.exports.createPaymentProcess = async (paymentProcess, clientDB, transaction) => {
  const { PaymentProcess } = clientDB;
  return BaseModel.create(PaymentProcess, paymentProcess, { transaction });
};
