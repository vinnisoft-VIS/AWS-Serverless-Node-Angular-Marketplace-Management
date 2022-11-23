const REGISTER_STATUS = {
  CLOSED: 'Closed',
  OPENED: 'Opened',
  INACTIVE: 'Inactive'
};

const SHIFT_STATUS = {
  CLOSED: 'Closed',
  OPENED: 'Opened',
  BALANCED: 'Balanced',
  UNBALANCED: 'Unbalanced',
};

const SHIFT_FILTER_STATUS = {
  OPENED: 'Opened In progress',
  CLOSED_UNBALANCED: 'Closed Unbalanced',
  CLOSED_BALANCED: 'Closed Balanced',
};

const LOG_TYPES = {
  OPEN: 'Open',
  CLOSE: 'Close',
  ADD: 'Add',
  WITHDRAW: 'Withdraw'
};

const PAYMENT_METHOD_TYPES = {
  CASH: 'Cash',
  CARD: 'Card',
  OTHER: 'Other'
};

module.exports = {
  REGISTER_STATUS,
  SHIFT_STATUS,
  LOG_TYPES,
  PAYMENT_METHOD_TYPES,
  SHIFT_STATUS,
  SHIFT_FILTER_STATUS,
};
