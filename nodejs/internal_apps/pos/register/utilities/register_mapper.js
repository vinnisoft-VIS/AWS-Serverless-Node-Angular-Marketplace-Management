const { LOG_TYPES } = require('./constants');

const buildDefaultRegister = (stockLocationId, defaultLayoutId = 1) => ({
  name: 'Register A',
  status: 'Closed',
  isDefault: true,
  stockLocationId,
  layoutId: defaultLayoutId
});

const mapToRegisterActionLog = (shiftId, userId, username, amount, type, paymentMethodId, notes) => ({
  shiftId,
  userId,
  username,
  amount,
  type,
  paymentMethodId,
  notes
});

const mapClosingLogs = (clientClosingLogs, paymentMethodsWithAmounts, registerPaymentMethods) => {
  registerPaymentMethods.forEach((pm) => {
    const found = clientClosingLogs.find((cLog) => cLog.paymentMethodId === pm.id);
    if (!found) {
      clientClosingLogs.push({ amount: 0, paymentMethodId: pm.id, paymentMethodName: pm.name });
    } else {
      found.paymentMethodName = pm.name;
    }
  });

  clientClosingLogs.forEach((cLog) => {
    const pmWithAmount = paymentMethodsWithAmounts.find((p) => p.paymentMethodId === cLog.paymentMethodId);
    cLog.expectedAmount = pmWithAmount ? pmWithAmount.totalAmount : 0;
  });
};

module.exports = {
  buildDefaultRegister,
  mapToRegisterActionLog,
  mapClosingLogs
};
