const { Op } = require('sequelize');
const {
  LOG_TYPES,
  SHIFT_FILTER_STATUS,
  SHIFT_STATUS
} = require('../utilities/constants');
const { BaseModel } = require('../../../../utils/base-model');

module.exports.insertActionLog = async (log, clientDB, transaction) => {
  const { RegisterActionLog } = clientDB;
  return BaseModel.create(RegisterActionLog, log, { transaction });
};

module.exports.insertCloseLog = async (log, clientDB, transaction) => {
  const {
    RegisterActionLog,
    RegisterClosingLog
  } = clientDB;
  const include = [RegisterClosingLog];
  return BaseModel.create(RegisterActionLog, log, {
    transaction,
    include
  });
};

module.exports.getLastShiftOpenActionLog = (shiftId, clientDB, transaction) => {
  const { RegisterActionLog } = clientDB;
  const query = {
    shiftId,
    type: LOG_TYPES.OPEN
  };
  return BaseModel.findOne(RegisterActionLog, query, { transaction, order: [['createdAt', 'DESC']] });
};

module.exports.loadAddAndWithdrawLogs = (locationId, startTime, endTime, clientDB) => {
  const {
    RegisterActionLog, PaymentMethod, Shift, Register
  } = clientDB;
  const query = {
    type: {
      [Op.in]: [LOG_TYPES.WITHDRAW, LOG_TYPES.ADD]
    },
    createdAt: {
      [Op.between]: [startTime, endTime]
    },
  };

  let include;
  if (locationId) {
    include = [
      PaymentMethod,
      {
        model: Shift,
        include: [Register]
      }
    ];
    query['$Shift->Register.stockLocationId$'] = locationId;
  } else {
    include = [PaymentMethod];
  }
  return BaseModel.findAll(RegisterActionLog, query, { include }, false);
};

module.exports.calculateAdditionsFromRegisterOpening = (shiftId, openingTime, clientDB) => {
  const { RegisterActionLog } = clientDB;
  const query = {
    type: LOG_TYPES.ADD,
    shiftId,
    createdAt: {
      [Op.between]: [openingTime, Date.now()]
    }
  };
  return BaseModel.sum(RegisterActionLog, 'amount', query, {});
};

module.exports.calculateWithdrawalsFromRegisterOpening = (shiftId, openingTime, clientDB) => {
  const { RegisterActionLog } = clientDB;
  const query = {
    type: LOG_TYPES.WITHDRAW,
    shiftId,
    createdAt: {
      [Op.between]: [openingTime, Date.now()]
    }
  };
  return BaseModel.sum(RegisterActionLog, 'amount', query, {});
};

module.exports.buildRegisterShiftsSearch = (limit, offset, query, userLocations, clientDB) => {
  const {
    RegisterActionLog,
    RegisterClosingLog,
    Register
  } = clientDB;
  const include = [
    {
      model: RegisterActionLog,
      order: [['createdAt', 'ASC']],
      include: [
        RegisterClosingLog,
      ],
    }
  ];

  const locations = query.stockLocationId ? userLocations.filter((l) => query.stockLocationId.includes(l)) : userLocations;
  include.push({
    model: Register,
    where: {
      stockLocationId: {
        [Op.in]: locations
      }
    }
  });
  let conditions = {};
  const conditionsArray = [];

  if (query.registerId) {
    conditionsArray.push({ registerId: query.registerId });
  }

  const twoYearsAgo = new Date(new Date().getTime() - (2 * 365 * 24 * 60 * 60 * 1000));
  const startDate = query.fromDate || twoYearsAgo;
  const endDate = query.toDate || new Date();
  conditionsArray.push({ createdAt: { [Op.between]: [startDate, endDate] } });

  if (query.status) {
    if (query.status === SHIFT_FILTER_STATUS.CLOSED_BALANCED) {
      conditionsArray.push({ isBalanced: 1 });
      conditionsArray.push({ status: SHIFT_STATUS.CLOSED });
    } else if (query.status === SHIFT_FILTER_STATUS.CLOSED_UNBALANCED) {
      conditionsArray.push({ isBalanced: 0 });
      conditionsArray.push({ status: SHIFT_STATUS.CLOSED });
    } else {
      conditionsArray.push({ status: SHIFT_STATUS.OPENED });
    }
  }

  if (query.userId) {
    include.push({
      model: RegisterActionLog,
      where: {
        userId: query.userId
      }
    });
  }

  if (conditionsArray.length > 0) {
    conditions = { [Op.and]: conditionsArray };
  }

  return {
    include,
    conditions,
  };
};

module.exports.getRegisterShifts = (limit, offset, query, userLocations, clientDB) => {
  const { Shift } = clientDB;
  const search = this.buildRegisterShiftsSearch(limit, offset, query, userLocations, clientDB);
  const {
    include,
    conditions
  } = search;
  const options = {
    where: conditions,
    limit,
    offset,
    include,
    order: [['createdAt', 'DESC']]
  };
  return Shift.findAndCountAll(options);
};
