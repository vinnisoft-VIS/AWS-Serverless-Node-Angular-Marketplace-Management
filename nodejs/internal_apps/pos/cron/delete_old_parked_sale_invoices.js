const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const { getClientDB, closeClientDBConnection } = require('../../../models/client');
const { closeCommonDBConnection } = require('../../../models/common');
const InvoiceDAL = require('../invoices/dal/invoice_dal');
const InvoiceHelper = require('../register/invoice_helper');

module.exports.deleteOldParkedSalesInvoices = async () => {
  const merchants = await MerchantDAL.getSchemaNameForMerchantsMainAccounts();
  const schemaNames = merchants.map((merchant) => merchant.schemaName);
  for (const schema of schemaNames) {
    let clientDB;
    try {
      clientDB = await getClientDB(schema);
      const invoiceIds = await InvoiceDAL.getOldParkedSalesInvoiceIds(clientDB);
      await InvoiceDAL.deleteOldParkedSalesInvoices(clientDB);
      const promises = [];

      invoiceIds?.forEach((invoice) => {
        console.log(`deleted invoice id - ${invoice.id}`);
        promises.push(InvoiceHelper.deleteInvoiceProducts(invoice.id, clientDB));
      });

      await Promise.all(promises);
    } catch (e) {
      console.error(`failed to delete old parked invoices for merchant db ${schema}, error ==> ${JSON.stringify(e)}`);
    } finally {
      await closeClientDBConnection(clientDB);
    }
  }
  await closeCommonDBConnection();
};
