const AWS = require('aws-sdk');
const { EVENT_OBJECT } = require('../../../../history-log/nosql/dynamodb/constants');
const DynamoCommonUtil = require('../../../../history-log/nosql/dynamodb/utils/common');

module.exports.getProcessedFileLog = async (fileName, merchantId, clientSchemaName) => {
  const tableName = `${clientSchemaName}_${EVENT_OBJECT.IMPORT_PROMOTION}`;

  const queryStatement = `select * from ${tableName} where fileName = '${fileName}' and type = 'file'`; // and merchantId = ${merchantId}`;
  const result = await DynamoCommonUtil.queryWithPartiQL(queryStatement);
  console.log('------------------- result', result);
  if (result && result.Items && Array.isArray(result.Items) && result.Items.length > 0) {
    console.log('result', AWS.DynamoDB.Converter.unmarshall(result.Items[0]));
    return AWS.DynamoDB.Converter.unmarshall(result.Items[0]);
  }
};

module.exports.updateProcessedFileLog = async (
  fileName, merchantId, clientSchemaName, status,
  url, lastProcessedCode, processedRowsLogsCount) => {
  const tableName = `${clientSchemaName}_${EVENT_OBJECT.IMPORT_PROMOTION_PRODUCT}`;
  const queryStatement = `update ${tableName} `
    + `${status ? `set status = '${status}'` : ''} `
    + `${url ? `set importResultUrl = '${url}'` : ''} `
    + `${lastProcessedCode ? `set lastProcessedCode = '${lastProcessedCode}'` : ''} `
    + `${processedRowsLogsCount ? `set processedRowsLogsCount = '${processedRowsLogsCount}'` : ''} `
    + `where fileName = '${fileName}' and code = '${fileName}' and type = 'file' and merchantId = ${merchantId}`;
  await DynamoCommonUtil.queryWithPartiQL(queryStatement);
};
