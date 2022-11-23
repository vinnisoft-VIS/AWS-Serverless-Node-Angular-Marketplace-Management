const aws = require('aws-sdk');

aws.config.update({ region: '@aws_region@' });

exports.generateSocketMessage = async (event, data) => {
  console.log(data);
  const CONNECTOR_OPTS = {
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName === 'localhost' ? 'http://localhost:3001' : `${event.requestContext.domainName}/${event.requestContext.stage}`
  };
  const connector = new aws.ApiGatewayManagementApi(CONNECTOR_OPTS);
  try {
    return await connector.postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: JSON.stringify(data)
    }).promise();
  } catch (error) {
    console.error('Unable to generate socket message', error);
  }
};
