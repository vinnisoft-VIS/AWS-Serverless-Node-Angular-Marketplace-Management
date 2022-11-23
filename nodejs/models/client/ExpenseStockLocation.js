module.exports = (sequelize, DataTypes, schemaName) => {
  const ExpenseStockLocation = sequelize.define('ExpenseStockLocation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    stockLocationId: {
      type: DataTypes.INTEGER,
    },
    expenseId: {
      type: DataTypes.INTEGER,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE
  }, {
    schema: schemaName
  });
  ExpenseStockLocation.associate = (models) => {
    ExpenseStockLocation.belongsTo(models.Expense, { foreignKey: 'expenseId' });
    ExpenseStockLocation.belongsTo(models.StockLocation, { foreignKey: 'stockLocationId' });
  };
  return ExpenseStockLocation;
};
