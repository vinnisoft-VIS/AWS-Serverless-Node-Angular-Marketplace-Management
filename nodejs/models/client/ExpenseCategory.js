module.exports = (sequelize, DataTypes, schemaName) => {
  const ExpenseCategory = sequelize.define('ExpenseCategory', {
    name: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    parentId: {
      type: DataTypes.INTEGER,
    },
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    seq: {
      type: DataTypes.INTEGER
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE
  }, {
    schema: schemaName
  });
  ExpenseCategory.associate = (models) => {
    ExpenseCategory.hasMany(models.Expense, { foreignKey: 'expenseCategoryId' });
  };
  return ExpenseCategory;
};
