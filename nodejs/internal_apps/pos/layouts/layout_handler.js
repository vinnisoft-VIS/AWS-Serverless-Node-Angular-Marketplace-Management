const LayoutService = require('./layout_service');
const { HttpUtility } = require('../../../utils/http_utility');
const { OPERATION_FAILURE_MESSAGE: { LAYOUT_NOT_FOUND, LAYOUT_DELETED } } = require('../../../utils/application_messages');

module.exports.findAllLayouts = async (event, context, callback, clientDB) => {
  try {
    const result = await LayoutService.findAllLayouts(event.queryStringParameters, clientDB);

    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.deleteLayout = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const status = await LayoutService.deleteLayout(id, clientDB);
    return HttpUtility.respondSuccess({ success: status, id }, LAYOUT_DELETED);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.addLayout = async (event, context, callback, clientDB) => {
  try {
    const layout = JSON.parse(event.body);

    const result = await LayoutService.addLayout(layout, clientDB);

    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.updateLayout = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;
    const query = JSON.parse(event.body);
    const result = await LayoutService.updateLayout(id, query, clientDB);

    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};

module.exports.getLayout = async (event, context, callback, clientDB) => {
  try {
    const { id } = event.pathParameters;

    const result = await LayoutService.getLayout(id, clientDB);

    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e, e.message);
  }
};
