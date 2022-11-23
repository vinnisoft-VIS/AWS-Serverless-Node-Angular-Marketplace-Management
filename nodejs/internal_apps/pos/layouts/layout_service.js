const LayoutDAL = require('./dal/layout_dal');
const RegisterDAL = require('../register/dal/register_dal');
const {
  validateAddLayout,
  validateUpdateLayoutRequest,
  validateRegisterStatus,
  validateGetLayout,
  validateExistingRegisters
} = require('./validation/layout_validation');
const { mapLayout, mapLayoutIdWithCategories } = require('./utils/layout_mapper');
const { LAYOUT_TYPES } = require('../../../utils/constants/constants');
const productListingService = require('../../../app/product-listing/product_listing_service');
const productStatusDAL = require('../../../app/dal/productStatus_dal');

module.exports.findAllLayouts = async (query, clientDB) => {
  const {
    name, registerName, type, limit, offset
  } = query;
  return await LayoutDAL.findAllLayouts(name, registerName, type, parseInt(offset, 10), parseInt(limit, 10), clientDB);
};

module.exports.getLayout = async (id, clientDB) => {
  try {
    const layout = await LayoutDAL.getLayout(id, clientDB);
    validateGetLayout(layout);
    return layout;
  } catch (err) {
    throw err;
  }
};

module.exports.deleteLayout = async (id, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  const layout = await LayoutDAL.getLayout(id, clientDB, transaction);
  validateGetLayout(layout);
  const registers = layout.Registers.map((register) => register.dataValues);
  validateExistingRegisters(registers);
  return LayoutDAL.deleteLayout(id, clientDB, transaction);
});
module.exports.addLayout = async (layout, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  validateAddLayout(layout);

  if (layout.registers && layout.registers.length > 0) {
    const registers = await RegisterDAL.getRegisterByIds(layout.registers, clientDB, transaction);
    validateRegisterStatus(registers);
  }

  const mappedLayout = await mapLayout(layout, clientDB);

  let newLayout = await LayoutDAL.addLayout(mappedLayout, clientDB, transaction);

  if (layout.registers && layout.registers.length > 0) {
    RegisterDAL
      .assignLayoutToRegisters(layout.registers, newLayout.id, clientDB, transaction);
  }

  if(layout.type === LAYOUT_TYPES.CUSTOM && mappedLayout.LayoutCategories && mappedLayout.LayoutCategories.length > 0) {
    mapLayoutIdWithCategories(newLayout.id, mappedLayout.LayoutCategories);
    await LayoutDAL.assignLayoutToReferences(mappedLayout, clientDB, transaction);
  }

  newLayout = await LayoutDAL.getLayout(newLayout.id, clientDB, transaction);

  return newLayout;
});

module.exports.updateLayout = async (id, layout, clientDB) => clientDB.sequelize.transaction(async (transaction) => {
  validateUpdateLayoutRequest(layout.type);
  const currentLayout = await LayoutDAL.getLayout(id, clientDB, transaction);
  validateGetLayout(currentLayout);
  const registers = currentLayout.Registers.map((register) => register.dataValues);
  validateRegisterStatus(registers);
  await this.deleteLayoutReferences(currentLayout, clientDB, transaction);

  const mappedLayout = await mapLayout(layout, clientDB);
  await LayoutDAL.updateLayout(id, mappedLayout, clientDB, transaction);

  if (layout.registers && layout.registers.length > 0) {
    const layoutRegisters = await RegisterDAL.getRegisterByIds(layout.registers, clientDB, transaction);
    validateRegisterStatus(layoutRegisters);

    await RegisterDAL.assignLayoutToRegisters(layout.registers, id, clientDB, transaction);
  }

  if (
    mappedLayout.type === LAYOUT_TYPES.CUSTOM
      && mappedLayout.LayoutCategories
      && mappedLayout.LayoutCategories.length > 0
  ) {
    mapLayoutIdWithCategories(id, mappedLayout.LayoutCategories);
    await LayoutDAL.assignLayoutToReferences(mappedLayout, clientDB, transaction);
  }
  return mappedLayout;
});

module.exports.deleteLayoutReferences = async (layout, clientDB, transaction) => {
  const layoutCategories = layout.LayoutCategories.map((layoutCategor) => layoutCategor.dataValues);
  const layoutProducts = layoutCategories.reduce((previous, current) => {
    previous.push(...current.LayoutProducts);
    return previous;
  }, []).map((product) => product.dataValues);
  const layoutProductVariants = layoutProducts.reduce((previous, current) => {
    previous.push(...current.LayoutProductVariants);
    return previous;
  }, []).map((productVariant) => productVariant.dataValues);

  if (layoutProductVariants && layoutProductVariants.length > 0) {
    await LayoutDAL.deleteLayoutProductVariants(layoutProductVariants.map((layoutProductVariant) => layoutProductVariant.id), clientDB, transaction);
  }
  if (layoutProducts && layoutProducts.length > 0) {
    await LayoutDAL.deleteLayoutProducts(layoutProducts.map((layoutProduct) => layoutProduct.id), clientDB, transaction);
  }
  if (layoutCategories && layoutCategories.length > 0) {
    await LayoutDAL.deleteLayoutCategories(layoutCategories.map((layoutCategory) => layoutCategory.id), clientDB, transaction);
  }
};
