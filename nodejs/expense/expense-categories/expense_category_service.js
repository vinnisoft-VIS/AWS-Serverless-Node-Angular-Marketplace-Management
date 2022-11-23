const ExpenseCategoryDal = require('./dal/expense_category_dal');
const { validateParentCategory, validateCategoryLevel } = require('./validation/expense_category_validation');
const ExpenseDAL = require('../dal/expense_dal');

module.exports.createCategory = async (categoryOrigin, clientDB) => {
  const category = categoryOrigin;
  if (category.parentId) {
    const parentCategory = await ExpenseCategoryDal.findById(category.parentId, clientDB);
    validateParentCategory(parentCategory.id);
    category.level = parentCategory.level + 1;
    validateCategoryLevel(category.level);
  } else {
    category.level = 1;
  }

  const newCategory = await ExpenseCategoryDal.create(category, clientDB);
  // assign category to the expenses
  if (category.expenses) {
    await ExpenseDAL.updateExpenseCategory(category.expenses, newCategory.id, clientDB);
  }
  return newCategory;
};

module.exports.findAll = async (level, clientDB) => {
  const categories = await ExpenseCategoryDal.findAll(level, clientDB);
  const parentCategories = await this.getParentCategories(categories, clientDB);

  return [...categories, ...parentCategories];
};

module.exports.findPage = async (limit, offset, query, level, clientDB) => {
  const categories = await ExpenseCategoryDal.findPage(limit, offset, query, level, clientDB);
  const parentCategories = await this.getParentCategories(categories.result, clientDB);

  return {
    ...categories,
    result: [...categories.result, ...parentCategories],
  };
};

module.exports.getParentCategories = async (categories, clientDB) => {
  let subCategoryIds = categories
    .filter((cate) => cate.level === 3 && cate.parentId).map((c) => c.parentId);
  subCategoryIds = subCategoryIds.filter((sub) => !categories.find((c) => c.id === sub));

  let subcategories = [];
  let mainCategories = [];

  if (subCategoryIds && subCategoryIds.length > 0) {
    subcategories = await ExpenseCategoryDal.findByIds([...new Set(subCategoryIds)], clientDB);
  }

  let categoryIds = categories
    .filter((cate) => cate.level === 2 && cate.parentId).map((c) => c.parentId);
  categoryIds = categoryIds.filter((c) => !categories.find((ct) => ct.id === c));
  categoryIds = [...categoryIds, ...subcategories.map((s) => s.parentId)];

  if (categoryIds && categoryIds.length > 0) {
    mainCategories = await ExpenseCategoryDal.findByIds([...new Set(categoryIds)], clientDB);
  }

  return [...subcategories, ...mainCategories];
};

module.exports.findByName = async (name, clientDB) => ExpenseCategoryDal.findByName(name, clientDB);

module.exports.getUncategorizedExpenses = async (offset, limit, clientDB) => ExpenseCategoryDal
  .getUncategorizedExpenses(offset, limit, clientDB);

module.exports.getAllUncategorizedExpenses = async (clientDB) => ExpenseCategoryDal
  .getAllUncategorizedExpenses(clientDB);

module.exports.getExpenseCategoryByPage = async (
  categoryId, clientDB, offset, limit
) => ExpenseCategoryDal.getExpenseCategoryByPage(categoryId, clientDB, offset, limit);

module.exports.getExpenseCategoryExpenses = async (categoryId, clientDB) => ExpenseCategoryDal
  .getExpenseCategoryExpenses(categoryId, clientDB);

module.exports.getCategoryChildren = async (categoryId, clientDB) => ExpenseCategoryDal
  .getExpenseCategoryChildren(categoryId, clientDB);
