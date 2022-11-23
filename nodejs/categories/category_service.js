const CategoryDal = require('./dal/category_dal');
const ActionLogsService = require('../action-logs/action_logs_service');
const { LOG_SECTIONS, LOG_ACTIONS } = require('../action-logs/utils/constants');
const { validateParentCategory, validateCategoryLevel } = require('./validation/category_validation');
const ProductDAL = require('../product/dal/product_dal');

module.exports.createCategory = async (category, clientDB) => {
  if (category.parentId) {
    const parentCategory = await CategoryDal.findById(category.parentId, clientDB);
    validateParentCategory(parentCategory.id);
    category.level = parentCategory.level + 1;
    validateCategoryLevel(category.level);
  } else {
    category.level = 1;
  }

  const newCategory = await CategoryDal.create(category, clientDB);
  // assign category to the products
  if (category.products) {
    await ProductDAL.updateProductCategory(category.products, newCategory.id, clientDB);
  }

  await ActionLogsService.recordActionLogs(
    LOG_SECTIONS.inventorySection,
    LOG_ACTIONS.addCategory,
    `Added category ${newCategory.name}`,
    {
      categoryId: newCategory.id,
      name: newCategory.name,
      params: {
        p1: newCategory.name
      }
    }
  );
  return newCategory;
};

module.exports.findAll = async (level, clientDB) => {
  const categories = await CategoryDal.findAll(level, clientDB);
  const parentCategories = await this.getParentCategories(categories, clientDB);

  return [...categories, ...parentCategories];
};

module.exports.findPage = async (limit, offset, query, level, clientDB) => {
  const categories = await CategoryDal.findPage(limit, offset, query, level, clientDB);
  const parentCategories = await this.getParentCategories(categories.result, clientDB);

  return {
    ...categories,
    result: [...categories.result, ...parentCategories],
  };
};

module.exports.getParentCategories = async (categories, clientDB) => {
  let subCategoryIds = categories.filter((cate) => cate.level === 3 && cate.parentId).map((c) => c.parentId);
  subCategoryIds = subCategoryIds.filter((sub) => !categories.find((c) => c.id === sub));

  let subcategories = [];
  let mainCategories = [];

  if (subCategoryIds && subCategoryIds.length > 0) subcategories = await CategoryDal.findByIds([...new Set(subCategoryIds)], clientDB);

  let categoryIds = categories.filter((cate) => cate.level === 2 && cate.parentId).map((c) => c.parentId);
  categoryIds = categoryIds.filter((c) => !categories.find((ct) => ct.id === c));
  categoryIds = [...categoryIds, ...subcategories.map((s) => s.parentId)];

  if (categoryIds && categoryIds.length > 0) mainCategories = await CategoryDal.findByIds([...new Set(categoryIds)], clientDB);

  return [...subcategories, ...mainCategories];
};

module.exports.findByName = async (name, clientDB) => await CategoryDal.findByName(name, clientDB);

module.exports.getUncategorizedProducts = async (offset, limit, clientDB) => await CategoryDal.getUncategorizedProducts(offset, limit, clientDB);

module.exports.getAllUncategorizedProducts = async (clientDB) => await CategoryDal.getAllUncategorizedProducts(clientDB);

module.exports.getCategoryPageProducts = async (categoryId, clientDB, offset, limit) => await CategoryDal.getCategoryProductByPage(categoryId, clientDB, offset, limit);

module.exports.getCategoryProducts = async (categoryId, clientDB) => await CategoryDal.getCategoryProducts(categoryId, clientDB);

module.exports.getCategoryChildren = async (categoryId, clientDB) => await CategoryDal.getCategoryChildren(categoryId, clientDB);

module.exports.searchCategoryVariants = async (categoryId, clientDB, offset, limit, query) => await CategoryDal.searchCategoryProductVariants(categoryId, clientDB, offset, limit, query);

module.exports.searchUnCategorisedVariants = async (offset, limit, query, clientDB) => await CategoryDal.searchCategoryProductVariants(null, clientDB, offset, limit, query);
