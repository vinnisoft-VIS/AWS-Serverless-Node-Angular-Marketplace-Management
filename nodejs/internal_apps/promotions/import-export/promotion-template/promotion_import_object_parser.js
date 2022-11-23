const COLUMNS = require('./promotion_import_fields');

class SKUTemplateObjectToProductParser {
  static parse(row, templateData) {
    return this.getSKU(row, templateData);
  }

  static getSKU(row) {
    const sku = {
      sku: row[COLUMNS.SKU.HEADER],
    };
    return sku;
  }
}

module.exports = SKUTemplateObjectToProductParser;
