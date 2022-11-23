module.exports.isValidCategoryPayload = (payload) => (
  // eslint-disable-next-line no-restricted-globals
  !!(payload && payload.name && isNaN(payload.name))
);
