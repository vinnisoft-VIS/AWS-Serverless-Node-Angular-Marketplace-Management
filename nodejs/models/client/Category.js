module.exports = (sequelize, DataTypes, schemaName) => {
  const Category = sequelize.define('Category', {
    name: {
      type: DataTypes.STRING,
      defaultValue: '',
    },
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    parentId: {
      type: DataTypes.INTEGER,
    },
    level: {
      type: DataTypes.INTEGER,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE
  }, {
    schema: schemaName
  });
  Category.associate = (models) => {
    Category.hasMany(models.Product, { foreignKey: 'categoryId' });
  };
  return Category;
};
