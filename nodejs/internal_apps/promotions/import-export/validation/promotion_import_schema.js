const COLUMNS = require('../promotion-template/promotion_import_fields');

const getSKUSchema = () => {
  const properties = {
    [COLUMNS.SKU.HEADER]: { type: 'string', maxLength: 200 },
  };

  return {
    type: 'object',
    properties,
    required: [
      COLUMNS.SKU.HEADER,
    ]
  };
};

module.exports = getSKUSchema;
