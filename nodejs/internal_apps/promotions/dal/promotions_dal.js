const Sequelize = require('sequelize');
const { BaseModel } = require('../../../utils/base-model');

const { Op } = Sequelize;
const { convertDateStringToFullDate } = require('../../../utils/commonUtils');
const { PROMOTION_STATUSES } = require('../constants');
const { DuplicateObjectError } = require('../../../utils/error/errors');
const ERRORS = require('../../../utils/error/constants/ERRORS');
const ERROR_TIPS = require('../../../utils/error/constants/error_tips');

module.exports.getActiveQuery = (date) => {
  date.setDate(date.getDate());
  return {
    [Op.and]: [
      Sequelize.where(Sequelize.col('startDate'), '<=', date),
      {
        [Op.or]:
          [
            Sequelize.where(Sequelize.col('endDate'), '>=', date),
            { endDate: { [Op.is]: null } }
          ]
      }
    ]
  };
};

function getIntersectedIntervalQuery(start, end) {
  const startDate = new Date(start);
  // max mysql-datetime if no end is specified.
  const endDate = new Date(end || '9999-12-31 23:59:59');
  return {
    [Op.or]: [
      {
        startDate: { [Op.between]: [startDate, endDate] }
      },
      {
        endDate: { [Op.between]: [startDate, endDate] }
      },
      {
        startDate: { [Op.lte]: startDate },
        endDate: {
          [Op.or]: [
            { [Op.gte]: endDate },
            { [Op.is]: null }
          ]
        }
      }
    ]
  };
}

function getIntersectedLocationQuery(promotion) {
  if (promotion.isAllLocations) {
    return {};
  }
  return {
    [Op.or]: {
      isAllLocations: true,
      '$PromotionStockLocations.stockLocationId$': {
        [Op.in]: (promotion.PromotionStockLocations || []).map((s) => s.stockLocationId)
      }
    }
  };
}

function getUpComingQuery(date) {
  date.setDate(date.getDate());

  const formattedDate = convertDateStringToFullDate(date);
  return {
    startDate: { [Op.gt]: formattedDate }
  };
}

function getExpiredQuery(date) {
  date.setDate(date.getDate());

  const formattedDate = convertDateStringToFullDate(date);
  return {
    startDate: { [Op.lt]: formattedDate },
    endDate: { [Op.lt]: date },
  };
}
function getActiveOrUpComingQuery(date) {
  date.setDate(date.getDate());

  const formattedDate = convertDateStringToFullDate(date);
  return {
    [Op.or]:
      [
        { endDate: { [Op.gte]: formattedDate } },
        { endDate: { [Op.is]: null } }
      ]
  };
}

module.exports.checkActiveOrUpcomingAllProductPromotionExists = async (clientDB) => {
  const { Promotion } = clientDB;

  const date = new Date();
  const query = getActiveOrUpComingQuery(date);
  query.isAllProducts = true;

  return await BaseModel.findOne(Promotion, query);
};

module.exports.checkIfAllProductPromotionExists = async (clientDB) => {
  const { Promotion } = clientDB;

  const date = new Date();
  const query = this.getActiveQuery(date);
  query.isAllProducts = true;

  return await BaseModel.findOne(Promotion, query);
};

module.exports.getDuplicatedProductsExistsInPromotionBody = async (promotion, promotionId, clientDB) => {
  const {
    PromotionVariant, ProductVariant, Product, Promotion
  } = clientDB;
  const query = {
    promotionId: { [Op.ne]: promotionId }
  };
  const { startDate, endDate } = promotion;
  if (promotion.PromotionVariants) {
    query.productVariantId = {
      [Op.in]: promotion.PromotionVariants.map((p) => p.productVariantId)
    };
  }
  const include = [{
    model: ProductVariant,
    include: [{
      model: Product,
      attributes: ['name']
    }]
  }, {
    model: Promotion,
    attributes: [],
    where: {
      ...getIntersectedIntervalQuery(startDate, endDate),
      isAllProducts: { [Op.not]: true }
    },
    required: true
  }];
  const products = await BaseModel.findAll(PromotionVariant, query, { include }, false);
  const promotionVariants = products.map((pv) => pv.ProductVariant.Product.name);
  return promotionVariants.length ? promotionVariants : 0;
};

module.exports.getIntersectedAllProductsPromotion = (promotion, promotionId, clientDB) => {
  const { Promotion, PromotionStockLocation } = clientDB;
  const { startDate, endDate } = promotion;
  const query = {
    ...getIntersectedIntervalQuery(startDate, endDate),
    id: {
      [Op.not]: promotionId
    },
    isAllProducts: true,
    ...getIntersectedLocationQuery(promotion)
  };
  console.log(getIntersectedLocationQuery(promotion));
  const include = [PromotionStockLocation];

  return BaseModel.findOne(Promotion, query, { include });
};

module.exports.createPromotion = async (promotion, clientDB, transaction) => {
  const { Promotion, PromotionVariant, PromotionStockLocation } = clientDB;
  const include = [
    PromotionVariant,
    PromotionStockLocation
  ];
  return BaseModel.create(Promotion, promotion, { include, transaction });
};

module.exports.importProducts = async (sku, promotion, clientDB, transaction) => {
  const {
    ProductVariant,
    PromotionVariant
  } = clientDB;
  const attributes = ['id'];
  const promotionId = promotion.id;
  const product = await BaseModel
    .findAll(ProductVariant, { sku }, { attributes, transaction }, false)
    .then((prods) => prods.map((p) => {
      const { id: productVariantId } = p;
      return {
        promotionId,
        productVariantId
      };
    }));

  if (!product.length) {
    throw new DuplicateObjectError(
      ERRORS.PROMOTIONS.NOT_FOUND_SKU,
      ERROR_TIPS.PROMOTIONS.NOT_FOUND_SKU
    );
  }

  const promotionVariantQuery = {
    promotionId,
    productVariantId: product[0].productVariantId
  };
  const existsPromotionVariant = await BaseModel.countAll(PromotionVariant, promotionVariantQuery);
  if (!existsPromotionVariant) {
    const promotionVariants = await BaseModel.bulkCreate(PromotionVariant, product, { transaction });
    promotion.PromotionVariants = promotionVariants;
    await module.exports
      .deletePromotionVariantsForIntersectedPromotion(promotion, promotionId, clientDB, transaction);
    return promotionVariants;
  }
};

module.exports.getPromotionList = async (locations, query, offset, limit, clientDB) => {
  const {
    Promotion, PromotionStockLocation, PromotionVariant, StockLocation, ProductVariant
  } = clientDB;
  const {
    name, startDate, endDate, status
  } = query;
  const andConditions = [];
  andConditions.push({
    [Op.or]: [{ isAllLocations: 1 },
      { '$PromotionStockLocations->StockLocation.id$': { [Op.in]: locations } }]
  });
  if (name) {
    andConditions.push({ name: { [Op.like]: `%${name}%` } });
  }
  if (status) {
    const now = new Date();
    let query = {};

    if (status === PROMOTION_STATUSES.ACTIVE) query = this.getActiveQuery(now);
    else if (status === PROMOTION_STATUSES.UPCOMING) query = getUpComingQuery(now);
    else if (status === PROMOTION_STATUSES.EXPIRED) query = getExpiredQuery(now);

    andConditions.push(query);
  }

  if (startDate) {
    const date = new Date(startDate);
    date.setDate(date.getDate());
    const formattedDate = convertDateStringToFullDate(date);
    andConditions.push(Sequelize.where(Sequelize.fn('date', Sequelize.col('startDate')), Op.eq, formattedDate));
  }
  if (endDate) {
    const date = new Date(endDate);
    date.setDate(date.getDate());
    const formattedDate = convertDateStringToFullDate(date);
    andConditions.push(Sequelize.where(Sequelize.fn('date', Sequelize.col('endDate')), Op.eq, formattedDate));
  }

  const countInclude = {
    model: PromotionStockLocation,
    attributes: [],
    include: [
      {
        model: StockLocation,
        attributes: [
          [Sequelize.col('name'), 'stockLocationName'],
          [Sequelize.col('id'), 'stockLocationId']
        ],
      }
    ]
  };
  const include = [
    {
      model: PromotionStockLocation,
      attributes: ['stockLocationId'],
      include: [
        {
          model: StockLocation,
          attributes: [
            [Sequelize.col('name'), 'stockLocationName'],
            [Sequelize.col('id'), 'stockLocationId']
          ]
        }
      ]
    },
    {
      model: PromotionVariant,
      attributes: ['productVariantId'],
      include: [
        {
          model: ProductVariant,
          attributes: [
            [Sequelize.col('name'), 'productVariantName'],
            [Sequelize.col('id'), 'productVariantId']
          ]
        }
      ]
    }
  ];
  const options = {
    include,
    where: andConditions,
    order: [['id', 'DESC']]
  };
  const count = await Promotion.count({
    where: andConditions, include: countInclude, distinct: true
  });
  const promotions = await Promotion.findAll(options);
  const result = {
    rows: [],
    count: 0
  };
  result.rows = promotions ? promotions.slice(offset, offset + limit) : [];
  result.count = count || 0;
  return result;
};

module.exports.updatePromotion = async (id, promotion, previousPromotionId, clientDB, transaction) => {
  const { Promotion, PromotionVariant, PromotionStockLocation } = clientDB;
  await BaseModel.update(Promotion, promotion, { id }, { transaction })
    .then(() => {
      const query = { promotionId: id };
      return BaseModel.delete(PromotionVariant, query, transaction);
    })
    .then(() => {
      if (!promotion.isAllProducts) {
        const promotionVariants = promotion.PromotionVariants.map((pv) => {
          pv.promotionId = id;
          return pv;
        });
        return BaseModel.bulkCreate(PromotionVariant, promotionVariants, { transaction });
      }
      return [];
    }).then(() => {
      const query = { promotionId: id };
      return BaseModel.delete(PromotionStockLocation, query, transaction);
    })
    .then(() => {
      if (!promotion.isAllLocations) {
        const promotionStockLocations = promotion.PromotionStockLocations.map((psl) => {
          psl.promotionId = id;
          return psl;
        });
        return BaseModel.bulkCreate(PromotionStockLocation, promotionStockLocations, { transaction });
      }
      return [];
    });
  return { success: true };
};
module.exports.checkIsActive = async (clientDB, id = null) => {
  const { Promotion } = clientDB;
  const now = new Date();
  const query = this.getActiveQuery(now);
  if (id) query.id = id;
  return await BaseModel.countAll(Promotion, query);
};

module.exports.getPromotionById = async (id, clientDB) => {
  const {
    Promotion, PromotionStockLocation, PromotionVariant, ProductVariant, StockLocation
  } = clientDB;
  const include = [
    {
      model: PromotionStockLocation,
      attributes: [[Sequelize.col('id'), 'PromotionStockLocationId']],
      include: [
        {
          model: StockLocation,
          attributes: [
            [Sequelize.col('name'), 'stockLocationName'],
            [Sequelize.col('id'), 'stockLocationId']
          ]
        }
      ]
    },
    {
      model: PromotionVariant,
      attributes: [[Sequelize.col('id'), 'PromotionVariantId']],
      include: [
        {
          model: ProductVariant,
          attributes: [
            [Sequelize.col('name'), 'productVariantName'],
            [Sequelize.col('id'), 'productVariantId']
          ]
        }
      ]
    }];
  const options = {
    include,
    where: { id: { [Op.eq]: id } }
  };
  return await Promotion.findOne(options);
};

module.exports.deletePromotionsById = async (ids, clientDB) => {
  const { Promotion } = clientDB;
  const options = {
    where: { id: { [Op.in]: ids } }
  };
  return await Promotion.destroy(options);
};

module.exports.deleteInvoicPromotionsByInvoiceId = async (invoiceId, clientDB, transaction) => {
  const { InvoicePromotion } = clientDB;
  const options = {
    where: { invoiceId: { [Op.in]: invoiceId } }
  };
  if (transaction) {
    options.transaction = transaction;
  }
  const invoicePromotions = await InvoicePromotion.findAll(options);
  const invoicePromotionIds = invoicePromotions.map((invoicePromotion) => invoicePromotion.id);
  await deletePromotionInvoiceVariantByInvoicePromotionId(invoicePromotionIds, clientDB, transaction);
  return InvoicePromotion.destroy(options);
};

module.exports.getVariantIdsInActivePromotions = (clientDB, transaction) => {
  const { Promotion, PromotionVariant } = clientDB;
  const activePromotionQuery = module.exports.getActiveQuery(new Date());
  const include = [{
    model: Promotion,
    where: activePromotionQuery,
    required: true,
    attributes: []
  }];
  const attributes = ['productVariantId'];
  return BaseModel.findAll(PromotionVariant, {}, { include, attributes, transaction }, false)
    .then((promotionVariants = []) => promotionVariants.map((pv) => pv.productVariantId));
};
module.exports.getAllActivePromotions = async (clientDB, locationIds, transaction) => {
  const { Promotion, PromotionStockLocation, PromotionVariant } = clientDB;
  const include = [
    // TODO remove renaming.
    { model: PromotionStockLocation, attributes: ['stockLocationId', ['id', 'promotionStockId']], required: false },
    { model: PromotionVariant, attributes: ['productVariantId', ['id', 'promotionVariantId']], required: false },
  ];

  const andConditions = [];
  const locationsQuery = {
    [Op.or]: [
      { isAllLocations: true },
      { '$PromotionStockLocations.stockLocationId$': { [Op.in]: locationIds } }
    ]
  };

  andConditions.push(this.getActiveQuery(new Date()));
  andConditions.push(locationsQuery);
  const options = {
    include,
    where: andConditions,
    transaction
  };
  return Promotion.findAll(options);
};
module.exports.getVariantsPromotion = async (clientDB, variantIds, locationIds) => {
  const { Promotion, PromotionStockLocation, PromotionVariant } = clientDB;
  const include = [
    // TODO remove renaming.
    { model: PromotionStockLocation, attributes: ['stockLocationId', ['id', 'promotionStockId']], required: false },
    { model: PromotionVariant, attributes: ['productVariantId', ['id', 'promotionVariantId']], required: false },
  ];

  const excludedVariantIds = await module.exports.getVariantIdsInActivePromotions(clientDB);
  const andConditions = [];
  const locationsQuery = {
    [Op.or]: [
      { isAllLocations: true },
      { '$PromotionStockLocations.stockLocationId$': { [Op.in]: locationIds } }
    ]
  };
  const variantAllProductsPromotionSubQuery = [{
    isAllProducts: true
  }];
  if (excludedVariantIds && excludedVariantIds.length > 0) {
    variantIds.forEach((v) => {
      variantAllProductsPromotionSubQuery.push(Sequelize.literal(`${v} not in (${excludedVariantIds.toString()})`));
    });
  }
  const variantQuery = {
    [Op.or]: [
      {
        [Op.and]: variantAllProductsPromotionSubQuery
      }, {
        '$PromotionVariants.productVariantId$': { [Op.in]: variantIds },
        isAllProducts: {
          [Op.not]: true
        }
      }
    ]
  };
  // const variantQuery = {
  //   [Op.or]: [
  //     {
  //       isAllProducts: true,
  //       '$PromotionVariants.productVariantId$': {
  //         [Op.or]: {
  //           [Op.notIn]: excludedVariantIds,
  //           [Op.is]: null
  //         }
  //       }
  //     }, {
  //       '$PromotionVariants.productVariantId$': { [Op.in]: variantIds },
  //       isAllProducts: {
  //         [Op.not]: true
  //       }
  //     }
  //   ]
  // };
  andConditions.push(this.getActiveQuery(new Date()));
  andConditions.push(locationsQuery);
  andConditions.push(variantQuery);

  const options = {
    include,
    where: andConditions,
  };
  return Promotion.findAll(options);
};

module.exports.getVariantActivePromotion = async (variantId = 0, stockLocationId = 0, clientDB) => {
  const { Promotion, PromotionStockLocation, PromotionVariant } = clientDB;
  const excludedVariantIds = await module.exports.getVariantIdsInActivePromotions(clientDB);
  const include = [
    // TODO remove renaming.
    { model: PromotionStockLocation, attributes: ['stockLocationId', ['id', 'promotionStockId']], required: false },
    { model: PromotionVariant, attributes: ['productVariantId', ['id', 'promotionVariantId']], required: false },
  ];

  const andConditions = [];
  const locationsQuery = {
    [Op.or]: [
      { isAllLocations: true },
      { '$PromotionStockLocations.stockLocationId$': stockLocationId }
    ]
  };
  const variantAllProductsPromotionSubQuery = [{
    isAllProducts: true
  }];
  if (excludedVariantIds && excludedVariantIds.length > 0) {
    variantAllProductsPromotionSubQuery.push(Sequelize.literal(`${variantId} not in (${excludedVariantIds.toString()})`));
  }
  const variantQuery = {
    [Op.or]: [
      {
        [Op.and]: variantAllProductsPromotionSubQuery
      }, {
        '$PromotionVariants.productVariantId$': variantId,
        isAllProducts: {
          [Op.not]: true
        }
      }
    ]
  };
  andConditions.push(this.getActiveQuery(new Date()));
  andConditions.push(locationsQuery);
  andConditions.push(variantQuery);

  const options = {
    include
  };
  return BaseModel.findOne(Promotion, andConditions, options);
};

module.exports.createInvoicePromotions = async (invoicePromotion, clientDB, transaction) => {
  const { InvoicePromotion, PromotionInvoiceVariant } = clientDB;
  return InvoicePromotion.bulkCreate(invoicePromotion, { transaction, include: [PromotionInvoiceVariant] });
};

const deletePromotionInvoiceVariantByInvoicePromotionId = async (invoicePromotionId, clientDB, transaction) => {
  const { PromotionInvoiceVariant } = clientDB;
  const options = {
    where: { invoicePromotionId: { [Op.in]: invoicePromotionId } },
    transaction
  };
  return PromotionInvoiceVariant.destroy(options);
};

module.exports.deletePromotionVariantsForIntersectedPromotion = async (promotion, promotionId, clientDB, transaction) => {
  if (
    promotion.PromotionVariants
    && Array.isArray(promotion.PromotionVariants)
    && promotion.PromotionVariants.length > 0
  ) {
    const { PromotionVariant, Promotion } = clientDB;
    const { startDate, endDate } = promotion;
    const query = {
      productVariantId: promotion.PromotionVariants.map((pv) => pv.productVariantId)
    };
    const include = [{
      model: Promotion,
      attributes: [],
      where: {
        ...getIntersectedIntervalQuery(startDate, endDate),
        id: { [Op.not]: promotionId }
      }
    }];
    const attributes = ['id'];
    const options = {
      include,
      attributes,
      transaction
    };
    const promotionVariants = await BaseModel.findAll(PromotionVariant, query, options, false);
    const ids = promotionVariants.map((pv) => pv.id);
    await BaseModel.delete(PromotionVariant, { id: ids }, transaction);
  }
  return true;
};
