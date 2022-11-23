const { HttpUtility } = require('../utils/http_utility');
const ExpenseService = require('./expense_service');
const {
  expenseListFilterQueryMapper,
  expenseListSortQueryMapper,
  expenseStockLocationListSortQueryMapper,
  expenseDataMapper
} = require('./utils/object-mapper');
const { OPERATION_FAILURE_MESSAGE: { EXPENSE_DELETED } } = require('../utils/application_messages');
const { validateCreateExpense, validateUpdateExpense, validateCreateExpenseAgainstRegister } = require('./validation/expense_validation');

module.exports.getAllExpenses = async (event, context, callback, clientDB) => {
  const queryParams = event.queryStringParameters;
  const {
    offset, limit, sortBy, ...query
  } = queryParams;
  try {
    if (offset && limit) {
      const result = await ExpenseService.getAllExpenses(
        expenseListFilterQueryMapper(query),
        expenseListSortQueryMapper(sortBy ? JSON.parse(sortBy) : {}, clientDB),
        expenseStockLocationListSortQueryMapper(sortBy ? JSON.parse(sortBy) : {}, clientDB),
        parseInt(offset, 10),
        parseInt(limit, 10),
        clientDB
      );
      return HttpUtility.respondSuccess(result);
    }
    return HttpUtility.respondFailure(
      new Error('expense query without offset & limit is not supported operation')
    );
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getExpenseById = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const result = await ExpenseService.getExpenseById(id, clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.create = async (event, context, callback, clientDB) => {
  try {
    const expenseBody = JSON.parse(event.body);
    await validateCreateExpense(expenseBody, clientDB);
    await validateCreateExpenseAgainstRegister(expenseBody, clientDB);
    const expense = await ExpenseService.storeExpense(expenseBody, clientDB);
    return HttpUtility.respondSuccess(expense, 'Expense stored Successfully');
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.deleteExpense = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const status = await ExpenseService.deleteExpense(id, clientDB);
    return HttpUtility.respondSuccess({ success: status, id }, EXPENSE_DELETED);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.updateExpense = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const expenseBody = JSON.parse(event.body);

    await validateUpdateExpense(expenseBody, clientDB);
    const expense = await ExpenseService
      .updateExpense(id, expenseDataMapper(expenseBody), clientDB);
    return HttpUtility.respondSuccess(expense, 'Expense was Updated Successfully');
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
