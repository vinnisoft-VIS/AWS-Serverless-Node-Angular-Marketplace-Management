module.exports = (sequelize, DataTypes, schemaName) => {
  const Expense = sequelize.define('Expense', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    expenseNo: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    name: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    amount: {
      type: DataTypes.DOUBLE,
    },
    taxAmount: {
      type: DataTypes.DOUBLE,
    },
    paymentDate: DataTypes.DATEONLY,
    paymentMethodId: {
      type: DataTypes.INTEGER,
    },
    considerPosCaseManagement: {
      type: DataTypes.BOOLEAN,
    },
    cashManagementLocationId: {
      type: DataTypes.INTEGER,
    },
    cashManagementRegisterId: {
      type: DataTypes.INTEGER,
    },
    taxable: {
      type: DataTypes.BOOLEAN,
    },
    taxId: {
      type: DataTypes.INTEGER,
    },
    expenseCategoryId: {
      type: DataTypes.INTEGER,
    },
    isAllLocations: {
      type: DataTypes.BOOLEAN,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE
  }, {
    schema: schemaName
  });
  Expense.associate = (models) => {
    Expense.belongsTo(models.Register, { foreignKey: 'cashManagementRegisterId' });
    Expense.belongsTo(models.PaymentMethod, { foreignKey: 'paymentMethodId' });
    Expense.belongsTo(models.Tax, { foreignKey: 'taxId' });
    Expense.belongsTo(models.StockLocation, { foreignKey: 'cashManagementLocationId' });
    Expense.belongsTo(models.ExpenseCategory, { foreignKey: 'expenseCategoryId' });
    Expense.hasMany(models.ExpenseStockLocation, { foreignKey: 'expenseId' });
  };
  return Expense;
};
