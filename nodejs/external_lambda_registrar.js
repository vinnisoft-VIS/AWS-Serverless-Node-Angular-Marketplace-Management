const PermissionsUtility = require('./merchant/utils/permission_utility');
const { UNAUTHORIZED } = require('./utils/error/constants/ERRORS');
const { closeCommonDBConnection } = require('./models/common');
const { getClientDB, closeClientDBConnection } = require('./models/client');
const { HttpUtility } = require('./utils/http_utility');
const data_authenticator = require('./merchant/data_authenticator');

const ExternalInvoiceHandler = require('./external-apis/invoice/invoice_handler');
const ExternalOrderInvoiceHandler = require('./external-apis/order/invoice/order_invoice_handler');

const Method_TYPE = {
  POST: 'POST',
  GET: 'GET',
  PUT: 'PUT',
  DELETE: 'DELETE'
};

let registrar = [];

// Order Invoice Endpoints
registrar.push(getLambdaRegistrarObject(ExternalOrderInvoiceHandler.getPaginatedOrderInvoices, '/external/orders/invoices', Method_TYPE.GET));

// Invoice Endpoints
registrar.push(getLambdaRegistrarObject(ExternalInvoiceHandler.getAllInvoicesByType, '/external/purchaseOrders', Method_TYPE.GET));
registrar.push(getLambdaRegistrarObject(ExternalInvoiceHandler.getAllInvoicesByType, '/external/returnStocks', Method_TYPE.GET));

function getLambdaRegistrarObject(handler, path, method) {
  return {
    handler,
    path,
    method
  };
}

module.exports.handler = async (event, context, callback) => {
  let clientDB;
  try {
    // WarmUP first
    if (event.source === 'serverless-plugin-warmup') {
      console.log('WarmUP - Lambda is warm!');
      return callback(null, 'Lambda is warm!');
    }

    let service = registrar.find((f) => f.path === event.resource && f.method === event.httpMethod);
    const email = event.requestContext.authorizer.claims['cognito:username'];
    const clientSchemaName = event.requestContext.authorizer.claims['custom:schema_name'];
    await PermissionsUtility.validateUserPermissions(email, event.path);

    clientDB = await getClientDB(clientSchemaName);
    data_authenticator.setCurrentUserInfo(email, clientSchemaName);
    return await service.handler(event, context, callback, clientDB);
  } catch (e) {
    console.log(e);
    if (e === UNAUTHORIZED) {
      return HttpUtility.respondUnauthorized(e);
    }
    return HttpUtility.respondFailure(e);
  } finally {
    await closeCommonDBConnection();
    await closeClientDBConnection(clientDB);
  }
};
