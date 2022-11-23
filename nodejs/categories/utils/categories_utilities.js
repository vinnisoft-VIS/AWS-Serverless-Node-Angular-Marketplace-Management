module.exports.isValidCategoryPayload = (payload) => (!!(payload && payload.name && isNaN(payload.name)));
