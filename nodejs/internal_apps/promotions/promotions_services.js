const PromotionDAL = require('./dal/promotions_dal');
const { PROMOTION_TYPES } = require('./constants');
const VariantDAL = require('../../variant/dal/variant_dal');
const StockLocationDAL = require('../../stock-location/dal/stock_location_dal');
const PromotionMapping = require('./mapping/promotion_mapping');
const MerchantService = require('../../merchant/merchant_service');
const { DATA_PERMISSION_TYPES } = require('../../utils/constants/constants');
const MerchantDAL = require('../../merchant/dal/merchant_dal');
const PromotionImportExportService = require('./import-export/promotion_import_export_service');
const ImportDataDynamoDbDAL = require('../../product/import-export/bulk_update/dynamodb/dynamodb_import_data_dal');
const { IMPORT_DATA_TYPES: { PROMOTION } } = require('../../history-log/nosql/dynamodb/constants');

module.exports.import = async (event, dbConnection) => {
  try {
    const requestBody = JSON.parse(event.body);

    const { fileName, ...templateData } = requestBody;
    const { promotion } = event;
    const promotionId = event.promotion.id;

    console.log('promotionId:', promotionId);

    const email = event.requestContext.authorizer.claims['cognito:username'];
    const merchant = await MerchantDAL.getMerchantIdByEmail(email);

    const result = await PromotionImportExportService
      .import({ fileName },
        { ...templateData, merchantId: merchant.id, promotion }, dbConnection);

    let status;
    if (result.status === 'import-started') {
      status = result.hasErrors ? 'import-finished-with-errors' : 'import-finished-without-errors';
    } else {
      status = result.status;
    }

    const url = result.importResultUrl;
    await ImportDataDynamoDbDAL.updateProcessedFileLog(
      fileName, merchant.id, event.schemaName, status, url, undefined, undefined, PROMOTION
    );

    return result;
  } catch (e) {
    return e;
  }
};

module.exports.createSimplePromotion = async (promotionBody, clientDB) => {
  const promotion = { ...promotionBody, type: PROMOTION_TYPES.SIMPLE };
  if (promotion.isImport) promotion.PromotionVariants = [];
  return clientDB.sequelize.transaction(async (transaction) => {
    const createdPromotion = await PromotionDAL.createPromotion(promotion, clientDB, transaction);
    const { id } = createdPromotion;
    await PromotionDAL
      .deletePromotionVariantsForIntersectedPromotion(createdPromotion, id, clientDB, transaction);
    return createdPromotion;
  });
};

module.exports.getPromotionList = async (queryParams, clientDB) => {
  const { limit, offset, ...query } = queryParams;
  const locations = await MerchantService
    .getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
  const promotions = await PromotionDAL.getPromotionList(locations, query, offset ? parseInt(offset, 10) : 0, limit ? parseInt(limit, 10) : 10, clientDB);
  const mappedPromotion = {
    count: promotions ? promotions.count : 0,
    rows: promotions ? promotions.rows.map((row) => row.toJSON()) : []
  };
  mappedPromotion.rows = PromotionMapping.mapPromotionsStatus(mappedPromotion.rows);
  return mappedPromotion;
};

module.exports.updateSimplePromotion = async (id, promotion, clientDB) => {
  if (!promotion.endDate) promotion.endDate = null;
  const previousPromotion = await PromotionDAL.checkActiveOrUpcomingAllProductPromotionExists(clientDB);

  return clientDB.sequelize.transaction((transaction) => PromotionDAL.updatePromotion(id, promotion, previousPromotion ? previousPromotion.id : null, clientDB, transaction));
};
module.exports.checkIsActive = async (clientDB, id) => await PromotionDAL.checkIsActive(clientDB, id);

module.exports.getDuplicatedProductsExistsInPromotionBody = async (promotion, promotionId, clientDB) => {
  const allProductIntersectedPromo = await PromotionDAL
    .getIntersectedAllProductsPromotion(promotion, promotionId, clientDB);
  let result = 0;
  if (allProductIntersectedPromo) {
    const variantIds = promotion.PromotionVariants && promotion.PromotionVariants.length > 0 ?
      promotion.PromotionVariants.map((p) => p.productVariantId) : [];
    if (variantIds.length > 0) {
      const productNames = await VariantDAL.getProductNamesByVariantIds(variantIds, clientDB);
      result = productNames && productNames.length > 0 ? productNames : 0;
    }
  } else {
    result = await PromotionDAL
      .getDuplicatedProductsExistsInPromotionBody(promotion, promotionId, clientDB);
  }
  return result;
};

module.exports.getIntersectedAllProductsPromotion = (promotion, promotionId, clientDB) => PromotionDAL.getIntersectedAllProductsPromotion(promotion, promotionId, clientDB);

module.exports.getProductsInNoneAllProductsActivePromotion = (promotion, promotionId, clientDB) => PromotionDAL.getDuplicatedProductsExistsInPromotionBody(promotion, promotionId, clientDB);

module.exports.searchProductVariants = async (query, clientDB) => {
  const offset = 0;
  const limit = 10;
  return await VariantDAL.searchVariantsNameAndSkuAndBarCode(query, offset, limit, clientDB);
};
module.exports.searchActiveStockLocations = async (name, clientDB) => await StockLocationDAL.getActiveStockLocationByName(name, clientDB);

module.exports.getPromotionById = async (id, clientDB) => {
  const promotion = await PromotionDAL.getPromotionById(id, clientDB);
  return PromotionMapping.mapPromotionStatus(promotion.toJSON());
};

module.exports.deletePromotions = async (ids, clientDB) => await PromotionDAL.deletePromotionsById(ids, clientDB);

module.exports.getAllActivePromotion = async (clientDB, locationIds) => PromotionDAL.getAllActivePromotions(clientDB, locationIds);

module.exports.getVariantIdsInActivePromotions = async (clientDB, transaction) => PromotionDAL.getVariantIdsInActivePromotions(clientDB, transaction);

module.exports.getVariantPromotion = async (clientDB, locationIds, products = null, transaction) => {
  const promotions = await PromotionDAL.getAllActivePromotions(clientDB, locationIds, transaction);
  const mappedPromotions = promotions ? promotions.map((promotion) => promotion.toJSON()) : [];
  return mappedPromotions.map((mappedPromotion) => {
    if (products) {
      mappedPromotion.PromotionAmounts = products.map((p) => ({
        sku: p.sku,
        promotion: p.calculatedPromotionAmount
      }));
    }
    return mappedPromotion;
  });
};

module.exports.getVariantActivePromotion = async (variantId, stockLocationId, clientDB) => PromotionDAL.getVariantActivePromotion(variantId, stockLocationId, clientDB);

module.exports.createInvoicePromotions = async (variants, invoice, clientDB, transaction) => {
  const invoicePromotions = [];
  variants.map((variant) => {
    const { promotion } = variant;
    if (promotion && !invoicePromotions.find((ip) => ip.invoiceId === invoice.id && ip.promotionId === promotion.id)) {
      const invoicePromotion = createInvoicePromotion(promotion, invoice);
      invoicePromotion.PromotionInvoiceVariants.push(...createPromotionInvoiceVariant(variant.id, promotion, invoice.VariantToInvoices));
      invoicePromotions.push(invoicePromotion);
    } else {
      invoicePromotions.map((invoicePromotion) => {
        if (promotion && invoicePromotion.promotionId === promotion.id) {
          invoicePromotion.PromotionInvoiceVariants.push(...createPromotionInvoiceVariant(variant.id, promotion, invoice.VariantToInvoices));
        }
      });
    }
  });
  return await PromotionDAL.createInvoicePromotions(invoicePromotions, clientDB, transaction);
};

const createInvoicePromotion = (promotion, invoice) => ({
  invoiceId: invoice.id,
  promotionId: promotion.id,
  startDate: promotion.startDate,
  endDate: promotion.endDate,
  type: promotion.type,
  discountType: promotion.discountType,
  amount: promotion.amount,
  isAllProducts: promotion.isAllProducts,
  isAllLocations: promotion.isAllLocations,
  name: promotion.name,
  PromotionInvoiceVariants: []
});

const createPromotionInvoiceVariant = (variantId, promotion, variantToInvoices) => {
  const variantToInvoice = getVariantToInvoice(variantId, variantToInvoices);
  let promotionAmount;
  if (promotion.PromotionAmounts) {
    promotionAmount = getVariantToInvoiceBySku(promotion.PromotionAmounts, variantToInvoice);
  }
  const promotionVariant = getPromotionVariantId(variantId, promotion);
  const promotionInvoiceVariants = [];

  promotionInvoiceVariants.push({
    variantToInvoiceId: variantToInvoice ? variantToInvoice.id : null,
    calculatedAmount: promotionAmount ? promotionAmount.promotion : null,
    variantToInvoiceExtraId: null,
    promotionVariantId: promotionVariant ? promotionVariant.promotionVariantId : null,
  });

  // const promotionInvoiceExtra = createPromotionInvoiceExtra(promotionVariant, variantToInvoice);
  // if(promotionInvoiceExtra.length > 0)
  //     promotionInvoiceVariants.push(...promotionInvoiceExtra);
  return promotionInvoiceVariants;
};
const getVariantToInvoice = (variantId, variantToInvoices) => variantToInvoices.find((vi) => vi.productVariantId === variantId);
const getVariantToInvoiceBySku = (promotionAmounts, variantToInvoice) => promotionAmounts.find((p) => p.sku === variantToInvoice.sku);
const getPromotionVariantId = (variantId, promotion) => promotion.PromotionVariants.find((pv) => pv.productVariantId === variantId);
const createPromotionInvoiceExtra = (promotionVariant, variantToInvoice) => {
  const promotionInvoiceVariant = [];
  variantToInvoice.VariantToInvoiceExtras.map((extra) => {
    promotionInvoiceVariant.push({
      variantToInvoiceId: null,
      variantToInvoiceExtraId: extra.id,
      promotionVariantId: promotionVariant ? promotionVariant.promotionVariantId : null,
    });
  });
  return promotionInvoiceVariant;
};

module.exports.deleteInvoicPromotionsByInvoiceId = async (invoiceId, clientDB, transaction) => await PromotionDAL.deleteInvoicPromotionsByInvoiceId(invoiceId, clientDB, transaction);

module.exports.getAllProductsActivePromotion = async (clientDB) => PromotionDAL.checkIfAllProductPromotionExists(clientDB);
