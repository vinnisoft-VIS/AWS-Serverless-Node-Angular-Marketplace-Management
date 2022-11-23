const Sequelize = require('sequelize');

const { Op } = Sequelize;
const ExpenseDAL = require('./dal/expense_dal');
const { validateGetExpense } = require('./validation/expense_validation');
const MerchantService = require('../merchant/merchant_service');
const { DATA_PERMISSION_TYPES, CONDITION_TYPE } = require('../utils/constants/constants');
const { UnauthorizedLocationAccess } = require('../stock-location/error/unauthorized_location_access');
const DataAuthenticator = require('../merchant/data_authenticator');
const { getWildCardQuery } = require('../utils/commonUtils');

module.exports.getExpenseById = async (id, clientDB) => {
  const promotion = await ExpenseDAL.getExpenseById(id, clientDB);
  return promotion;
};

module.exports.storeExpense = async (expense, clientDB) => {
  const createdExpense = await ExpenseDAL.createExpense(expense, clientDB);
  return createdExpense;
};

module.exports.getExpensesBetween = async (query, clientDB, transaction) => {
  const { Expense } = clientDB;
  const conditionArray = [];

  if (query.startDateTime) {
    conditionArray.push({
      createdAt: {
        [Op.gte]: query.startDateTime
      }
    });
  }

  if (query.endDateTime) {
    conditionArray.push({
      createdAt: {
        [Op.lte]: query.endDateTime
      }
    });
  }

  if (query.cashManagementRegisterId) {
    conditionArray.push({
      cashManagementRegisterId: {
        [Op.eq]: query.cashManagementRegisterId
      }
    })
  }

  const expenseList = {};

  if (conditionArray.length > 0) {
    conditions = { [Op.and]: conditionArray };
    expenseList.where = conditions;
  }

  return Expense.findAll(expenseList, transaction);
}

module.exports.getAllExpenses = async (
  query, sortBy, stockLocationSortBy, offset, limit, clientDB
) => {
  const {
    Expense, ExpenseCategory, ExpenseStockLocation, StockLocation, PaymentMethod, Tax, Register
  } = clientDB;

  const include = [
    { model: ExpenseCategory },
    { model: PaymentMethod },
    { model: Register },
    { model: StockLocation },
    { model: Tax },
    {
      model: ExpenseStockLocation,
      separate: true,
      order: stockLocationSortBy || [['name', 'ASC']],
      include: {
        model: StockLocation
      }
    }
  ];
  let conditions = {};
  const conditionArray = [];
  const expenseList = {
    subQuery: false,
    include,
    distinct: true,
    order: sortBy || [['createdAt', 'DESC']],
    limit,
    offset,
  };

  if (query.fromDate) {
    if (query.toDate) {
      conditionArray.push({
        paymentDate: {
          [Op.and]: {
            [Op.gte]: query.fromDate,
            [Op.lte]: query.toDate
          }
        }
      });
    } else {
      conditionArray.push({
        paymentDate: {
          [Op.and]: {
            [Op.gte]: query.fromDate,
            [Op.lte]: query.fromDate
          }
        }
      });
    }
  }

  if (query.createdAtFromDate) {
    if (query.createdAtToDate) {
      const fromDate = `${query.createdAtFromDate} 00:00:00`;
      const toDate = `${query.createdAtToDate} 23:59:59`;
      conditionArray.push({
        createdAt: {
          [Op.and]: {
            [Op.gte]: fromDate,
            [Op.lte]: toDate
          }
        }
      });
    } else {
      const fromDate = new Date(`${query.createdAtFromDate} 00:00:00`);
      const toDate = new Date(`${query.createdAtFromDate} 23:59:59`);
      conditionArray.push({
        createdAt: {
          [Op.and]: {
            [Op.gte]: fromDate,
            [Op.lte]: toDate
          }
        }
      });
    }
  }

  if (query.updatedAtFromDate) {
    if (query.updatedAtToDate) {
      const fromDate = `${query.updatedAtFromDate} 00:00:00`;
      const toDate = `${query.updatedAtToDate} 23:59:59`;
      conditionArray.push({
        updatedAt: {
          [Op.and]: {
            [Op.gte]: fromDate,
            [Op.lte]: toDate
          }
        }
      });
    } else {
      const fromDate = `${query.updatedAtFromDate} 00:00:00`;
      const toDate = `${query.updatedAtFromDate} 23:59:59`;
      conditionArray.push({
        updatedAt: {
          [Op.and]: {
            [Op.gte]: fromDate,
            [Op.lte]: toDate
          }
        }
      });
    }
  }

  if (query.expenseCategory) {
    const expenseCategoryIds = query.expenseCategory.split(',');
    conditionArray.push({ expenseCategoryId: { [Op.in]: expenseCategoryIds } });
  }

  if (query.paymentMethod) {
    const paymentMethods = query.paymentMethod.split(',');
    conditionArray.push({ paymentMethodId: { [Op.in]: paymentMethods } });
  }

  if (query.taxable === '1') {
    conditionArray.push({ taxable: { [Op.eq]: 1 } });
  } else if (query.taxable !== '') {
    conditionArray.push({ taxable: { [Op.eq]: 0 } });
  }

  if (query.amount && query.amountOP) {
    const conditionOP = CONDITION_TYPE[query.amountOP];
    if (conditionOP) {
      conditionArray.push({ amount: { [conditionOP]: query.amount } });
    }
  }

  const userLocationIds = await MerchantService
    .getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
  if (query.location) {
    const locationIds = query.location.split(',');
    if (!userLocationIds.filter((id) => locationIds.indexOf(id) !== -1)) {
      throw new UnauthorizedLocationAccess(DataAuthenticator.getEmail(),
        clientDB.clientDBName);
    }
    const expenseIds = await ExpenseDAL.findExpenseIdsByStockLocation(locationIds, null, clientDB);
    conditionArray.push({ id: { [Op.in]: expenseIds } });
  } else {
    const expenseIds = await ExpenseDAL.findExpenseIdsByStockLocation(userLocationIds, null, clientDB);
    conditionArray.push({ id: { [Op.in]: expenseIds } });
  }

  if (query.search && query.searchOP) {
    const searchArray = [];
    const { search, searchOP } = query;
    const wildCardQuery = getWildCardQuery(search, searchOP);
    searchArray.push({ name: wildCardQuery });
    searchArray.push({ amount: { [Op.like]: query.search } });
    searchArray.push({ id: { [Op.eq]: query.search } });
    const searchCondition = {
      [Op.or]: searchArray
    };
    conditionArray.push(searchCondition);
  }

  if (conditionArray.length > 0) {
    conditions = { [Op.and]: conditionArray };
    Object.assign(expenseList, { where: conditions });
  }

  const expenses = await Expense.findAndCountAll(expenseList);
  return {
    result: expenses.rows,
    total: expenses.count
  };
};
module.exports.deleteExpense =
async (id, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const expense = await ExpenseDAL.getExpenseById(id, clientDB, transaction);
  validateGetExpense(expense);
  return ExpenseDAL.deleteExpense(id, clientDB, transaction);
});

module.exports.updateExpense =
  async (id, expense, clientDB) => clientDB.sequelize.transaction(
    (transaction) => ExpenseDAL.updateExpense(id, expense, clientDB, transaction)
  );
