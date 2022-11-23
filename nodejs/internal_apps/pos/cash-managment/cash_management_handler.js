const { HttpUtility } = require('../../../utils/http_utility');
const CashManagementService = require('./cash_management_service');
const { prepareLogsQuery } = require('./utilites/common_utilities');
const fileUploadService = require('../../../file/file_upload_service');

module.exports.getRegistersLogsPaginated = async (event, context, callback, clientDB) => {
  try {
    const queryParams = event.queryStringParameters;
    const { limit, offset, ...query } = queryParams;
    const result = await CashManagementService.getRegistersLogsPage(
      limit,
      offset,
      prepareLogsQuery(query),
      clientDB
    );
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.exportRegistersLogs = async (event, context, callback, clientDB) => {
  try {
    const queryParams = event.queryStringParameters;
    const { ...query } = queryParams || [];
    const result = await CashManagementService.exportRegistersLogs(
      prepareLogsQuery(query),
      clientDB
    );
    const currentDate = new Date();
    const params = {
      name: `register_logs_export_${currentDate.getTime()}.csv`,
      type: 'application/octet-stream',
      productJsonList: result
    };
    await fileUploadService.generateExportCsvFileAndUpload(params);
    const exportFileS3SignedUrl = await fileUploadService.getExportFilesSignedURL(params);
    return HttpUtility.respondSuccess(exportFileS3SignedUrl);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};
