const Sequelize = require('sequelize');

const { Op } = Sequelize;
const { BaseModel } = require('../../../utils/base-model');

module.exports.create = async (category, clientDB) => {
  const { ExpenseCategory } = clientDB;
  const result = await BaseModel.create(ExpenseCategory, category);
  return result;
};

module.exports.findAll = async (level, clientDB) => {
  const { ExpenseCategory } = clientDB;

  const query = level ? { level } : {};

  return BaseModel.findAll(ExpenseCategory, query, {}, false);
};

module.exports.findPage = (limit, offset, query = '', level, clientDB) => {
  const { ExpenseCategory } = clientDB;
  return ExpenseCategory.findAndCountAll({
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    where: {
      name: {
        [Op.like]: `%${query}%`
      },
      ...(level ? { level } : {})
    }
  }).then((result) => ({
    result: result.rows,
    total: result.count
  }));
};

module.exports.findByName = async (name, clientDB) => {
  const { ExpenseCategory } = clientDB;
  return BaseModel.findOne(ExpenseCategory, { name }, {});
};

module.exports.findByIdsOrParentIds = async (ids, clientDB, transaction) => {
  const { ExpenseCategory } = clientDB;
  const categories = await BaseModel.findAll(ExpenseCategory, {
    id: { [Op.in]: ids }
  }, { transaction }, false);

  if (categories) {
    let parentIds = categories.filter((c) => c.parentId).map((c) => c.parentId);
    parentIds = parentIds.filter((id) => !categories.find((c) => c.id === id));

    if (parentIds.length > 0) {
      const parentCategories = await BaseModel.findAll(ExpenseCategory, {
        id: { [Op.in]: parentIds }
      }, {}, false);

      categories.concat(parentCategories);
    }
  }

  return categories;
};

module.exports.getUncategorizedExpenses = async (offset = 0, limit = 100, clientDB) => {
  const { Expense } = clientDB || {};
  const query = {
    expenseCategoryId: { [Op.is]: null },
  };

  const queryOption = {
    offset,
    limit,
    distinct: true
  };

  return Expense.findAndCountAll({
    where: query, ...queryOption, subQuery: false, distinct: true
  });
};

module.exports.getExpenseCategoryByPage = async (categoryId, clientDB, offset = 0, limit = 100) => {
  const { Expense } = clientDB;
  return Expense.findAndCountAll({
    where: { expenseCategoryId: categoryId },
    offset,
    limit,
    distinct: true
  });
};

module.exports.getExpenseCategoryChildren = async (parentId, clientDB) => {
  const { ExpenseCategory } = clientDB;
  return BaseModel.findAll(ExpenseCategory, { parentId }, {}, false);
};

module.exports.findById = async (id, clientDB) => {
  const { ExpenseCategory } = clientDB;
  return BaseModel.findOne(ExpenseCategory, { id }, {});
};

module.exports.getExpenseCategoryExpenses = async (categoryId, clientDB) => {
  const { Expense } = clientDB;
  return BaseModel.findAll(Expense, { expenseCategoryId: categoryId }, {}, false);
};

module.exports.getAllUncategorizedExpenses = async (clientDB) => {
  const { Expense } = clientDB || {};
  const query = {
    expenseCategoryId: { [Op.is]: null },
  };

  return BaseModel.findAll(Expense, query, {
    // include: [{  }]
  }, false);
};

module.exports.findByIds = async (ids, clientDB) => {
  const { ExpenseCategory } = clientDB;
  return BaseModel.findAll(ExpenseCategory, { id: { [Op.in]: ids } }, {}, false);
};
