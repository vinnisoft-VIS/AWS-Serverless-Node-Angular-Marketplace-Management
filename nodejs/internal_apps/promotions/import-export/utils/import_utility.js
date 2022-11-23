// @ts-check
const XLSX = require('xlsx');
const FileUploadService = require('../../../../file/file_upload_service');
const CommonValidator = require('../validation/common_validator');
const DynamoDbMapper = require('./dynamodb_mapper');
const TEMPLATE_SKUS_SCHEMA = require('../validation/promotion_import_schema');
const Validator = require('../../../../utils/Validator');
const RowParser = require('../promotion-template/promotion_import_object_parser');
const LambdaUtility = require('../../../../utils/lambda_utility');
const PromotionDAL = require('../../dal/promotions_dal');
const { DuplicateObjectError } = require('../../../../utils/error/errors');
const ERRORS = require('../../../../utils/error/constants/ERRORS');
const ERROR_TIPS = require('../../../../utils/error/constants/error_tips');
const { parseTemplateDataIntoData } = require('../../../../utils/import_template_parser');
const ImportDataDynamoDbDAL = require('../../../../product/import-export/bulk_update/dynamodb/dynamodb_import_data_dal');
const { IMPORT_DATA_TYPES } = require('../../../../history-log/nosql/dynamodb/constants');

module.exports.import = async (filePath, promotionTemplate, templateParams, dbConnection) => {
  const importResult = {
    hasErrors: false,
    formatError: false,
    importResultUrl: '',
    count: 0
  };

  const originUploadedSkus = [];

  const schemaName = dbConnection.clientDBName;
  const { fileName } = filePath;
  const fileStream = await FileUploadService.readFileAsBuffer(fileName);
  const skus = extractSKUsFromWorkBook(fileStream, promotionTemplate);
  CommonValidator.validateSpreadSheetFile(skus, promotionTemplate);
  await validateDuplicateHeader(skus, promotionTemplate, importResult, originUploadedSkus);
  let status = 'import-started';
  const importLog = DynamoDbMapper.mapToImportSkuDynamoDb(
    templateParams.merchantId, fileName, 'file', schemaName, fileName, status
  );
  await LambdaUtility.invokeLambdaAsyncPromisified('DynamoDb', importLog);

  const templateSKUsschema = TEMPLATE_SKUS_SCHEMA();
  for (const sku of skus) {
    const processedFileLog = await ImportDataDynamoDbDAL.getProcessedFileLog(
      fileName, templateParams.merchantId, schemaName, IMPORT_DATA_TYPES.PROMOTION
    );
    if (processedFileLog && processedFileLog.status === 'import-canceled') {
      status = processedFileLog.status;
      originUploadedSkus.push({
        ...sku,
        errors: 'Import Canceled'
      });
    } else {
      await processSku(sku, templateSKUsschema, templateParams,
        importResult, originUploadedSkus, dbConnection, fileName, templateParams.merchantId);
    }
  }
  importResult.importResultUrl =
      await uploadOutputErrorFile(originUploadedSkus);

  importResult.count = originUploadedSkus.length;
  importResult.status = status;
  return importResult;
};

function extractSKUsFromWorkBook(data, template) {
  const workbook = XLSX.read(data, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const skus = XLSX.utils.sheet_to_json(worksheet, {
    raw: true
  });

  return parseTemplateDataIntoData(skus, template);
}

async function uploadOutputErrorFile(SKUsList) {
  const params = {
    name: `promotion_import_errors_${new Date().getTime()}.csv`,
    type: 'application/octet-stream',
    productJsonList: SKUsList
  };
  await FileUploadService.generateExportCsvFileAndUpload(params);
  const exportFileS3SignedUrl = FileUploadService.getExportFilesSignedURL(params);
  return exportFileS3SignedUrl;
}

const processSku = async (
  skuRow, templateSkuSchema, templateParams,
  importResult, originUploadedSkus, dbConnection,
  fileName, merchantId) => {
  try {
    const skuRowForValid = {
      ...skuRow
    };

    if (!isFormatSkuDataValid(templateSkuSchema, importResult,
      skuRowForValid, originUploadedSkus)) {
      return;
    }

    const parsedSku = RowParser.parse(skuRow);

    await saveSku(parsedSku, dbConnection, originUploadedSkus, templateParams.promotion);

    originUploadedSkus.push({ ...skuRow, errors: '' });
  } catch (e) {
    console.log('error while importing row', e);
    importResult.hasErrors = true;
    originUploadedSkus.push({ ...skuRow, errors: e.message, tip: e.tip });
  } finally {
    const lastProcessedRow = originUploadedSkus[originUploadedSkus.length - 1];
    const status = lastProcessedRow.errors ? 'not-imported' : 'imported';
    const parsedSku = RowParser.parse(skuRow);
    const importLog = DynamoDbMapper.mapToImportSkuDynamoDb(
      merchantId, fileName, IMPORT_DATA_TYPES.PROMOTION,
      dbConnection.clientDBName, parsedSku.sku, status,
      lastProcessedRow
    );
    await LambdaUtility.invokeLambdaAsyncPromisified('DynamoDb', importLog);
    await updateProcessedFileLog(fileName, merchantId,
      dbConnection.clientDBName, `${lastProcessedRow['Product SKU']}`,
      originUploadedSkus.length);
  }
};

const validateDuplicateHeader = async (
  parsedFileRows, skuTemplate, importResult, originUploadedSkus) => {
  try {
    const firstSkuRow = parsedFileRows[0];
    if (firstSkuRow && firstSkuRow['Product SKU'] === skuTemplate[0]['Product SKU']) {
      throw new DuplicateObjectError(
        ERRORS.FILES.DUPLICATE_HEADER,
        ERROR_TIPS.PROMOTIONS.DUPLICATE_HEADER,
      );
    }
  } catch (e) {
    console.log('error duplicate header', e);
    importResult.hasErrors = true;
    originUploadedSkus.push({ errors: e.message, tip: e.tip });
    parsedFileRows.shift();
  }
};

const saveSku = async (parsedSku, dbConnection, originUploadedSkus, promotion) => {
  if (originUploadedSkus.find((c) => c['Product SKU'] === parsedSku.sku)) {
    throw new DuplicateObjectError(
      ERRORS.PROMOTIONS.DUPLICATE_SKU,
      ERROR_TIPS.PROMOTIONS.DUPLICATE_SKU
    );
  }
  return dbConnection.sequelize.transaction((transaction) => PromotionDAL.importProducts(
    parsedSku.sku, promotion, dbConnection, transaction
  ));
};

function isFormatSkuDataValid(templateSkuSchema, importResult, json, originUploadedSkus, i) {
  try {
    Validator.validate(templateSkuSchema, json);
    return true;
  } catch (e) {
    importResult.hasErrors = true;
    let field;
    e.errors.forEach((error) => {
      switch (error.keyword) {
        case 'required':
          // requirement not fulfilled.
          error.message = `${error.params.missingProperty} is missing`;
          error.tip = ERROR_TIPS.getConvertedErrorTip(ERROR_TIPS.PROMOTIONS.FIELD_MISSING, 'field', error.params.missingProperty);
          break;
        case 'type':
          field = error.dataPath;
          field = field.substring(2, field.length - 2);
          error.message = `${field} have wrong data type should be ${error.params.type}`;
          error.tip = ERROR_TIPS.getConvertedErrorTip(ERROR_TIPS.PROMOTIONS.FIELD_TYPE, 'type', field);
          break;
        case 'enum':
          field = error.dataPath;
          field = field.substring(1);
          error.message = `${field} have wrong data type should be (${error.params.allowedValues})`;
          error.tip = ERROR_TIPS.getConvertedErrorTip(ERROR_TIPS.PROMOTIONS.FIELD_TYPE, 'type', field);
          break;
        default:
        // error.message = 'Unknown input error.';
      }
    });
    const errorsAsString = e.errors.reduce((allErrors, error) => `${allErrors + error.message};`, '');
    const errorTipsAsString = e.errors.reduce((allErrors, error) => `${allErrors + error.tip};`, '');
    originUploadedSkus.push({
      i, ...json, errors: errorsAsString, tip: errorTipsAsString
    });
    return false;
  }
}

async function updateProcessedFileLog(fileName, merchantId, clientSchemaName, lastProcessedCode, processedRowsLogsCount) {
  const status = undefined;
  const url = undefined;
  await ImportDataDynamoDbDAL.updateProcessedFileLog(
    fileName, merchantId, clientSchemaName, status, url, lastProcessedCode, processedRowsLogsCount, IMPORT_DATA_TYPES.PROMOTION
  );
}
