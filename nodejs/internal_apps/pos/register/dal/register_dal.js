const { Op } = require('sequelize');
const { BaseModel } = require('../../../../utils/base-model');
const { REGISTER_STATUS, LOG_TYPES, SHIFT_STATUS } = require('../utilities/constants');
const { PAYMENTS_TYPES } = require('../../../../invoice/utils/constants');

module.exports.createRegisters = async (registers, clientDB, transaction) => {
  const { Register, PaymentMethod, PaymentMethodToRegister } = clientDB;
  const include = [PaymentMethodToRegister];
  const paymentMethods = await BaseModel.findAll(PaymentMethod, {}, {}, false);
  const defaultPaymentMethodToRegisters = [
    {
      paymentMethodId: paymentMethods.filter((pm) => pm.type === PAYMENTS_TYPES.CASH)[0].id,
      isCashManagement: true
    },
    {
      paymentMethodId: paymentMethods.filter((pm) => pm.type === PAYMENTS_TYPES.CARD)[0].id,
      isCashManagement: false
    }
  ];
  registers.filter((r) => !r.PaymentMethodToRegisters || r.PaymentMethodToRegisters.length === 0)
    .forEach((r) => {
      r.PaymentMethodToRegisters = defaultPaymentMethodToRegisters;
    });
  return BaseModel.bulkCreate(Register, registers, { transaction, include });
};

module.exports.createRegister = async (register, clientDB, transaction) => {
  const createdRegisters = await this.createRegisters([register], clientDB, transaction);
  return createdRegisters[0];
};

module.exports.getRegisterById = async (id, clientDB, transaction) => {
  const { Register } = clientDB;
  return BaseModel.findById(Register, id, { transaction });
};
module.exports.getRegisterByIdEvenIfDeleted = async (id, clientDB) => {
  const { Register } = clientDB;
  const options = { paranoid: false };
  return BaseModel.findById(Register, id, options);
};

module.exports.getRegisterByIdEvenIfDeletedWithLocation = async (id, clientDB, transaction) => {
  const { Register, StockLocation } = clientDB;
  const options = { paranoid: false, include: [StockLocation], transaction };
  return BaseModel.findById(Register, id, options);
};
module.exports.getRegisterWithPaymentMethodsToRegister = async (id, clientDB, transaction) => {
  const { Register, PaymentMethodToRegister, PaymentMethod } = clientDB;
  return BaseModel.findById(Register, id, { include: [{
    model: PaymentMethodToRegister,
    include: [PaymentMethod]
  }], transaction });
};

module.exports.updateRegister = async (id, register, clientDB, transaction) => {
  const { Register, PaymentMethodToRegister } = clientDB || {};

  PaymentMethodToRegister.destroy({
    where: { registerId: register.PaymentMethodToRegisters[0].registerId }
  });
  try {
    const t = await clientDB.sequelize.transaction();
    if (register.PaymentMethodToRegisters) {
      await PaymentMethodToRegister.bulkCreate(register.PaymentMethodToRegisters, { transaction: t });
    }
    const args = {};
    args.where = { id };
    Object.assign(args, ['name', 'description']);
    const result = Register.update(register, args, { transaction: t });
    await t.commit();
    return result;
  } catch (error) {
    await t.rollback();
  }
};

module.exports.makeRegisterDefault = async (id, clientDB, transaction) => {
  const { Register } = clientDB;
  const { stockLocationId } = await Register.findOne({
    where: { id }
  });
  const update = { isDefault: false };
  const query = { stockLocationId };
  await BaseModel.update(Register, update, query, { transaction });
  return Register.update({ isDefault: true }, {
    where: { id },
    transaction,
    attributes: ['name', 'description']
  });
};

module.exports.getDefaultRegisterInStockLocation = (stockLocationId, clientDB, transaction) => {
  const { Register, PaymentMethodToRegister } = clientDB;
  const include = [
    PaymentMethodToRegister
  ];
  const query = {
    stockLocationId,
    isDefault: true
  };
  return BaseModel.findOne(Register, query, { include, transaction });
};

module.exports.getRegisterByNameAndLocation = async (register, clientDB, transaction) => {
  const { Register, PaymentMethodToRegister } = clientDB;
  const include = [
    PaymentMethodToRegister
  ];
  return BaseModel.findOne(Register, { name: register.name, stockLocationId: register.stockLocationId || register.StockLocation.id }, { transaction, include });
};

module.exports.getCashManagePaymentMethodOfRegister = async (registerId, clientDB, transaction) => {
  const { PaymentMethod, PaymentMethodToRegister } = clientDB || {};
  const include = [
    {
      model: PaymentMethodToRegister,
      where: {
        registerId,
        isCashManagement: true
      },
      required: true
    }
  ];
  return BaseModel.findOne(PaymentMethod, {}, { include, transaction }, false);
};

module.exports.getLocationRegisters = async (stockLocationId, clientDB) => {
  const { Register, PaymentMethodToRegister, Layout } = clientDB || {};
  const include = [
    PaymentMethodToRegister, Layout
  ];
  return BaseModel.findAll(Register, { stockLocationId }, { include }, false);
};

module.exports.countOpenRegisters = (clientDB) => {
  const { Register } = clientDB;
  return Register.count({
    where: {
      status: REGISTER_STATUS.OPENED
    }
  });
};

module.exports.countOpenRegistersInStockLocation = (stockLocationId, clientDB) => {
  const { Register } = clientDB;
  return Register.count({
    where: {
      status: REGISTER_STATUS.OPENED,
      stockLocationId
    }
  });
};

module.exports.deleteAllRegisters = (clientDB) => {
  const { Register } = clientDB;
  return Register.destroy({
    where: {
      id: {
        [Op.ne]: 0
      }
    }
  });
};

module.exports.deleteRegister = async (id, clientDB, transaction) => {
  const { Register } = clientDB || {};
  return BaseModel.delete(Register, { id }, transaction);
};

module.exports.createShift = async (registerId, registerName, stockLocationName, openedByUserId, name, openingAmount, clientDB, transaction) => {
  const { Shift, RegisterActionLog } = clientDB;
  const include = [RegisterActionLog];
  const shift = {
    registerId,
    registerName,
    stockLocationName,
    status: REGISTER_STATUS.OPENED,
    RegisterActionLogs:
      [{
        userId: openedByUserId,
        username: name,
        type: LOG_TYPES.OPEN,
        amount: openingAmount,
      }]
  };
  return BaseModel.create(Shift, shift, { transaction, include });
};

module.exports.getLastOpenShiftByRegisterId = async (registerId, clientDB, transaction) => {
  const { Register, Shift } = clientDB;
  const include = [
    Register
  ];
  const options = {
    transaction,
    include,
    order: [
      ['id', 'DESC'],
    ]
  };

  return BaseModel.findOne(Shift, { registerId, status: SHIFT_STATUS.OPENED }, options);
};
module.exports.getLastShiftByRegisterId = async (registerId, clientDB, transaction) => {
  const { Register, Shift } = clientDB;
  const include = [
    Register
  ];
  const options = {
    include,
    transaction,
    order: [
      ['id', 'DESC'],
    ]
  };
  return BaseModel.findOne(Shift, { registerId }, options);
};

module.exports.closeShift = async (shiftId, isBalanced, clientDB, transaction) => {
  const { Shift } = clientDB;
  const update = {
    status: REGISTER_STATUS.CLOSED,
    isBalanced
  };
  return BaseModel.update(Shift, update, { id: shiftId }, { transaction });
};

module.exports.getRegisterWithLocation = async (id, clientDB, transaction) => {
  const {
    Register, StockLocation, PaymentMethodToRegister, PaymentMethod
  } = clientDB || {};
  const include = [
    StockLocation,
    {
      model: PaymentMethodToRegister,
      where: { paymentMethodId: { [Op.not]: null } },
      include: [
        {
          model: PaymentMethod,
          required: false
        }
      ]
    }
  ];

  return BaseModel.findOne(Register, { id }, { transaction, include, paranoid: false });
};

module.exports.getRegisterAndLocation = async (id, clientDB, transaction) => {
  const {
    Register, StockLocation, PaymentMethodToRegister, PaymentMethod
  } = clientDB || {};
  const include = [
    StockLocation,
    {
      model: PaymentMethodToRegister,
      include: [
        {
          model: PaymentMethod,
          required: false
        }
      ]
    }
  ];

  return BaseModel.findOne(Register, { id }, { transaction, include, paranoid: false });
};

module.exports.updateRegisterStatus = async (id, status, clientDB, transaction) => {
  const { Register } = clientDB || {};
  return BaseModel.update(Register, { status }, { id }, { transaction });
};

module.exports.updateRegisterSellingSessionToken = async (id, sellingSessionToken, clientDB, transaction) => {
  const { Register } = clientDB || {};
  return BaseModel.update(Register, { sellingSessionToken }, { id }, { transaction });
};

module.exports.openRegister = async (registerId, openedByUserId, clientDB, transaction) => {
  const { Register } = clientDB;
  const update = {
    status: REGISTER_STATUS.OPENED,
    openedByUserId
  };
  return BaseModel.update(Register, update, { id: registerId }, { transaction });
};

module.exports.closeRegister = async (registerId, clientDB, transaction) => {
  const { Register } = clientDB;
  const update = {
    status: REGISTER_STATUS.CLOSED,
    openedByUserId: null
  };
  return BaseModel.update(Register, update, { id: registerId }, { transaction });
};

module.exports.assignLayoutToRegisters = async (registerIds, layoutId, clientDB, transaction) => {
  const { Register } = clientDB || {};

  return BaseModel.update(Register, { layoutId },
    { id: { [Op.in]: registerIds } }, { transaction });
};

module.exports.getRegisterByIds = async (registerIds, clientDB, transaction) => {
  const { Register } = clientDB || {};
  return BaseModel.findAll(Register, { id: { [Op.in]: registerIds } }, { transaction }, false);
};
