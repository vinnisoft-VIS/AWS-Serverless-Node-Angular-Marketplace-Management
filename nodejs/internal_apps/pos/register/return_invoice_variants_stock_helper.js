const VariantDAL = require('../../../variant/dal/variant_dal');
const VariantToStockLocationDAL = require('../../../variant/dal/variant_to_stock_location_dal');
const VariantToTrackDAL = require('../../../variant/dal/variant_to_track_dal');
const { VARIANT_TRACK_TYPES } = require('../../../utils/constants/constants');

module.exports.loadAndInitEmptyStocks = async (returnInvoice, sellInvoice, stockLocationId, clientDB, transaction) => {
  const skus = getSkus(returnInvoice, sellInvoice);
  const invoiceProductsVariants = await VariantDAL.getVariantsBySkusForPOSSaleInvoice(skus, stockLocationId, clientDB, true);
  if (sellInvoice.stockLocationId !== stockLocationId) {
    await initVariantsEmptyStocks(invoiceProductsVariants, stockLocationId, clientDB, transaction);
    await initVariantTracksEmptyStocks(invoiceProductsVariants, returnInvoice, sellInvoice, clientDB, transaction);
  }
  return invoiceProductsVariants;
};

function getSkus(returnInvoice, sellInvoice) {
  let skus = [];
  returnInvoice.products.forEach((product) => {
    const sellVariant = sellInvoice.VariantToInvoices.find((sv) => sv.id === product.sellVariantId);
    if (!sellVariant) {
      throw new Error(`product with sku: ${product.sku} is already returned before or not exist`);
    }

    const list = [...sellVariant.CompositeVariantToInvoiceParts, ...sellVariant.VariantToInvoicePacks, ...sellVariant.VariantToInvoiceExtras];
    const listSkus = list.map((ex) => ex.sku);
    skus = [...skus, ...listSkus, product.sku];
  });
  return skus;
}

async function initVariantsEmptyStocks(invoiceProductsVariants, stockLocationId, clientDB, transaction) {
  const promises = invoiceProductsVariants
    .filter((v) => v.ProductVariantToStockLocations.length === 0)
    .map((v) => initEmptyStock(v, stockLocationId, clientDB, transaction));
  await Promise.all(promises);
}

async function initVariantTracksEmptyStocks(invoiceProductsVariants, returnInvoice, sellInvoice, clientDB, transaction) {
  const promises = [];
  invoiceProductsVariants
    .filter((v) => v.trackType === VARIANT_TRACK_TYPES.SERIAL || v.trackType === VARIANT_TRACK_TYPES.BATCH)
    .map((v) => {
      const [stock] = v.ProductVariantToStockLocations;
      const returnVariantWithTracks = returnInvoice.products.find((rv) => rv.sku === v.sku);
      const soldVariantWithTracks = sellInvoice.VariantToInvoices.find((sv) => sv.sku === v.sku);
      const returnedTracks = returnVariantWithTracks.selectedSerials || returnVariantWithTracks.selectedBatches.map((b) => b.trackNo);
      const notExistTracksInLocation = returnedTracks.filter(
        (trackNo) => !stock.VariantToTracks.find((tracks) => tracks.trackNo === trackNo)
      );
      const originalVariantToTrackIds = notExistTracksInLocation.map((trackNo) => {
        const variantToInvoiceTrack = soldVariantWithTracks.VariantToInvoiceTracks.find(
          (vInvTrack) => vInvTrack.trackNo === trackNo
        );
        return variantToInvoiceTrack.variantToTrackId;
      });
      if (originalVariantToTrackIds.length > 0) {
        promises.push(copyAsEmptyVariantToTracksStock(originalVariantToTrackIds, stock, clientDB, transaction));
      }
    });
  await Promise.all(promises);
}

async function initEmptyStock(variant, stockLocationId, clientDB, transaction) {
  const data = {
    productVariantId: variant.id,
    stockLocationId,
    quantity: 0
  };
  const variantToStockLocation = await VariantToStockLocationDAL.createVariantToStockLocation(data, clientDB, transaction);
  variant.ProductVariantToStockLocations.push(variantToStockLocation);
}

async function copyAsEmptyVariantToTracksStock(originalVariantToTrackIds, stock, clientDB, transaction) {
  const originalVariantToTrack = await VariantToTrackDAL.getAllTracksByIds(originalVariantToTrackIds, clientDB, transaction);
  const newVariantToTracks = originalVariantToTrack.rows.map((vToTrack) => ({
    quantity: 0,
    productVariantToStockLocationId: stock.id,
    trackNo: vToTrack.trackNo,
    issueDate: vToTrack.issueDate,
    expiryDate: vToTrack.expiryDate,
    supplierId: vToTrack.supplierId
  }));
  const addedTracks = await VariantToTrackDAL.addBulkTracks(newVariantToTracks, clientDB, transaction);
  stock.VariantToTracks = [...stock.VariantToTracks, ...addedTracks];
}
