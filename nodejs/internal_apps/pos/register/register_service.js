const RegisterDAL = require('./dal/register_dal');
const RegisterActionLogDAL = require('./dal/register_action_logs_dal');
const RegisterMapper = require('./utilities/register_mapper');
const PayableInvoiceDAL = require('../../../invoice/dal/payable_invoice_dal');
const { REGISTER_STATUS, LOG_TYPES } = require('./utilities/constants');
const {
  OPERATION_WARNING_MESSAGE: {
    DEFAULT_REGISTER_UPDATE_REGISTER_OPEN,
    DEFAULT_REGISTER_UPDATE_DEFAULT_REGISTER_OPEN,
    DELETE_REGISTER_OPEN,
    DELETE_REGISTER_DEFAULT,
    REGISTER_DOESNT_EXIST,
    DEACTIVATE_OPEN_REGISTER,
    DEACTIVATE_MAIN_REGISTER,
    UPDATE_OPEN_REGISTER,
    REGISTER_SHOULD_BE_UNIQUE
  }
} = require('../../../utils/application_messages');
const { validateOpenRegister, validateCloseRegister, validateAddOrWithdrawCash } = require('./validation/register_validation');
const calc = require('../../../utils/calculation_utilities');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const SellInvoiceHelper = require('./sell_invoice_helper');
const ReturnInvoiceHelper = require('./return_invoice_helper');
const ParkInvoiceHelper = require('./park_invoice_helper');
const data_authenticator = require('../../../merchant/data_authenticator');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const { UnauthorizedLocationAccess } = require('../../../stock-location/error/unauthorized_location_access');
const PromotionService = require('../../promotions/promotions_services');
const LocationPermissionsUtility = require('../../../merchant/utils/location_permissions_utility');
const LayoutDal = require('../layouts/dal/layout_dal');
const { SequelizeUniqueConstraintError } = require('../../../utils/error/technical_errors/database/db_unique_constriant_error');
const { SEQUELIZE_UNIQUE_CONSTRAINT_ERROR } = require('../../../utils/error/constants/technical_error_objects');
const { handlePOSInvoiceRetries } = require('../../../utils/retries/handle-retries');
const { getDeepClone } = require('../../../utils/object_utility');
const ExpenseService = require('../../../expense/expense_service');

module.exports.createDefaultRegisterForStockLocations = async (stockLocations, clientDB, transaction) => {
  const defaultLayoutId = await LayoutDal.getFirstLayoutId(clientDB);
  const defaultRegisters = stockLocations.map((l) => RegisterMapper.buildDefaultRegister(l, defaultLayoutId));
  return RegisterDAL.createRegisters(defaultRegisters, clientDB, transaction);
};

module.exports.createRegister = async (register, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  if (!register.name) throw new Error('Register name is missing.');

  if (!register.stockLocationId) throw new Error('Register Location is missing');

  if (!register.PaymentMethodToRegisters.length) throw new Error('Payment methods not assigned to the register');

  const existRegister = await RegisterDAL.getRegisterByNameAndLocation(register, clientDB, transaction);

  if (existRegister) throw new Error(REGISTER_SHOULD_BE_UNIQUE);

  return RegisterDAL.createRegister(register, clientDB, transaction);
});

module.exports.getRegisterByNameAndLocation = async (register, clientDB) => RegisterDAL.getRegisterByNameAndLocation(register, clientDB);

module.exports.getLocationRegisters = async (stockLocationId, clientDB) => RegisterDAL.getLocationRegisters(stockLocationId, clientDB);

module.exports.areAllRegistersClosed = async (clientDB) => RegisterDAL.countOpenRegisters(clientDB);

module.exports.deleteRegisters = async (clientDB) => RegisterDAL.deleteAllRegisters(clientDB);

module.exports.getRegister = async (id, clientDB, skipAuth = false, transaction) => {
  const register = await RegisterDAL.getRegisterWithLocation(id, clientDB, transaction);

  if (!skipAuth) {
    const locationIds = await LocationPermissionsUtility
      .getStockLocationPermissionsForPOS(clientDB, transaction);
    const isAuthorizedUser = locationIds.find((locationId) => locationId === register.stockLocationId);

    if (!isAuthorizedUser) {
      throw new UnauthorizedLocationAccess(data_authenticator.getEmail(), clientDB.clientDBName);
    }
  }

  return register;
};

module.exports.activateOrDeactivateRegister = async (id, status, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const register = await RegisterDAL.getRegisterWithLocation(id, clientDB, transaction);

  if (!register) {
    throw new Error(REGISTER_DOESNT_EXIST);
  } else if (register.status === REGISTER_STATUS.OPENED && status === REGISTER_STATUS.INACTIVE) {
    throw new Error(DEACTIVATE_OPEN_REGISTER);
  } else if (register.isDefault && status === REGISTER_STATUS.INACTIVE) {
    throw new Error(DEACTIVATE_MAIN_REGISTER);
  }

  return RegisterDAL.updateRegisterStatus(id, status, clientDB, transaction);
});

module.exports.bookRegisterSellingSession = async (id, sellingSessionToken, forceBooking, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const register = await RegisterDAL.getRegisterWithLocation(id, clientDB, transaction);
  if (!register) {
    throw new Error(REGISTER_DOESNT_EXIST);
  }

  if (
    !forceBooking &&
      sellingSessionToken !== register.sellingSessionToken &&
      register.sellingSessionToken &&
      register.sellingSessionToken.length > 0
  ) {
    return false;
  }

  return RegisterDAL.updateRegisterSellingSessionToken(id, sellingSessionToken, clientDB, transaction);
});

module.exports.deleteRegister = async (id, clientDB) => {
  const register = await RegisterDAL.getRegisterWithLocation(id, clientDB);

  if (!register) throw new Error(REGISTER_DOESNT_EXIST);

  if (register.isDefault) throw new Error(DELETE_REGISTER_DEFAULT);

  if (register.status === REGISTER_STATUS.OPENED) throw new Error(DELETE_REGISTER_OPEN);

  return RegisterDAL.deleteRegister(id, clientDB);
};

module.exports.getRegisterById = async (id, clientDB) => RegisterDAL.getRegisterById(id, clientDB);

module.exports.makeRegisterDefault = async (id, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const register = await module.exports.getRegister(id, clientDB, true);
  if (register && register.status === REGISTER_STATUS.OPENED) {
    throw new Error(DEFAULT_REGISTER_UPDATE_REGISTER_OPEN);
  }
  const defaultRegister = await RegisterDAL
    .getDefaultRegisterInStockLocation(register.stockLocationId, clientDB, transaction);
  if (
    defaultRegister
      && defaultRegister.id !== id
      && defaultRegister.status === REGISTER_STATUS.OPENED
  ) {
    throw new Error(DEFAULT_REGISTER_UPDATE_DEFAULT_REGISTER_OPEN);
  }
  await RegisterDAL.makeRegisterDefault(id, clientDB, transaction);
  return module.exports.getRegister(id, clientDB, true, transaction);
});

module.exports.updateRegister = async (id, register, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const currRegister = await RegisterDAL.getRegisterAndLocation(id, clientDB, transaction);

  if (!currRegister) {
    throw new Error(REGISTER_DOESNT_EXIST);
  } else if (currRegister.status === REGISTER_STATUS.OPENED) {
    throw new Error(UPDATE_OPEN_REGISTER);
  }

  if (register.name && register.name.trim() === '') {
    delete register.name;
  }

  const existName = await RegisterDAL
    .getRegisterByNameAndLocation({ ...currRegister, ...register }, clientDB, transaction);

  if (existName && existName.id !== currRegister.id) {
    throw new Error(REGISTER_SHOULD_BE_UNIQUE);
  }

  return RegisterDAL.updateRegister(id, register, clientDB, transaction);
});

module.exports.openRegister = async (registerId, openedByUserId, openingAmount, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  await validateOpenRegister(registerId, openedByUserId, openingAmount, clientDB, transaction);

  const {
    name: registerName,
    StockLocation: { name: stockLocationName }
  } = await module.exports.getRegister(registerId, clientDB, false, transaction);
  const { name } = await MerchantDAL.getMerchantByUserId(openedByUserId);
  await RegisterDAL.createShift(registerId, registerName, stockLocationName, openedByUserId, name, openingAmount, clientDB, transaction);
  await RegisterDAL.openRegister(registerId, openedByUserId, clientDB, transaction);
  return module.exports.getRegister(registerId, clientDB, false, transaction);
});

module.exports.closeRegister = async (registerId, userId, closingLogs, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const shift = await RegisterDAL.getLastOpenShiftByRegisterId(registerId, clientDB, transaction);
  const shiftId = shift.id;
  const openActionLog = await RegisterActionLogDAL.getLastShiftOpenActionLog(shiftId, clientDB, transaction);
  const { userId: openedByUserId } = openActionLog;
  await validateCloseRegister(registerId, userId, openedByUserId, closingLogs, clientDB);
  let cashManagePaymentMethod = await RegisterDAL.getCashManagePaymentMethodOfRegister(registerId, clientDB, transaction);
  if (!cashManagePaymentMethod) {
    // get predefined paymentMethod and set to cashManagePayment
    cashManagePaymentMethod = {};
    cashManagePaymentMethod.id = 1;
  }

  const paymentMethodsWithAmounts = await calculateExpectedRegisterPaymentMethodsWithAmounts(
    shiftId,
    registerId,
    openActionLog,
    cashManagePaymentMethod.id,
    clientDB,
    transaction
  );
  const register = await module.exports.getRegister(registerId, clientDB, false, transaction);

  await RegisterDAL.closeRegister(registerId, clientDB, transaction);
  const { name } = await MerchantDAL.getMerchantByUserId(userId);
  const closingAmount = closingLogs.map((cLog) => cLog.amount).reduce((a, b) => a + b, 0);
  const registerPaymentMethods = register.PaymentMethodToRegisters.map((pmToRegiter) => pmToRegiter.PaymentMethod);
  const log = RegisterMapper.mapToRegisterActionLog(shiftId, userId, name, closingAmount, LOG_TYPES.CLOSE);
  RegisterMapper.mapClosingLogs(closingLogs, paymentMethodsWithAmounts, registerPaymentMethods);
  let isBalanced = 1;
  closingLogs.forEach((cLog) => {
    if (cLog.amount !== cLog.expectedAmount) {
      isBalanced = 0;
    }
  });
  await RegisterDAL.closeShift(shiftId, isBalanced, clientDB, transaction);

  log.RegisterClosingLogs = closingLogs;
  await RegisterActionLogDAL.insertCloseLog(log, clientDB, transaction);
  return RegisterDAL.getRegisterWithLocation(registerId, clientDB, transaction);
});

module.exports.addOrWithdrawCash = async (registerId, userId, type, notes, amount, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  await validateAddOrWithdrawCash(registerId, userId, amount, type, clientDB, transaction);
  const shift = await RegisterDAL.getLastOpenShiftByRegisterId(registerId, clientDB, transaction);
  const register = await RegisterDAL.getRegisterWithPaymentMethodsToRegister(registerId, clientDB, transaction);
  const shiftId = shift.id;
  const paymentMethodToRegister = register.PaymentMethodToRegisters.find((pr) => pr.isCashManagement);
  const { name } = await MerchantDAL.getMerchantByUserId(userId);
  const log = RegisterMapper.mapToRegisterActionLog(shiftId, userId, name, amount, type, paymentMethodToRegister.paymentMethodId, notes);
  return RegisterActionLogDAL.insertActionLog(log, clientDB, transaction);
});

module.exports.sell = async (registerId, invoice, clientDB) => {
  const invoicePayload = getDeepClone(invoice);
  const register = await RegisterDAL.getRegisterById(registerId, clientDB);
  const transaction = await clientDB.sequelize.transaction();

  let response;
  try {
    response = await SellInvoiceHelper.createPosSellInvoice(
      register, invoice, clientDB, transaction
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    if (err.toString() === SEQUELIZE_UNIQUE_CONSTRAINT_ERROR.MSG) {
      console.log('retry with new transaction');
      response = await handlePOSInvoiceRetries(
        () => this.sell(registerId, invoicePayload, clientDB), err, SequelizeUniqueConstraintError
      );

      if (!response) throw err;
    } else {
      throw err;
    }
  }

  return response;
};

module.exports.park = async (registerId, invoice, clientDB) => {
  const register = await RegisterDAL.getRegisterById(registerId, clientDB);
  return ParkInvoiceHelper.parkInvoice(register, invoice, clientDB);
};

module.exports.deletePark = async (invoiceId, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  await PromotionService.deleteInvoicPromotionsByInvoiceId(invoiceId, clientDB, transaction);
  return InvoiceDAL.deleteParkedSalesInvoice(invoiceId, clientDB);
});

module.exports.returnOrder = async (registerId, invoice, clientDB) => {
  const register = await RegisterDAL.getRegisterById(registerId, clientDB);
  return clientDB.sequelize.transaction(async (transaction) => ReturnInvoiceHelper.createPosReturnInvoice(register, invoice, clientDB, transaction));
};

async function calculateExpectedRegisterPaymentMethodsWithAmounts(shiftId, registerId, registerOpeningLog, defaultCashPaymentMethodId, clientDB, transaction) {
  const { createdAt: registerOpenTime, amount: openingAmount = 0 } = registerOpeningLog;
  const paymentMethodsWithTotalAmounts = await listPaymentMethodsTotalSinceRegisterOpen(registerId, registerOpenTime, clientDB, transaction);
  let defaultCashWithTotalAmount = paymentMethodsWithTotalAmounts.find((mTotal) => mTotal.paymentMethodId === defaultCashPaymentMethodId);
  if (!defaultCashWithTotalAmount) {
    defaultCashWithTotalAmount = { paymentMethodId: defaultCashPaymentMethodId, totalAmount: 0 };
    paymentMethodsWithTotalAmounts.push(defaultCashWithTotalAmount);
  }

  const additions = await RegisterActionLogDAL.calculateAdditionsFromRegisterOpening(shiftId, registerOpenTime, clientDB);
  const subtractions = await RegisterActionLogDAL.calculateWithdrawalsFromRegisterOpening(shiftId, registerOpenTime, clientDB);

  defaultCashWithTotalAmount.totalAmount = calc.add(
    openingAmount,
    calc.add(defaultCashWithTotalAmount.totalAmount, calc.subtract(additions, subtractions))
  );
  return paymentMethodsWithTotalAmounts;
}

async function listPaymentMethodsTotalSinceRegisterOpen(registerId, registerOpenTime, clientDB, transaction) {
  const responses = await Promise.all([
    PayableInvoiceDAL.listPaymentMethodsIdsWithAmountsSinceRegisterOpen(registerId, registerOpenTime, clientDB, transaction),
    ExpenseService.getExpensesBetween({
      startDateTime: registerOpenTime,
      endDateTime: new Date(),
      cashManagementRegisterId: registerId,
    }, clientDB, transaction)
  ]);
  let payments = responses[0];
  const expenses = responses[1];
  const expensesTotalAgainstPaymentId = expenses.reduce((accumulatedObj, expense) => {
    accumulatedObj[expense.paymentMethodId] = calc.addWith2DecimalPrecision(
      accumulatedObj[expense.paymentMethodId] || 0,
      expense.amount
    );
    return accumulatedObj;
  }, {});
  const paymentIdsCouldBePaidByDebit = payments.filter((p) => p.PaymentToPayableInvoices.length === 1).map((p) => p.id);
  const paymentsIdsToExclude = await PayableInvoiceDAL.listPaymentIdsPaidByCustomerDebitAndNotLinkedToRegister(
    paymentIdsCouldBePaidByDebit,
    registerId,
    clientDB,
    transaction
  );
  payments = payments.filter((p) => paymentsIdsToExclude.indexOf(p.id) < 0);

  const paymentMethodIds = Array.from(new Set(
    payments.map(
      (p) => p.paymentMethodId
    ).concat(
      Object.keys(expensesTotalAgainstPaymentId).map((ele) => +ele)
    )
  ));
  const result = [];
  paymentMethodIds.forEach((paymentMethodId) => {
    let totalAmountFromPayments = 0;
    const totalExpensesForPaymentMethod = expensesTotalAgainstPaymentId[paymentMethodId];
    payments
      .filter((p) => p.paymentMethodId === paymentMethodId)
      .map((p) => p.paidAmount)
      .forEach((paidAmount) => {
        totalAmountFromPayments = calc.addWith2DecimalPrecision(paidAmount, totalAmountFromPayments);
      });
    const totalAmount = calc.subtractWith2DecimalPrecision(totalAmountFromPayments, totalExpensesForPaymentMethod);
    result.push({ paymentMethodId, totalAmount });
  });
  return result;
}

module.exports.calculateExpectedRegisterAmount = async (registerId, openActionLog, clientDB, transaction, paymentMethodId) => {
  const cashManagePaymentMethod = !isNaN(+paymentMethodId)
    ? { id: +paymentMethodId }
    : await RegisterDAL.getCashManagePaymentMethodOfRegister(registerId, clientDB, transaction);
  const shift = await RegisterDAL.getLastOpenShiftByRegisterId(registerId, clientDB, transaction);
  const shiftId = shift.id;
  const paymentMethodsWithAmounts = await calculateExpectedRegisterPaymentMethodsWithAmounts(
    shiftId,
    registerId,
    openActionLog,
    cashManagePaymentMethod.id,
    clientDB,
    transaction
  );
  const neededMethodWithAmount = paymentMethodsWithAmounts.find(
    (pWithTotalAmount) => pWithTotalAmount.paymentMethodId === cashManagePaymentMethod.id
  );
  return neededMethodWithAmount.totalAmount;
};

module.exports.getRegisterBalance = async (registerId, clientDB, paymentMethodId) => {
  const shift = await RegisterDAL.getLastOpenShiftByRegisterId(registerId, clientDB);
  const shiftId = shift.id;
  const openActionLog = await RegisterActionLogDAL.getLastShiftOpenActionLog(shiftId, clientDB);
  return module.exports.calculateExpectedRegisterAmount(registerId, openActionLog, clientDB, null, paymentMethodId);
};

module.exports.getParkedSalesInvoices = async (registerId, limit, offset, clientDB) => ParkInvoiceHelper.getParkedInvoicesInRegister(registerId, limit, offset, clientDB);
