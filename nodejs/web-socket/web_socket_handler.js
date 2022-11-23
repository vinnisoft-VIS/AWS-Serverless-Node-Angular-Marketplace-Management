/* eslint-disable no-console */
const { WEB_SOCKET_ACTIONS } = require('../utils/constants/constants');
const LambdaHelper = require('../utils/lambda_utility');

exports.handler = async (event) => {
  console.log(event);
  const route = event.requestContext.routeKey;
  const { connectionId } = event.requestContext;
  const { body } = event;
  let message;
  console.log(body);
  console.log(connectionId);
  if (body) {
    message = JSON.parse(body).message;
    event.queryParams = message;
  }
  switch (route) {
    case '$connect':
      console.log('web socket connected');
      break;
    case '$disconnect':
      console.log('web socket disconnected');
      break;
    case WEB_SOCKET_ACTIONS.PRODUCT_EXPORT:
      console.log('web socket products Export');
      await LambdaHelper.invokeLambdaAsyncPromisified('exportProducts', event);
      break;
    case WEB_SOCKET_ACTIONS.PRODUCT_UPDATE_EXPORT:
      console.log('web socket products update Export');
      await LambdaHelper.invokeLambdaAsyncPromisified('exportProductsUpdate', event);
      break;
    case WEB_SOCKET_ACTIONS.INVOICES_EXPORT:
      console.log('web socket invoices Export');
      await LambdaHelper.invokeLambdaAsyncPromisified('exportInvoices', event);
      break;
    case WEB_SOCKET_ACTIONS.STOCK_INVOICES_EXPORT:
      console.log('web socket stock invoicesExport');
      await LambdaHelper.invokeLambdaAsyncPromisified('exportStockInvoices', event);
      break;
    case '$default':
      console.log('web socket connected default');
      break;
    default:
      console.log('unknown websocket route');
  }

  return {
    statusCode: 200
  };
};
