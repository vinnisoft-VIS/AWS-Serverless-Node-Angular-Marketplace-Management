const { HttpUtility } = require('../../../utils/http_utility');
const SettingsService = require('./settings_service');

module.exports.getPosSettings = async (event, context, callback, clientDB) => {
  try {
    const result = await SettingsService.loadPosSettings(clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};

module.exports.updatePosSettings = async (event, context, callback, clientDB) => {
  try {
    const result = await SettingsService.updatePosSettings(JSON.parse(event.body), clientDB);
    return HttpUtility.respondSuccess(result);
  } catch (e) {
    return HttpUtility.respondFailure(e);
  }
};
