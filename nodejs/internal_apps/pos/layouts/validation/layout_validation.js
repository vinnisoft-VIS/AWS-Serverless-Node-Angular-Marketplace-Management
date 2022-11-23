const { LAYOUT_TYPES } = require('../../../../utils/constants/constants');
const {
  OPERATION_FAILURE_MESSAGE: {
    LAYOUT_UN_VALID_TYPE,
    LAYOUT_REGISTER_OPEN,
    LAYOUT_REQUIRED_NAME,
    LAYOUT_REQUIRED_TYPE,
    LAYOUT_NOT_FOUND,
    LAYOUT_RELATED_TO_REGISTER
  }
} = require('../../../../utils/application_messages');
const { REGISTER_STATUS } = require('../../register/utilities/constants');

module.exports.validateAddLayout = (layout) => {
  if (!layout.name) {
    throw new Error(LAYOUT_REQUIRED_NAME);
  }

  if (!layout.type) {
    throw new Error(LAYOUT_REQUIRED_TYPE);
  }

  if (![LAYOUT_TYPES.CLASSIC, LAYOUT_TYPES.CUSTOM].includes(layout.type)) throw new Error(LAYOUT_UN_VALID_TYPE);
};

module.exports.validateUpdateLayoutRequest = (type) => {
  if (type && type !== LAYOUT_TYPES.CLASSIC && type !== LAYOUT_TYPES.CUSTOM) {
    throw new Error(LAYOUT_UN_VALID_TYPE);
  }
};
module.exports.validateGetLayout = (layout) => {
  if (!layout) throw new Error(LAYOUT_NOT_FOUND);
};

module.exports.validateRegisterStatus = (registers) => {
  if (registers && registers.find((r) => r.status === REGISTER_STATUS.OPENED)) throw new Error(LAYOUT_REGISTER_OPEN);
};
module.exports.validateExistingRegisters = (registers) => {
  if (registers && registers.length > 0) throw new Error(LAYOUT_RELATED_TO_REGISTER);
};
