const { HttpUtility } = require('../../utils/http_utility');
const ExpenseCategoryService = require('./expense_category_service');
const { isValidCategoryPayload } = require('./utils/expense_categories_utilities');

module.exports.get = async (event, context, callback, clientDB) => {
  const queryParams = event.queryStringParameters;
  const {
    query, offset, limit, level
  } = queryParams
  || {
    query: undefined, offset: undefined, limit: undefined, level: undefined
  };
  try {
    let result;
    if (offset || limit) {
      result = await ExpenseCategoryService.findPage(limit, offset, query, level, clientDB);
    } else {
      result = await ExpenseCategoryService.findAll(level, clientDB);
    }
    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
module.exports.create = async (event, context, callback, clientDB) => {
  try {
    const category = JSON.parse(event.body);
    let result;

    if (!isValidCategoryPayload(category)) {
      return HttpUtility.respondSuccess({ error: category });
    }

    result = await ExpenseCategoryService.findByName(category.name, clientDB);

    if (result && result.name) {
      return HttpUtility.respondSuccess({ error: 'Category is already exists' });
    }

    result = await ExpenseCategoryService.createCategory(category, clientDB);

    return HttpUtility.respondSuccess({ category: result });
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getCategoryExpenses = async (event, context, callback, clientDB) => {
  try {
    const { offset = undefined, limit = undefined, all = 'false' } = event.queryStringParameters || {};
    const { id } = event.pathParameters;
    let result;

    if (all === 'true') {
      if (id === 'none') {
        result = await ExpenseCategoryService.getAllUncategorizedExpenses(clientDB);
      } else {
        result = await ExpenseCategoryService.getExpenseCategoryExpenses(id, clientDB);
      }

      result = {
        rows: result,
        count: result.length
      };
    } else if (id === 'none') {
      result = await ExpenseCategoryService.getUncategorizedExpenses(
        offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit, clientDB
      );
    } else {
      result = await ExpenseCategoryService.getExpenseCategoryByPage(
        id, clientDB, offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit
      );
    }

    result.rows = result.rows.map((r) => ({ ...r.toJSON() }));

    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getCategoryChildren = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;

    const result = await ExpenseCategoryService.getCategoryChildren(id, clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
