const Sequelize = require('sequelize');
const { BaseModel } = require('../../../utils/base-model');

const { Op } = Sequelize;

module.exports.loadPosSettings = async (dbClientConnection, transaction) => {
  const { InternalPosSettings } = dbClientConnection;
  return BaseModel.findAll(InternalPosSettings, {}, { transaction }, false);
};

module.exports.updatePosSettings = async (settings, dbClientConnection) => {
  const { InternalPosSettings } = dbClientConnection;
  return dbClientConnection.sequelize.transaction(async (transaction) => {
    const posSettings = settings.map((s) => ({ settingName: s.settingName, settingValue: s.settingValue }));
    await BaseModel.bulkCreate(InternalPosSettings, posSettings, { updateOnDuplicate: ['settingValue'], transaction });
    return BaseModel.findAll(InternalPosSettings, {}, { transaction }, false);
  });
};
