const {
  OPERATION_FAILURE_MESSAGE: {
    EXPENSE_REQUIRED,
    EXPENSE_WRONG_DATA,
    EXPENSE_CATEGORY_NOT_FOUND,
    PAYMENT_METHOD_NOT_FOUND,
    TAX_NOT_FOUND,
    REGISTER_NOT_FOUND,
    STOCK_LOCATION_NOT_FOUND,
    EXPENSE_NOT_FOUND,
  }
} = require('../../utils/application_messages.js');

const ExpenseDAL = require('../dal/expense_dal');
const PaymentMethodDAL = require('../../payment-method/dal/payment_method_dal');
const TaxDAL = require('../../tax/dal/tax_dal');
const StockLocationDAL = require('../../stock-location/dal/stock_location_dal');
const RegisterDAL = require('../../internal_apps/pos/register/dal/register_dal');
const { UnauthorizedLocationAccess } = require('../../stock-location/error/unauthorized_location_access.js');
const { REGISTER_STATUS } = require('../../internal_apps/pos/register/utilities/constants.js');
const MerchantService = require('../../merchant/merchant_service')
const { DATA_PERMISSION_TYPES } = require('../../utils/constants/constants');
const RegisterService = require('../../internal_apps/pos/register/register_service');
const { BusinessError } = require('../../utils/error/errors.js');
const { REGISTERS: { REGISTER_NOT_OPEN, REGISTER_SHORT_OF_CASH, REGISTER_EXPENSE_PAYMENT_METHOD_MISMATCH } } = require('../../utils/error/constants/ERRORS.js');
const { PAYMENTS_TYPES } = require('../../invoice/utils/constants.js');

const checkValidData = async (expense, clientDB) => {
  if (!expense) {
    throw new Error(EXPENSE_NOT_FOUND);
  }

  const requiredFields = ['name', 'expenseCategoryId', 'amount', 'paymentDate'];

  if (expense.considerPosCaseManagement) {
    requiredFields.push('cashManagementLocationId', 'cashManagementRegisterId', 'paymentMethodId')
  }

  requiredFields.forEach((rf) => {
    if (!expense[rf]) {
      throwRequiredError(rf);
    }
  });

  const category = await ExpenseDAL.getCategoryById(expense.expenseCategoryId, clientDB);
  if (!category) {
    throw new Error(EXPENSE_CATEGORY_NOT_FOUND);
  }

  if (!expense.ExpenseStockLocations || !expense.ExpenseStockLocations.length) {
    throwRequiredError('ExpenseStockLocations');
  }

  const paymentDate = new Date(expense.paymentDate);

  if (!paymentDate.getDate()) {
    throw new Error(`paymentDate ${EXPENSE_WRONG_DATA}`);
  }

  if (expense.paymentMethodId) {
    const paymentMethod = await PaymentMethodDAL.getPaymentMethodById(
      expense.paymentMethodId, clientDB, undefined
    );
    if (!paymentMethod) {
      throw new Error(PAYMENT_METHOD_NOT_FOUND);
    }
  }

  if (expense.taxId) {
    const tax = await TaxDAL.getTaxById(expense.taxId, clientDB, undefined);
    if (!tax) {
      throw new Error(TAX_NOT_FOUND);
    }
  }

  if (expense.cashManagementLocationId) {
    const stockLocation = await StockLocationDAL.getStockLocationById(
      expense.cashManagementLocationId,
      clientDB,
      undefined
    );
    if (!stockLocation) {
      throw new Error(STOCK_LOCATION_NOT_FOUND);
    }

    const userLocationIds = await MerchantService.getDataPermissions(
      DATA_PERMISSION_TYPES.LOCATION, clientDB
    )
  
    if (!userLocationIds.includes(expense.cashManagementLocationId)) {
      throw new Error(UnauthorizedLocationAccess)
    }      
  }

  if (expense.cashManagementRegisterId) {
    const register = await RegisterDAL.getRegisterWithPaymentMethodsToRegister(
      expense.cashManagementRegisterId,
      clientDB,
      undefined
    );
    if (!register) {
      throw new Error(REGISTER_NOT_FOUND);
    }

    const registerPaymentMethod = register.PaymentMethodToRegisters.find(
      (paymentMethod) => paymentMethod.paymentMethodId === expense.paymentMethodId
    )

    if (!registerPaymentMethod) {
      throw new BusinessError(REGISTER_EXPENSE_PAYMENT_METHOD_MISMATCH)
    }
    if (registerPaymentMethod.PaymentMethod.type !== PAYMENTS_TYPES.CASH) {
      throw new BusinessError(REGISTER_EXPENSE_PAYMENT_METHOD_MISMATCH)      
    }
    if (register.status !== REGISTER_STATUS.OPENED) {
      throw new BusinessError(REGISTER_NOT_OPEN)
    }
  }
};

function throwRequiredError(fieldName) {
  throw new Error(`${fieldName} ${EXPENSE_REQUIRED}`);
}

module.exports.validateCreateExpenseAgainstRegister = async (expense, clientDB) => {
  if (expense.cashManagementRegisterId) {
    const registerId = expense.cashManagementRegisterId;
    const registerBalance = await RegisterService.getRegisterBalance(registerId, clientDB, expense.paymentMethodId)
    if (registerBalance < +expense.amount) {
      throw new BusinessError(REGISTER_SHORT_OF_CASH)
    }  
  }
}

module.exports.validateCreateExpense = async (expense, clientDB) => {
  await checkValidData(expense, clientDB);
};

module.exports.validateGetExpense = (expense) => {
  if (!expense) throw new Error(EXPENSE_NOT_FOUND);
};

module.exports.validateUpdateExpense = async (expense, clientDB) => {
  await checkValidData(expense, clientDB);
};
