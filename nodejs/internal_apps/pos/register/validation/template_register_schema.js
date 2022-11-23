module.exports = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
    },
    status: {
      type: 'string',
      enum: ['Opened', 'Closed', 'Inactive']
    },
    description: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    isDefault: {
      type: 'boolean'
    },
    openedByUserId: {
      type: ['integer', 'null']
    },
    stockLocationId: {
      type: 'integer'
    },
    createdAt: {
      type: ['string', 'null']
    },
    updatedAt: {
      type: ['string', 'null']
    },
    deletedAt: {
      type: ['string', 'null']
    }
  },
  required: [],
  additionalProperties: true
};
