const PromotionImportExportService = require('./promotion_import_export_service');
const { HttpUtility } = require('../../../utils/http_utility');
const { parseIntoTemplate } = require('../../../utils/import_template_parser');
const ImportDataDynamoDbDAL = require('../../../product/import-export/bulk_update/dynamodb/dynamodb_import_data_dal');
const { IMPORT_DATA_TYPES: { PROMOTION } } = require('../../../history-log/nosql/dynamodb/constants');
const MerchantDAL = require('../../../merchant/dal/merchant_dal');
const LambdaUtility = require('../../../utils/lambda_utility');

module.exports.generatePromotionTemplate = async (event, context, callback, clientDB) => {
  try {
    const template = PromotionImportExportService.generateTemplate();
    const result = parseIntoTemplate(template);
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.getImportProgress = async (event, context, callback, clientDB) => {
  const queryParams = event.queryStringParameters;
  try {
    const { fileName, merchantId } = queryParams;
    const clientSchemaName = clientDB.clientDBName;
    const processedFileLog = await ImportDataDynamoDbDAL
      .getProcessedFileLog(fileName, merchantId, clientSchemaName, PROMOTION);
    const result = {};
    if (processedFileLog && processedFileLog.importResultUrl) {
      result.importResultUrl = processedFileLog.importResultUrl;
    } else {
      result.importResultUrl = '';
    }

    if (processedFileLog && processedFileLog.lastProcessedDataRow) {
      result.lastProcessedDataRow = processedFileLog.lastProcessedDataRow;
    } else {
      result.lastProcessedDataRow = '';
    }

    if (processedFileLog && processedFileLog.processedRowsLogsCount) {
      result.processedRows = +processedFileLog.processedRowsLogsCount;
    } else {
      result.processedRows = 0;
    }

    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.reImport = async (event, context, callback, clientDB) => {
  try {
    if (event.importStarted) {
      const requestBody = JSON.parse(event.body);
      const {
        fileName,
        promotionId,
        ...templateData
      } = requestBody;
      const promotion = { id: promotionId };
      const email = event.requestContext.authorizer.claims['cognito:username'];
      const merchant = await MerchantDAL.getMerchantIdByEmail(email);

      const result = await PromotionImportExportService
        .import({ fileName },
          {
            ...templateData,
            merchantId: merchant.id,
            promotion
          }, clientDB);

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

      return HttpUtility.respondSuccess(result);
    }
    const processImportEvent = {
      ...event,
      importStarted: true,
      schemaName: clientDB.clientDBName
    };
    await LambdaUtility.invokeLambdaAsyncPromisified('processImportPromotion', processImportEvent);
    return HttpUtility.respondSuccess({ importStarted: true });
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.cancelImport = async (event, context, callback, clientDB) => {
  try {
    const requestBody = JSON.parse(event.body);
    const {
      fileName, merchantId
    } = requestBody;
    const clientSchemaName = clientDB.clientDBName;

    const processedFileLog = await ImportDataDynamoDbDAL
      .getProcessedFileLog(fileName, merchantId, clientSchemaName, PROMOTION);

    if (processedFileLog) await ImportDataDynamoDbDAL.updateProcessedFileLog(fileName, merchantId, clientSchemaName, 'import-canceled', undefined, undefined, undefined, PROMOTION);

    return HttpUtility.respondSuccess({ importCanceled: true });
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};
