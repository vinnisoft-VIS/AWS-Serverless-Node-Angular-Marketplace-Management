const RegisterActionLogsDAL = require('../register/dal/register_action_logs_dal');
const { LOG_TYPES, SHIFT_STATUS } = require('../register/utilities/constants');
const DateUtil = require('../utlities/common_utilites');
const { DATA_PERMISSION_TYPES } = require('../../../utils/constants/constants');
const MerchantService = require('../../../merchant/merchant_service');

module.exports.getRegistersLogsPage = async (limit, offset, query, clientDB) => {
  const userLocations = await MerchantService.getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
  const result = await RegisterActionLogsDAL.getRegisterShifts(parseInt(limit, 10), parseInt(offset, 10), query, userLocations, clientDB);
  const rows = result.rows.map((row) => {
    const shift = row.toJSON();
    const creationDate = new Date(shift.createdAt);
    shift.date = DateUtil.getFormattedDate(creationDate);
    if (shift.isBalanced && shift.status === SHIFT_STATUS.CLOSED) {
      shift.status = SHIFT_STATUS.BALANCED;
    } else if (shift.status === SHIFT_STATUS.CLOSED) {
      shift.status = SHIFT_STATUS.UNBALANCED;
    }

    if (shift.status === SHIFT_STATUS.CLOSED) {
      shift.RegisterActionLogs.forEach((log) => {
        log.date = log.createdAt;
      });
    }
    shift.userName = shift.RegisterActionLogs[0] ? shift.RegisterActionLogs[0].userName : '';
    return shift;
  });
  return {
    result: rows,
    total: result.count
  };
};

module.exports.exportRegistersLogs = async (query, clientDB) => {
  const userLocations = await MerchantService.getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
  const result = await RegisterActionLogsDAL.getRegisterShifts(null, null, query, userLocations, clientDB);
  let recordNumber = 0;
  const rows = result.rows.flatMap((row) => {
    const shift = row.toJSON();
    recordNumber += 1;
    shift.RegisterActionLogs = shift.RegisterActionLogs.flatMap((log) => {
      const creationDate = new Date(log.createdAt);
      log.date = DateUtil.getFormattedDate(creationDate);
      log.time = DateUtil.getFormattedTime(creationDate);
      log.recordNumber = recordNumber;
      if (log.type === LOG_TYPES.CLOSE) {
        return log.RegisterClosingLogs.flatMap((x) => {
          const type = `${LOG_TYPES.CLOSE}  (${x.paymentMethodName})`;
          return {
            ...log,
            type,
            amount: x.amount,
            expectedAmount: x.expectedAmount,
          };
        });
      }
      return {
        ...log,
        expectedAmount: '',
      };
    });

    shift.RegisterActionLogs = shift.RegisterActionLogs.map((log) => ({
      'Record number': log.recordNumber,
      'location name ': shift.stockLocationName,
      'Register name ': shift.registerName,
      'User name': log.username,
      'Time ': log.time,
      'Date ': log.date,
      'Note ': log.notes,
      'Transaction type': log.type,
      'Entered value ': log.amount,
      'Expected value ': log.expectedAmount,
    }));
    return shift.RegisterActionLogs;
  });
  return rows;
};
