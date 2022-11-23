const ERRORS = require('../../../utils/error/constants/ERRORS');
const PromotionTemplateGenerator = require('./promotion-template/promotion-template-utility');
const Importer = require('./utils/import_utility');
const { UnsupportedFileError } = require('../../../utils/error/errors');

module.exports.generateTemplate = () => PromotionTemplateGenerator.getTemplate();

module.exports.import = async (filePath, templateParams, dbConnection) => {
  if (filePath.fileName.endsWith('.csv') || filePath.fileName.endsWith('.xlsx')) {
    const template = module.exports.generateTemplate();
    return Importer.import(filePath, template, templateParams, dbConnection);
  }

  throw new UnsupportedFileError(ERRORS.PROMOTIONS.UNSUPPORTED_IMPORT_FILE);
};
