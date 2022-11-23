module.exports.prepareLogsQuery = (query) => {
  const preparedQuery = { ...query };
  if (query.stockLocationId) {
    preparedQuery.stockLocationId = preparedQuery.stockLocationId.split(',').map((l) => +l);
  }
  if (query.registerId) {
    preparedQuery.registerId = preparedQuery.registerId.split(',');
  }
  if (query.userId) {
    preparedQuery.userId = preparedQuery.userId.split(',');
  }
  if (query.type) {
    preparedQuery.type = preparedQuery.type.split(',');
  }
  return preparedQuery;
};
