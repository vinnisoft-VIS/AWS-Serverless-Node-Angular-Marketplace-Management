const COLUMNS = require('./promotion_import_fields');

module.exports.getTemplate = () => [{
  [COLUMNS.SKU.HEADER]: `${COLUMNS.SKU.HEADER}||${COLUMNS.SKU.HINT}`,
}];
