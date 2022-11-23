module.exports.expenseListFilterQueryMapper = (requestQuery) => {
  const queryObject = {
    search: '',
    searchOP: '',
    expenseCategory: '',
    fromDate: '',
    toDate: '',
    createdAtFromDate: '',
    createdAtToDate: '',
    updatedAtFromDate: '',
    updatedAtToDate: '',
    paymentMethod: '',
    taxable: '',
    location: '',
    amount: '',
    amountOP: ''
  };

  // eslint-disable-next-line no-restricted-syntax
  for (const item in queryObject) {
    if (item in requestQuery && isValidSearchQueryString(requestQuery[item])) {
      queryObject[item] = requestQuery[item];
    }
  }
  return queryObject;
};

module.exports.expenseDataMapper = (requestData) => {
  const requestDataExp = requestData;
  requestDataExp.cashManagementRegisterId = requestDataExp.cashManagementRegisterId || null;
  requestDataExp.cashManagementLocationId = requestDataExp.cashManagementLocationId || null;

  return requestDataExp;
};

module.exports.expenseListSortQueryMapper = (requestQuery, clientDB) => {
  const { ExpenseCategory, PaymentMethod } = clientDB;

  const sortObj = [];

  if ('id' in requestQuery && isValidSearchQueryString(requestQuery.id)) {
    sortObj.push(['id', requestQuery.id]);
  }

  if ('name' in requestQuery && isValidSearchQueryString(requestQuery.name)) {
    sortObj.push(['name', requestQuery.name]);
  }

  if ('expenseCategory' in requestQuery && isValidSearchQueryString(requestQuery.expenseCategory)) {
    sortObj.push([ExpenseCategory, 'name', requestQuery.expenseCategory]);
  }

  if ('amount' in requestQuery && isValidSearchQueryString(requestQuery.amount)) {
    sortObj.push(['amount', requestQuery.amount]);
  }

  if ('paymentDate' in requestQuery && isValidSearchQueryString(requestQuery.paymentDate)) {
    sortObj.push(['paymentDate', requestQuery.paymentDate]);
  }

  if ('updatedAt' in requestQuery && isValidSearchQueryString(requestQuery.updatedAt)) {
    sortObj.push(['updatedAt', requestQuery.updatedAt]);
  }

  if ('paymentMethod' in requestQuery && isValidSearchQueryString(requestQuery.paymentMethod)) {
    sortObj.push([PaymentMethod, 'name', requestQuery.paymentMethod]);
  }

  if ('taxable' in requestQuery && isValidSearchQueryString(requestQuery.taxable)) {
    sortObj.push(['taxable', requestQuery.taxable]);
  }

  /**  It is commented b'cos while apply {separate:true} to one to many relation,
   *  In that case sequelize create separate query for this one to many relation and
   *  original query will have no any field from it. so that it through error.
  */

  // if ('location' in requestQuery && isValidSearchQueryString(requestQuery.location)) {
  //   sortObj.push([ExpenseStockLocation, 'name', requestQuery.location]);
  // }

  return sortObj;
};

module.exports.expenseStockLocationListSortQueryMapper = (requestQuery, clientDB) => {
  const {
    StockLocation
  } = clientDB;

  const sortObj = [];

  if ('location' in requestQuery && isValidSearchQueryString(requestQuery.location)) {
    sortObj.push([StockLocation, 'name', requestQuery.location]);
  }

  return sortObj;
};

function hasNullUndefinedText(value) {
  if (value === 'null' || value === 'undefined') {
    return true;
  }
  return false;
}

function isValidSearchQueryString(value) {
  return (value != null && value.trim().length > 0 && !hasNullUndefinedText(value));
}
