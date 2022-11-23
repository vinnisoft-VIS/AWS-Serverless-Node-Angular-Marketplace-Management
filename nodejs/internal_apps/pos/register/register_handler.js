const { HttpUtility } = require('../../../utils/http_utility');
const RegisterService = require('./register_service');
const CountryService = require('../../../lookups/country_service');
const { REGISTER_STATUS } = require('./utilities/constants');
const {
  OPERATION_SUCCESS_MESSAGE: {
    REGISTER_ADDED, REGISTER_DELETED, REGISTER_UPDATED, REGISTER_DEACTIVATED, REGISTER_ACTIVATED
  }, OPERATION_WARNING_MESSAGE: {
    DEFAULT_REGISTER_UPDATE_REGISTER_OPEN, DEFAULT_REGISTER_UPDATE_DEFAULT_REGISTER_OPEN, DELETE_REGISTER_DEFAULT, DELETE_REGISTER_OPEN, REGISTER_DOESNT_EXIST,
    DEACTIVATE_MAIN_REGISTER, DEACTIVATE_OPEN_REGISTER, UPDATE_OPEN_REGISTER, REGISTER_SHOULD_BE_UNIQUE, REGISTER_BOOKED
  }, OPERATION_FAILURE_MESSAGE
} = require('../../../utils/application_messages');
const MerchantService = require('../../../merchant/merchant_service');
const { DATA_PERMISSION_TYPES } = require('../../../utils/constants/constants');

module.exports.createRegister = async (event, context, callback, clientDB) => {
  try {
    const register = JSON.parse(event.body);

    const newRegister = await RegisterService.createRegister({
      ...register,
      status: register.status || REGISTER_STATUS.CLOSED
    }, clientDB);

    return HttpUtility.respondSuccess(newRegister.toJSON(), REGISTER_ADDED);
  } catch (e) {
    if ([REGISTER_SHOULD_BE_UNIQUE].includes(e.message)) {
      return HttpUtility.respondSuccess({}, e.message, true);
    }
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.deleteRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;

    const status = await RegisterService.deleteRegister(id, clientDB);

    return HttpUtility.respondSuccess({ success: status, id }, REGISTER_DELETED);
  } catch (e) {
    if ([DELETE_REGISTER_DEFAULT, DELETE_REGISTER_OPEN, REGISTER_DOESNT_EXIST].includes(e.message)) {
      return HttpUtility.respondSuccess({ success: 0 }, e.message, true);
    }
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.deactivateRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters || {};

    const status = REGISTER_STATUS.INACTIVE;

    const updatedStatus = await RegisterService.activateOrDeactivateRegister(id, status, clientDB);

    return HttpUtility.respondSuccess({ success: updatedStatus[0] }, REGISTER_DEACTIVATED);
  } catch (e) {
    if ([DEACTIVATE_MAIN_REGISTER, DEACTIVATE_OPEN_REGISTER, REGISTER_DOESNT_EXIST].includes(e.message)) {
      return HttpUtility.respondSuccess({ success: 0 }, e.message, true);
    }
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.activateRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters || {};

    const status = REGISTER_STATUS.CLOSED;

    await RegisterService.activateOrDeactivateRegister(id, status, clientDB);

    const register = await RegisterService.getRegister(id, clientDB)
      .then((r) => r.toJSON());
    return HttpUtility.respondSuccess(register, REGISTER_ACTIVATED);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.bookRegisterSellingSession = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters || {};
    const { sellingSessionToken, forceBooking } = JSON.parse(event.body);
    const response = await RegisterService.bookRegisterSellingSession(id, sellingSessionToken, forceBooking, clientDB);
    return HttpUtility.respondSuccess(!!response, REGISTER_BOOKED);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.makeRegisterDefault = async (event, context, callback, clientDB) => {
  const { id } = event.pathParameters;
  try {
    const register = await RegisterService.makeRegisterDefault(id, clientDB)
      .then((r) => r.toJSON());
    return HttpUtility.respondSuccess(register, REGISTER_UPDATED);
  } catch (e) {
    if (e.message === DEFAULT_REGISTER_UPDATE_REGISTER_OPEN
      || e.message === DEFAULT_REGISTER_UPDATE_DEFAULT_REGISTER_OPEN) {
      const register = await RegisterService.getRegister(id, clientDB, true)
        .then((r) => r.toJSON());
      return HttpUtility.respondSuccess(register, e.message, true);
    }
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.updateRegister = async (event, context, callback, clientDB) => {
  const { id } = event.pathParameters;
  const register = JSON.parse(event.body);
  try {
    await RegisterService.updateRegister(id, register, clientDB);
    return HttpUtility.respondSuccess(register, REGISTER_UPDATED);
  } catch (e) {
    if ([REGISTER_DOESNT_EXIST, UPDATE_OPEN_REGISTER, REGISTER_SHOULD_BE_UNIQUE].includes(e.message)) {
      return HttpUtility.respondSuccess({}, e.message, true);
    }
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.openRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const body = JSON.parse(event.body);
    const { userId, openingAmount } = body;
    const register = await RegisterService
      .openRegister(parseInt(id, 10), userId, openingAmount, clientDB);
    return HttpUtility.respondSuccess(register);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.closeRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const body = JSON.parse(event.body);
    const { userId, closingLogs } = body;
    const register = await RegisterService
      .closeRegister(parseInt(id, 10), userId, closingLogs, clientDB);
    return HttpUtility.respondSuccess(register);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.addOrWithdrawCash = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const body = JSON.parse(event.body);
    const {
      userId, amount, type, notes
    } = body;
    await RegisterService.addOrWithdrawCash(parseInt(id, 10), userId, type, notes, amount, clientDB);
    return HttpUtility.respondSuccess({ success: true });
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.getRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const register = await RegisterService.getRegister(parseInt(id, 10), clientDB);
    if (register.dataValues.StockLocation.dataValues.countryId) {
      const country = await CountryService.getCountryById(parseInt(register.dataValues.StockLocation.dataValues.countryId, 10), clientDB);
      register.dataValues.StockLocation.dataValues.country = country ? country.name : '';
    } else {
      register.dataValues.StockLocation.dataValues.country = '';
    }
    return HttpUtility.respondSuccess(register);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};
module.exports.sell = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const invoice = JSON.parse(event.body);
    console.log('initiating pos sale');
    const createdInvoice = await RegisterService.sell(parseInt(id, 10), invoice, clientDB);
    console.log('completed pos sale');
    return HttpUtility.respondSuccess(createdInvoice);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.park = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const invoice = JSON.parse(event.body);
    const parkedInvoice = await RegisterService.park(parseInt(id, 10), invoice, clientDB);
    return HttpUtility.respondSuccess(parkedInvoice);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.deletePark = async (event, context, callback, clientDB) => {
  try {
    const { invoiceId } = event.pathParameters;
    const result = await RegisterService.deletePark(+invoiceId, clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.returnOrder = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const invoice = JSON.parse(event.body);
    const returnInvoice = await RegisterService.returnOrder(parseInt(id, 10), invoice, clientDB);
    return HttpUtility.respondSuccess(returnInvoice);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.getRegisterBalance = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const balance = await RegisterService
      .getRegisterBalance(parseInt(id, 10), clientDB);
    return HttpUtility.respondSuccess(balance);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.getParkedSalesInvoices = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const queryParams = event.queryStringParameters || {};
    const { limit = 10, offset = 0 } = queryParams;
    const invoices = await RegisterService.getParkedSalesInvoices(id, limit, offset, clientDB);
    return HttpUtility.respondSuccess(invoices);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.hasUserAccessForRegister = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;

    const register = await RegisterService.getRegister(id, clientDB, true);

    if (!register) throw new Error(OPERATION_FAILURE_MESSAGE.REGISTER_NOT_FOUND);

    const isPermit = await MerchantService.checkUserDataPermission(register.stockLocationId, DATA_PERMISSION_TYPES.LOCATION, clientDB);

    return HttpUtility.respondSuccess(isPermit);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};
