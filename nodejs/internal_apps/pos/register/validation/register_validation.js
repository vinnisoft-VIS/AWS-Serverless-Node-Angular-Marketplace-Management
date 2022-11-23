const MerchantDAL = require('../../../../merchant/dal/merchant_dal');
const { REGISTER_STATUS, LOG_TYPES } = require('../utilities/constants');
const RegisterDAL = require('../dal/register_dal');
const RegisterService = require('../register_service');
const RegisterActionLogDAL = require('../dal/register_action_logs_dal');
const {
  OPERATION_FAILURE_MESSAGE: {
    OPEN_INACTIVE_REGISTER,
    CLOSE_INACTIVE_REGISTER,
    REGISTER_NOT_FOUND,
    OPEN_AN_OPENED_REGISTER,
    CLOSE_A_CLOSED_REGISTER,
    OPEN_REGISTER_WITH_NEGATIVE_AMOUNT,
    CLOSE_REGISTER_WITH_NEGATIVE_AMOUNT,
    INVALID_USER_ID,
    OPEN_REGISTER_EXIST,
    PAYMENT_METHOD_DOES_NOT_BELONG_TO_REGISTER
  }
} = require('../../../../utils/application_messages');
const { DATA_PERMISSION_TYPES } = require('../../../../utils/constants/constants');
const { UNAUTHORIZED } = require('../../../../utils/error/constants/ERRORS');
const data_authenticator = require('../../../../merchant/data_authenticator');
const PermissionsUtility = require('../../../../merchant/utils/permission_utility');

module.exports.validateOpenRegister = async (registerId, openedByUserId, openingAmount, clientDB, transaction) => {
  if (openingAmount && openingAmount < 0) {
    throw new Error(OPEN_REGISTER_WITH_NEGATIVE_AMOUNT);
  }

  const register = await RegisterDAL.getRegisterWithLocation(registerId, clientDB, transaction);
  if (!register) {
    throw new Error(REGISTER_NOT_FOUND);
  }
  if (register.status === REGISTER_STATUS.INACTIVE) {
    throw new Error(OPEN_INACTIVE_REGISTER);
  }
  if (register.status === REGISTER_STATUS.OPENED) {
    throw new Error(OPEN_AN_OPENED_REGISTER);
  }

  const isAutherizedUser = await data_authenticator.validateDataPermission(DATA_PERMISSION_TYPES.LOCATION, [register.StockLocation.id], clientDB);

  if (!isAutherizedUser) {
    throw new Error(UNAUTHORIZED.NAME);
  }

  const user = await MerchantDAL.getMerchantByUserId(openedByUserId);
  if (!user || user.schemaName !== clientDB.clientDBName) {
    throw new Error(INVALID_USER_ID);
  }
};

module.exports.validateCloseRegister = async (registerId, userId, openedByUserId, closingLogs, clientDB, transaction) => {
  const register = await RegisterDAL.getRegisterWithLocation(registerId, clientDB, transaction);
  const shift = await RegisterDAL.getLastShiftByRegisterId(registerId, clientDB, transaction);
  if (!register) {
    throw new Error(REGISTER_NOT_FOUND);
  }
  if (register.status === REGISTER_STATUS.INACTIVE) {
    throw new Error(CLOSE_INACTIVE_REGISTER);
  }
  if (register.status === REGISTER_STATUS.CLOSED || shift.status === REGISTER_STATUS.CLOSED) {
    throw new Error(CLOSE_A_CLOSED_REGISTER);
  }
  const logWithNegativeAmount = closingLogs.find((cl) => cl.amount < 0);
  if (logWithNegativeAmount) {
    throw new Error(CLOSE_REGISTER_WITH_NEGATIVE_AMOUNT);
  }

  const hasLikedPaymentMethod = closingLogs.find((cl) => !register.PaymentMethodToRegisters.find((pmToR) => pmToR.paymentMethodId === cl.paymentMethodId));
  if (hasLikedPaymentMethod) {
    throw new Error(PAYMENT_METHOD_DOES_NOT_BELONG_TO_REGISTER);
  }

  const isAutherizedUser = await data_authenticator.validateDataPermission(DATA_PERMISSION_TYPES.LOCATION, [register.StockLocation.id], clientDB);

  if (!isAutherizedUser) {
    throw UNAUTHORIZED;
  }

  let user = await MerchantDAL.getMerchantByUserId(userId);
  user = PermissionsUtility.mapMerchantPermissions(user);

  if (!user || user.schemaName !== clientDB.clientDBName) {
    throw new Error(INVALID_USER_ID);
  }
  // only allow if user has permission to close all if he didn't open register.
  if (user.id !== openedByUserId) {
    PermissionsUtility.validateEvent('pos.sales_screen.close_all', user.permissions);
  }
};

module.exports.validateAddOrWithdrawCash = async (registerId, userId, amount, type, clientDB, transaction) => {
  if (!amount || amount < 0) {
    throw new Error('invalid amount');
  }
  if (!type || ![LOG_TYPES.WITHDRAW.toLowerCase(), LOG_TYPES.ADD.toLowerCase()].includes(type.toLowerCase())) {
    throw new Error('invalid type.');
  }
  const register = await RegisterDAL.getRegisterWithLocation(registerId, clientDB, transaction);
  const shift = await RegisterDAL.getLastShiftByRegisterId(registerId, clientDB, transaction);

  if (!register) {
    throw new Error(REGISTER_NOT_FOUND);
  }
  if (register.status !== REGISTER_STATUS.OPENED || shift.status !== REGISTER_STATUS.OPENED) {
    throw new Error('register is not open.');
  }

  const isAutherizedUser = await data_authenticator.validateDataPermission(DATA_PERMISSION_TYPES.LOCATION, [register.StockLocation.id], clientDB);

  if (!isAutherizedUser) {
    throw new Error(UNAUTHORIZED.NAME);
  }

  const user = await MerchantDAL.getMerchantByUserId(userId);
  if (!user || user.schemaName !== clientDB.clientDBName) {
    throw new Error(INVALID_USER_ID);
  }
  const openingLog = await RegisterActionLogDAL.getLastShiftOpenActionLog(shift.id, clientDB, transaction);
  const { userId: openedByUserId } = openingLog;
  // only allow if admin or the user who opened it wants to close it.
  // if (
  //   user.id !== openedByUserId &&
  //   ![MERCHANT_ROLES.SUPER_ADMIN, MERCHANT_ROLES.ADMIN].includes(user.Role.type)
  // ) {
  //   throw new Error(INVALID_USER_ID);
  // }
  if (type === LOG_TYPES.WITHDRAW) {
    const expected = await RegisterService
      .calculateExpectedRegisterAmount(registerId, openingLog, clientDB, transaction);
    console.log('expected:', expected);
    if (amount > expected) {
      throw new Error('Invalid amount: more than the register value.');
    }
  }
};
