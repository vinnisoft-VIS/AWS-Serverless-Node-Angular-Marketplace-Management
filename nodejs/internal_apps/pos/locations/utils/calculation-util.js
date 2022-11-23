const { add, subtract } = require('../../../../utils/calculation_utilities');

module.exports.getSkuFromScannerCode = (weightedConfiguration, code = '') => {
  const {
    starter, decimalNumberDigits, hasCheckDigit, lastDigits
  } = weightedConfiguration || {};

  if (code.startsWith(starter)) {
    const scannerCode = hasCheckDigit ? code.substr(0, code.length - 1) : code;

    let sku = scannerCode.replace(starter, '');
    const realDigits = lastDigits === 'Price' ? 3 : 2;
    const digits = add(realDigits, decimalNumberDigits);

    if (scannerCode.length <= add(digits, starter.length)) return scannerCode;

    sku = sku.substr(0, subtract(sku.length, digits));
    return sku;
  }

  return code;
};
