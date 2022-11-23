const Sequelize = require('sequelize');

const { Op } = Sequelize;
const { BaseModel } = require('../../utils/base-model');

module.exports.create = async (category, clientDB) => {
  const { Category } = clientDB;
  const result = await BaseModel.create(Category, category);
  return result;
};

module.exports.findAll = async (level, clientDB) => {
  const { Category } = clientDB;

  const query = level ? { level } : {};

  return BaseModel.findAll(Category, query, {}, false);
};

module.exports.findPage = (limit, offset, query = '', level, clientDB) => {
  const { Category } = clientDB;
  return Category.findAndCountAll({
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
  const { Category } = clientDB;
  return BaseModel.findOne(Category, { name }, {});
};

module.exports.findByIdsOrParentIds = async (ids, clientDB, transaction) => {
  const { Category } = clientDB;
  const categories = await BaseModel.findAll(Category, {
    id: { [Op.in]: ids }
  }, { transaction }, false);

  if (categories) {
    let parentIds = categories.filter((c) => c.parentId).map((c) => c.parentId);
    parentIds = parentIds.filter((id) => !categories.find((c) => c.id === id));

    if (parentIds.length > 0) {
      const parentCategories = await BaseModel.findAll(Category, {
        id: { [Op.in]: parentIds }
      }, {}, false);

      categories.concat(parentCategories);
    }
  }

  return categories;
};

module.exports.getUncategorizedProducts = async (offset = 0, limit = 100, clientDB) => {
  const { Product, ProductVariant } = clientDB || {};
  const query = {
    categoryId: { [Op.is]: null },
  };

  const queryOption = {
    offset,
    limit,
    distinct: true,
    include: [{ model: ProductVariant, required: false, attributes: ['id', 'type'] }]
  };

  return Product.findAndCountAll({
    where: query, ...queryOption, subQuery: false, distinct: true
  });
};

module.exports.getCategoryProductByPage = async (categoryId, clientDB, offset = 0, limit = 100) => {
  const { Product, ProductVariant } = clientDB;
  return Product.findAndCountAll({
    where: { categoryId },
    offset,
    limit,
    distinct: true,
    include: [{ model: ProductVariant, required: false, attributes: ['id', 'type'] }]
  });
};

module.exports.getCategoryChildren = async (parentId, clientDB) => {
  const { Category } = clientDB;
  return BaseModel.findAll(Category, { parentId }, {}, false);
};

module.exports.findById = async (id, clientDB) => {
  const { Category } = clientDB;
  return BaseModel.findOne(Category, { id }, {});
};

module.exports.getCategoryProductAndVariantIds = async (categoryIds, clientDB, transaction) => {
  const { Product, ProductVariant} = clientDB;

  const query = {
    categoryId: { [Op.in]: categoryIds }
  };

  return BaseModel.findAll(Product, query, {
    include: [
    {
      model: ProductVariant, attributes: ['sku', 'type']
    }],
    where: { categoryIds },
    attributes: ['id','categoryId'],
    transaction
  }, false);
};

module.exports.searchCategoryProductVariants = async (categoryId, clientDB, offset = 0, limit = 100, query) => {
  const { Product, ProductVariant, VariantToPackage } = clientDB;
  return BaseModel.findAll(ProductVariant,
    {
      '$Product.categoryId$': categoryId || { [Op.is]: null },
      [Op.or]: [
        { sku: { [Op.like]: `%${query}%` } },
        { name: { [Op.like]: `%${query}%` } },
        { '$Product.name$': { [Op.like]: `%${query}%` } },
        { barCode: { [Op.like]: `%${query}%` } }
      ]
    },
    {
      include: [{ model: Product, required: true },
        {
          model: VariantToPackage,
          on: {
            packageVariantId: Sequelize.where(Sequelize.col('VariantToPackages.packageVariantId'), '=', Sequelize.col('ProductVariant.id'))
          }
        }
      ],
      page: Math.floor(offset / (limit || 1)),
      limit
    });
};

module.exports.getCategoryProducts = async (categoryId, clientDB) => {
  const { Product, ProductVariant } = clientDB;
  return BaseModel.findAll(Product, { categoryId }, {
    include: [{ model: ProductVariant, required: false, attributes: ['id', 'type'] }]
  }, false);
};

module.exports.getAllUncategorizedProducts = async (clientDB) => {
  const { Product, ProductVariant } = clientDB || {};
  const query = {
    categoryId: { [Op.is]: null },
  };

  return BaseModel.findAll(Product, query, {
    include: [{ model: ProductVariant, required: false, attributes: ['id', 'type'] }]
  }, false);
};

module.exports.findByIds = async (ids, clientDB) => {
  const { Category } = clientDB;
  return BaseModel.findAll(Category, { id: { [Op.in]: ids } }, {}, false);
};
