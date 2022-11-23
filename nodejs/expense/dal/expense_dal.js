const sequelize = require('sequelize');

const { Op } = sequelize;
const { BaseModel } = require('../../utils/base-model');
const { DATA_PERMISSION_TYPES } = require('../../utils/constants/constants');
const MerchantService = require('../../merchant/merchant_service');
const { UnauthorizedLocationAccess } = require('../../stock-location/error/unauthorized_location_access');
const dataAuthenticator = require('../../merchant/data_authenticator');

module.exports.createExpense = async (expense, clientDB) => {
  const { Expense, ExpenseStockLocation } = clientDB;
  const include = [
    ExpenseStockLocation
  ];
  return BaseModel.create(Expense, expense, { include });
};

module.exports.getCategoryById = async (id, clientDB) => {
  const {
    ExpenseCategory
  } = clientDB;
  const options = {
    where: { id: { [Op.eq]: id } }
  };
  return ExpenseCategory.findOne(options);
};

module.exports.getExpenseById = async (id, clientDB, transaction) => {
  const {
    Expense, ExpenseStockLocation, ExpenseCategory, Register, StockLocation, PaymentMethod, Tax
  } = clientDB || {};
  return BaseModel.findOne(Expense, { id }, {
    transaction,
    include: [
      { model: Register },
      { model: ExpenseCategory },
      { model: PaymentMethod },
      { model: StockLocation },
      { model: Tax },
      { model: ExpenseStockLocation }
    ]
  });
};
module.exports.deleteExpense = async (id, clientDB, transaction) => {
  const { Expense } = clientDB;
  return BaseModel.delete(Expense, { id }, transaction);
};

module.exports.updateExpense = async (id, expense, clientDB, transaction) => {
  const { Expense, ExpenseStockLocation } = clientDB;
  await BaseModel.update(Expense, expense, { id }, { transaction });
  // 2 possibilities weather it's update or deleted.
  // get all existing expenseLocations
  const options = {
    expenseId: { [Op.eq]: id }
  };
  const expenseLocations = await BaseModel.findAll(ExpenseStockLocation, options);
  const existingExpenseLocations = expenseLocations.rows.map((el) => el.stockLocationId);
  if (!existingExpenseLocations.length) {
    // bulk add
    if (expense.ExpenseStockLocations) {
      const expenseStockLocations = expense.ExpenseStockLocations.map((esl) => {
        const eslCopy = esl;
        eslCopy.expenseId = id;
        return eslCopy;
      });
      await BaseModel.bulkCreate(ExpenseStockLocation, expenseStockLocations, { transaction });
    }
  } else if (expense.ExpenseStockLocations) {
    // skip existing and add new.
    const selectedStockLocationIds = expense.ExpenseStockLocations
      .map((esl) => esl.stockLocationId);
    const expenseStockLocations = expense.ExpenseStockLocations
      .filter((esl) => !existingExpenseLocations.includes(esl.stockLocationId)).map((esl) => {
        const eslCopy = esl;
        eslCopy.expenseId = id;
        return eslCopy;
      });
    if (expenseStockLocations.length) {
      await BaseModel.bulkCreate(ExpenseStockLocation, expenseStockLocations, { transaction });
    }

    // delete records that not selected
    const deleteExpenseIds = existingExpenseLocations
      .filter((esl) => !selectedStockLocationIds.includes(esl));
    if (deleteExpenseIds.length) {
      await BaseModel.delete(
        ExpenseStockLocation,
        { expenseId: { [Op.eq]: id }, stockLocationId: { [Op.in]: deleteExpenseIds } },
        transaction
      );
    }
  }
  return { success: true };
};

module.exports.updateExpenseCategory = async (expenseIds, categoryId, clientDB) => {
  const { Expense } = clientDB;
  const query = {
    id: { [Op.in]: expenseIds }
  };
  return BaseModel.update(Expense, { expenseCategoryId: categoryId }, query);
};
module.exports.findExpenseIdsByStockLocation = async (locationIds, query, clientDB) => {
  const { Expense, ExpenseStockLocation } = clientDB;
  const expenseConditions = [];
  const expenseOptions = {
    raw: true,
    attributes: ['id'],
    include: []
  }

  if (query?.startDate) {
    if (!query?.endDate) {
      query.endDate = query.startDate;
    }
    expenseConditions.push({
      createdAt: {
        [Op.between]: [query.startDate, query.endDate]
      }
    });
  }

  if (query?.paymentStartDate) {
    if (!query?.paymentEndDate) {
      query.paymentEndDate = query.paymentStartDate;
    }
    expenseConditions.push({
      paymentDate: {
        [Op.between]: [query.paymentStartDate, query.paymentEndDate]
      }
    });
  }

  if (expenseConditions.length) {
    expenseOptions.where = {
      [Op.and]: expenseConditions
    }
  }

  const expenseStockLocationConditions = [{  
    stockLocationId: {
      [Op.in]: locationIds 
    }
  }];

  const expenseStockOptions = {
    model: ExpenseStockLocation,
    attributes: ['id', 'expenseId', 'stockLocationId'],
    where: { [Op.and]: expenseStockLocationConditions }
  };

  expenseOptions.include.push(expenseStockOptions)

  const expensesRec = await Expense.findAll(expenseOptions);
  return expensesRec.map((v) => v.id);
};

module.exports.getExpensesByFilters = async (filters, clientDB) => {
  const { Expense, ExpenseStockLocation } = clientDB;

  const copyFilters = filters;
  const conditionList = [];

  const userLocationIds = await MerchantService
    .getDataPermissions(DATA_PERMISSION_TYPES.LOCATION, clientDB);
  if (copyFilters.location) {
    const locArray = JSON.parse(`[${copyFilters.location}]`);
    locArray.forEach((loc) => {
      if (!userLocationIds.find((id) => id === +loc)) {
        throw new UnauthorizedLocationAccess(dataAuthenticator.getEmail(), clientDB.clientDBName);
      }
    });

    const expenseIds = await this.findExpenseIdsByStockLocation(locArray, filters, clientDB);
    conditionList.push({ id: { [Op.in]: expenseIds } });
  } else {
    const expenseIds = await this.findExpenseIdsByStockLocation(userLocationIds, filters, clientDB);
    conditionList.push({ id: { [Op.in]: expenseIds } });
  }

  const conditionAndModelInclude = {
    where: { [sequelize.Op.and]: conditionList },
    include: [
      { model: ExpenseStockLocation }
    ],
    order: [
      ['createdAt', 'DESC'],
    ]
  };

  return Expense.findAll(conditionAndModelInclude);
};
