const { UnsupportedFileError } = require('../../../../utils/error/errors');
const { FILES: { MAX_PRODUCT_UPLOAD, UNDEFINED_HEADER_LABEL } } = require('../../../../utils/error/constants/ERRORS');

module.exports.validateSpreadSheetFile = async (parsedFileRows, skuTemplate) => {
  if (parsedFileRows.length > 10000) {
    throw new UnsupportedFileError(MAX_PRODUCT_UPLOAD);
  }

  const parsedFileHeader = Object.keys(parsedFileRows[0]);
  const skuTemplateHeader = Object.keys(skuTemplate[0]);

  if (parsedFileHeader.length > skuTemplateHeader.length ||
    !parsedFileHeader.every((v) => skuTemplateHeader.includes(v))) {
    throw new UnsupportedFileError(UNDEFINED_HEADER_LABEL);
  }
};
