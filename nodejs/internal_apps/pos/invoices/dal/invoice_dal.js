const { Op } = require('sequelize');
const sequelize = require('sequelize');
const { BaseModel } = require('../../../../utils/base-model');
const InvoiceUtil = require('../../../../invoice/utils/invoice_utilities');
const { INVOICES_TYPES, INVOICE_STATUS } = require('../../../../invoice/utils/constants');
const { SEVEN_DAYS_IN_MILLISECONDS } = require('../../utlities/constants');

module.exports.getPOSInvoiceById = async (id, clientDB, transaction) => {
  const {
    Invoice, VariantToInvoice, PayableInvoice, CompositeVariantToInvoicePart, VariantToInvoicePack, VariantToInvoiceEcard,
    VariantToInvoiceTrack, VariantToInvoiceExtra, WeightedVariantToInvoice,
    Customer, PaymentToPayableInvoice, Payment, PaymentProcess, PromotionInvoiceVariant,
    PromotionVariant, Promotion, InvoicePromotion
  } = clientDB;
  const include = [
    {
      model: VariantToInvoice,
      include: [
        CompositeVariantToInvoicePart,
        VariantToInvoicePack,
        VariantToInvoiceTrack,
        VariantToInvoiceExtra,
        VariantToInvoiceEcard,
        WeightedVariantToInvoice,
        {
          model: PromotionInvoiceVariant,
          include: [{
            model: PromotionVariant,
            include: [{ model: Promotion, required: false }],
            required: false
          }]
        },
      ]
    },
    {
      model: InvoicePromotion,
      include: [{
        model: Promotion,
        required: false
      }]
    },
    Customer,
    {
      model: PayableInvoice,
      include: [{
        model: PaymentToPayableInvoice, include: [{ model: Payment, include: [PaymentProcess] }]
      }]
    }
  ];
  return BaseModel.findById(Invoice, id, { include, transaction });
};

module.exports.getParkedSaleInvoicesInRegister = async (registerId, limit = 10, offset = 0, clientDB) => {
  const {
    Invoice, VariantToInvoice, InvoicePromotion, PromotionInvoiceVariant
  } = clientDB;
  const query = {
    type: INVOICES_TYPES.POS_SALE,
    registerId,
    status: INVOICE_STATUS.OPEN
  };
  const include = [{ model: VariantToInvoice, separate: true }, {
    model: InvoicePromotion,
    include: [
      { model: PromotionInvoiceVariant }
    ]
  }];
  return BaseModel.findAll(Invoice, query, {
    include,
    offset,
    limit
  }).then((result) => ({
    result: result.rows,
    total: result.count
  }));
};

module.exports.getPosReturnInvoices = async (saleInvoiceId, clientDB, transaction) => {
  const {
    Invoice, Customer, VariantToInvoice, CompositeVariantToInvoicePart, VariantToInvoiceExtra,
    WeightedVariantToInvoice, VariantToInvoiceEcard, VariantToInvoiceTrack, VariantToInvoicePack
  } = clientDB;

  const include = [
    {
      model: VariantToInvoice,
      include: [
        CompositeVariantToInvoicePart,
        VariantToInvoiceExtra,
        WeightedVariantToInvoice,
        VariantToInvoiceEcard,
        VariantToInvoiceTrack,
        VariantToInvoicePack,
      ]
    },
    Customer
  ];
  return BaseModel.findAll(Invoice, { saleInvoiceId }, { include, transaction }, false);
};

module.exports.createPlatformPOSInvoice = async (platformPosInvoice, clientDB, transaction, parked = false) => {
  const {
    Invoice, VariantToInvoice, PayableInvoice, CompositeVariantToInvoicePart, VariantToInvoicePack,
    VariantToInvoiceTrack, VariantToInvoiceExtra, WeightedVariantToInvoice, VariantToInvoiceEcard
  } = clientDB;
  const include = [
    {
      model: VariantToInvoice,
      include: [
        CompositeVariantToInvoicePart,
        VariantToInvoicePack,
        VariantToInvoiceTrack,
        VariantToInvoiceExtra,
        VariantToInvoiceEcard,
        WeightedVariantToInvoice
      ]
    },
    PayableInvoice
  ];
  const { id } = await BaseModel.create(Invoice, platformPosInvoice, { transaction, include });
  return BaseModel.findById(Invoice, id, { include, transaction });
};

module.exports.getInvoiceNumber = async (id, clientDB) => {
  let invoice = await BaseModel.findOne(clientDB.Invoice, { id }, {
    attributes: ['invoiceNumber', 'completeDate', 'type']
  });

  invoice = InvoiceUtil.addPrefixToInvoiceNumber(invoice.toJSON());

  return invoice ? invoice.invoiceNumber : null;
};

module.exports.updatePlatformPOSInvoice = async (invoiceId, mappedInvoice, clientDB, transaction, parked) => {
  const {
    Invoice, VariantToInvoice, PayableInvoice, CompositeVariantToInvoicePart, VariantToInvoicePack,
    VariantToInvoiceTrack, VariantToInvoiceExtra, WeightedVariantToInvoice, VariantToInvoiceEcard
  } = clientDB;
  const invoiceInclude = [
    {
      model: VariantToInvoice,
      include: [
        CompositeVariantToInvoicePart,
        VariantToInvoicePack,
        VariantToInvoiceTrack,
        VariantToInvoiceExtra,
        VariantToInvoiceEcard,
        WeightedVariantToInvoice
      ]
    },
    PayableInvoice
  ];
  await BaseModel.update(Invoice, mappedInvoice, { id: invoiceId }, { transaction });

  if (!parked) await BaseModel.create(PayableInvoice, { ...mappedInvoice.PayableInvoice, invoiceId }, { transaction });

  const include = [
    CompositeVariantToInvoicePart,
    VariantToInvoicePack,
    VariantToInvoiceTrack,
    VariantToInvoiceExtra,
    VariantToInvoiceEcard,
    WeightedVariantToInvoice,
  ];
  const variantsToInvoice = mappedInvoice.VariantToInvoices
    .map((variantToInvoice) => ({ ...variantToInvoice, invoiceId }));
  await BaseModel.bulkCreate(VariantToInvoice, variantsToInvoice, { transaction, include });
  return BaseModel.findById(Invoice, invoiceId, { include: invoiceInclude, transaction });
};

module.exports.deleteOldParkedSalesInvoices = (clientDB) => {
  const { Invoice } = clientDB;
  const query = {
    type: INVOICES_TYPES.POS_SALE,
    status: INVOICE_STATUS.OPEN,
    updatedAt: {
      [Op.lt]: Date.now() - SEVEN_DAYS_IN_MILLISECONDS
    }
  };
  return BaseModel.delete(Invoice, query);
};

module.exports.deleteParkedSalesInvoice = (invoiceId, clientDB) => {
  const { Invoice } = clientDB;
  const query = {
    type: INVOICES_TYPES.POS_SALE,
    status: INVOICE_STATUS.OPEN,
    id: invoiceId
  };
  return BaseModel.delete(Invoice, query);
};
module.exports.getParkedInvoice = (invoiceId, clientDB) => {
  const { Invoice } = clientDB;
  const query = {
    type: INVOICES_TYPES.POS_SALE,
    status: INVOICE_STATUS.OPEN,
    id: invoiceId
  };
  return BaseModel.findOne(Invoice, query);
};

module.exports.getInvoiceProducts = (invoiceId, clientDB, transaction) => {
  const { VariantToInvoice } = clientDB || {};
  return BaseModel.findAll(VariantToInvoice, { invoiceId }, { transaction }, false);
};

module.exports.deleteChildProducts = (model, variantToInvoiceId, transaction) => BaseModel.delete(model, { variantToInvoiceId }, transaction);

module.exports.getInvoiceStatus = (invoiceId, clientDB, transaction) => {
  const { Invoice } = clientDB || {};
  return BaseModel.findById(Invoice, invoiceId, { attributes: ['status'], transaction });
};

module.exports.getOldParkedSalesInvoiceIds = (clientDB) => {
  const { Invoice } = clientDB;
  const query = {
    type: INVOICES_TYPES.POS_SALE,
    status: INVOICE_STATUS.OPEN,
    updatedAt: {
      [Op.lt]: Date.now() - SEVEN_DAYS_IN_MILLISECONDS
    }
  };
  return BaseModel.findAll(Invoice, query, { attributes: ['id'] }, false);
};

module.exports.getLastInvoiceNumber = async (type, clientDB) => {
  const { Invoice } = clientDB;
  const invoiceData = await Invoice.findAll({
    attributes: [
      [sequelize.fn('max', sequelize.col('invoiceNumber')), 'invoiceNumber']
    ],
    where: { type }
  });

  return invoiceData ? invoiceData[0].invoiceNumber : undefined;
};

module.exports.getPosInvoiceByDisplayInvoiceNumber = async (displayInvoiceNumber, clientDB) => {
  const { Invoice } = clientDB;
  const invoiceData = await Invoice.findOne({
    where: { displayInvoiceNumber }
  });

  return invoiceData;
};
