const { VARIANT_TYPES } = require('../utils/constants/constants');
const { HttpUtility } = require('../utils/http_utility');
const CategoryService = require('./category_service');
const { isValidCategoryPayload } = require('./utils/categories_utilities');

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
      result = await CategoryService.findPage(limit, offset, query, level, clientDB);
    } else {
      result = await CategoryService.findAll(level, clientDB);
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

    result = await CategoryService.findByName(category.name, clientDB);

    if (result && result.name) {
      return HttpUtility.respondSuccess({ error: 'Category is already exists' });
    }

    result = await CategoryService.createCategory(category, clientDB);

    return HttpUtility.respondSuccess({ category: result });
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getCategoryProducts = async (event, context, callback, clientDB) => {
  try {
    const { offset = undefined, limit = undefined, all = 'false' } = event.queryStringParameters || {};
    const { id } = event.pathParameters;
    let result;

    if (all === 'true') {
      if (id === 'none') {
        result = await CategoryService.getAllUncategorizedProducts(clientDB);
      } else {
        result = await CategoryService.getCategoryProducts(id, clientDB);
      }

      result = {
        rows: result,
        count: result.length
      };
    } else if (id === 'none') {
      result = await CategoryService.getUncategorizedProducts(offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit, clientDB);
    } else {
      result = await CategoryService.getCategoryPageProducts(id, clientDB, offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit);
    }

    result.rows = result.rows.map((r) => ({ ...r.toJSON(), hasPackVariant: r.ProductVariants && r.ProductVariants.filter((v) => v.type === VARIANT_TYPES.PACKAGE).length > 0 }));

    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.getCategoryChildren = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;

    const result = await CategoryService.getCategoryChildren(id, clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};

module.exports.searchCategoryVariants = async (event, context, callback, clientDB) => {
  try {
    const { query, offset = undefined, limit = undefined } = event.queryStringParameters || {};
    const { id } = event.pathParameters;
    let result;

    if (id === 'none') {
      result = await CategoryService.searchUnCategorisedVariants(offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit, query, clientDB);
    } else {
      result = await CategoryService.searchCategoryVariants(id, clientDB, offset ? parseInt(offset, 10) : offset, limit ? parseInt(limit, 10) : limit, query);
    }

    return HttpUtility.respondSuccess(result);
  } catch (err) {
    return HttpUtility.respondFailure(err);
  }
};
