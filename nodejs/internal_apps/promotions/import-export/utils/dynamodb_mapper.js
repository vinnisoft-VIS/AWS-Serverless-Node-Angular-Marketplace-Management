const { getCurrentDate } = require('../../../../utils/commonUtils');
const {
  EVENT_IMPORT_PROMOTION_PRODUCT_OBJECT_ATTRIBUTE: {
    IMPORT_PROMOTION_PRODUCT
  },
  IMPORT_DATA_TYPES
} = require('../../../../history-log/nosql/dynamodb/constants');
const { mapImportDataTableAttributes } = require('../../../../history-log/nosql/dynamodb/utils/import_data_utils');

module.exports.mapToImportSkuDynamoDb = (
  merchantId, fileName, type, clientSchemaName, sku, status, rowObject
) => {
  const mappedObject = {
    ...mapImportDataTableAttributes(clientSchemaName, `${fileName}-${sku}`, IMPORT_DATA_TYPES.PROMOTION)
  };
  mappedObject[`${IMPORT_PROMOTION_PRODUCT.MERCHANT_ID}`] = merchantId;
  mappedObject[`${IMPORT_PROMOTION_PRODUCT.FILE_NAME}`] = fileName;
  mappedObject[`${IMPORT_PROMOTION_PRODUCT.TYPE}`] = type;
  mappedObject[`${IMPORT_PROMOTION_PRODUCT.EVENT_DATE}`] = getCurrentDate();
  mappedObject[`${IMPORT_PROMOTION_PRODUCT.STATUS}`] = status;
  if (rowObject && JSON.stringify(rowObject) !== JSON.stringify({})) {
    Object.keys(rowObject).forEach((key) => {
      mappedObject[key.split(' ').join('-')] = rowObject[key];
    });
  }
  return mappedObject;
};
