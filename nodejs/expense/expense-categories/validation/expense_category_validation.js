const { OPERATION_FAILURE_MESSAGE: {
    INVALID_PARENT_CATEGORY,
    INVALID_CATEGORY_LEVELS
} } = require('../../../utils/application_messages');

module.exports.validateParentCategory = (parentCategoryId) => {
    if(!parentCategoryId)
         throw new Error(INVALID_PARENT_CATEGORY);
}
module.exports.validateCategoryLevel = (categoryLevel) => {
    if(categoryLevel > 3)
        throw new Error(INVALID_CATEGORY_LEVELS);
}


