const { Op } = require('sequelize');
const { BaseModel } = require('../../../../utils/base-model');
const { LAYOUT_TYPES } = require('../../../../utils/constants/constants');

module.exports.findAllLayouts = async (name, registerName, type, offset = 0, limit = 10, clientDB) => {
  const { Layout, Register, StockLocation } = clientDB;
  const condition = {
    ...(name ? { name: { [Op.like]: `%${name}%` } } : {}),
    ...(type ? { type } : {}),
  };

  const include = [{
    model: Register,
    required: !!registerName,
    include: [{ model: StockLocation, attributes: ['id', 'name'] }],
    ...(registerName ? { where: { name: { [Op.like]: `%${registerName}%` } } } : {})
  }];

  return Layout.findAndCountAll({
    where: condition,
    include,
    offset,
    limit,
    distinct: true
  });
};

module.exports.updateLayout = async (id, layout, clientDB, transaction) => {
  const { Layout } = clientDB || {};
  const query = { id };
  return await BaseModel.update(Layout, layout, query, { transaction });
};

module.exports.addLayout = async (layout, clientDB, transaction) => {
  const {  Layout  } = clientDB || {};
  return BaseModel.create(Layout, layout, {
    transaction
  });
};

module.exports.getLayout = async (id, clientDB, transaction) => {
  const {
    Layout, Register, StockLocation, LayoutCategory, LayoutProduct, LayoutProductVariant
  } = clientDB || {};

  return BaseModel.findOne(Layout, { id }, {
    transaction,
    include: [
      {
        model: Register, include: [{ model: StockLocation, attributes: ['id', 'name', 'code'] }]
      },
      {
        model: LayoutCategory, include: [{ model: LayoutProduct, include: [LayoutProductVariant] }]
      }
    ]
  });
};

module.exports.deleteLayout = async (id, clientDB, transaction) => {
  const { Layout } = clientDB;
  return await BaseModel.delete(Layout, { id }, transaction);
};

module.exports.deleteLayoutProductVariants = async (layoutProductVariantIds, clientDB, transaction) => {
  const { LayoutProductVariant } = clientDB || {};
  return await LayoutProductVariant.destroy({
    where: {
      id: layoutProductVariantIds
    },
    transaction
  });
};

module.exports.deleteLayoutProducts = async (layoutProductIds, clientDB, transaction) => {
  const { LayoutProduct } = clientDB || {};
  return await LayoutProduct.destroy({
    where: {
      id: layoutProductIds
    },
    transaction
  });
};

module.exports.deleteLayoutCategories = async (layoutCategoryIds, clientDB, transaction) => {
  const { LayoutCategory } = clientDB || {};
  return await LayoutCategory.destroy({
    where: {
      id: layoutCategoryIds
    },
    transaction
  });
};

module.exports.assignLayoutToReferences = async (layout, clientDB, transaction) => {
  const { LayoutCategory, LayoutProduct, LayoutProductVariant } = clientDB || {};

  const include = [
    {
      model: LayoutProduct,
      include: [{ model: LayoutProductVariant }]
    }
  ];
  return BaseModel.bulkCreate(LayoutCategory, layout.LayoutCategories, { transaction, include });
};

module.exports.getFirstLayoutId = async (clientDB) => {
  const { Layout } = clientDB;
  return Layout.min('id');
};
