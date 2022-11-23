const { LAYOUT_TYPES, VARIANT_TYPES } = require('../../../../utils/constants/constants');
const CategoryDAL = require('../../../../categories/dal/category_dal');
const ProductDAL = require('../../../../product/dal/product_dal');

module.exports.mapLayout = async (layout, clientDB, transaction) => {
  const mappedLayout = {
    id: layout.id,
    name: layout.name,
    description: layout.description,
    type: layout.type,
    hasSearchBox: layout.hasSearchBox,
    createdBy: layout.userId
  };

  if (layout.type === LAYOUT_TYPES.CUSTOM) {
    let categoryIds = [];
    let productIDs = [];

    if (!(layout.categories && layout.categories.length > 0)) throw new Error('You must have a category');
    categoryIds = layout.categories.map((lc) => lc.id);
    categoryIds = categoryIds.concat(layout.categories.map((lc) => lc.parentId));
    const layoutCategoryProducts = await CategoryDAL.getCategoryProductAndVariantIds(
      categoryIds, clientDB, transaction
    );
    let categories = [];
    if (categoryIds && categoryIds.length > 0) {
      categories = await CategoryDAL.findByIdsOrParentIds(categoryIds, clientDB, transaction);
    }
    for (let i = 0; i < layout.categories.length; i += 1) {
      const category = layout.categories[i];
      const isUncategorized = category.name === 'Uncategorised Products' && !category.id;
      if (!category.allProductsFetched && (category.id || isUncategorized)) {
        let layoutProducts = layoutCategoryProducts.filter((lp) => lp.categoryId === category.id);
        if (category.excludedProducts) {
          category.excludedProducts.forEach((id) => {
            layoutProducts = layoutProducts.filter((lp) => lp.id !== id);
          });
        }

        if (category.excludedVariants) {
          category.excludedVariants.forEach((variant) => {
            const indx = layoutProducts.findIndex((lp) => lp.id === variant.productId);
            layoutProducts[indx].variants = layoutProducts[indx].variants
              .filter((lv) => lv.sku !== variant.sku);
          });
        }

        if (category.products && category.products.length > 0) {
          layoutProducts = layoutProducts.filter(
            (lp) => !category.products.find((cp) => cp.productId === lp.id)
          );
        }
        category.products = [
          ...category.products,
          ...this.mapLayoutProductsPayload(
            layoutProducts, category.products ? category.products.length : 0
          )
        ];
      }
      productIDs = productIDs.concat(category.products.map((p) => p.productId));
    }

    productIDs = [...new Set(productIDs)];

    const products = await ProductDAL.getProductsWithVariantsByIds(
      productIDs, clientDB, transaction
    );
    mappedLayout.LayoutCategories = this.mapLayoutCatgories(
      layout.categories, categories, products, layout.id
    );
  }

  if (layout.id) {
    Object.keys(mappedLayout).forEach((k) => {
      if (mappedLayout[k] === undefined) delete mappedLayout[k];
    });
  }

  return mappedLayout;
};

module.exports.mapLayoutCategory = (layoutCategory, products, layoutId) => ({
  name: layoutCategory.name,
  categoryId: layoutCategory.categoryId,
  parentCategoryId: layoutCategory.parentCategoryId,
  seq: layoutCategory.seq,
  LayoutProducts: this.mapLayoutProducts(
    layoutCategory.products, products, layoutId, layoutCategory
  ),
});

module.exports.mapLayoutCatgories = (layoutCategories, categories, products, layoutId) => {
  const layoutCategoryList = [];

  layoutCategories.forEach((layoutCategory) => {
    if (!layoutCategory.id) {
      layoutCategoryList.push(this.mapLayoutCategory(layoutCategory, products, layoutId));
    } else {
      const category = layoutCategory.id ?
        categories.find((c) => c.id === layoutCategory.id) : null;

      if (!category) {
        throw new Error('Invalid category has been used');
      }

      layoutCategoryList.push(this.mapLayoutCategory({
        ...layoutCategory,
        name: category.name,
        categoryId: category.id,
        parentCategoryId: category.parentId
      }, products, layoutId));
    }
  });

  return layoutCategoryList;
};

module.exports.mapLayoutProducts = (layoutProducts, products, layoutId, layoutCategory) => {
  const layoutProductList = [];

  layoutProducts.forEach((layoutProduct) => {
    const matchedProduct = products.find((p) => p.id === layoutProduct.productId);

    if (!matchedProduct) {
      throw new Error(`${layoutProduct.name} is not found in inventory`);
    }

    if (!(layoutCategory.categoryId && matchedProduct.categoryId !== layoutCategory.categoryId)) {
      layoutProductList.push({
        productId: matchedProduct.id,
        name: matchedProduct.name,
        seq: layoutProduct.seq,
        type: matchedProduct.type,
        LayoutProductVariants: this.mapLayoutProductVariants(
          layoutProduct.variants, matchedProduct.ProductVariants, layoutId
        ),
      });
    }
  });

  return layoutProductList;
};

module.exports.mapLayoutProductVariants = (layoutProductVariants, variants) => {
  let layoutVariantList = null;

  if (layoutProductVariants && layoutProductVariants.length > 0) {
    layoutVariantList = [];

    layoutProductVariants.forEach((layoutProductVariant) => {
      const matchedVariant = variants.find((v) => v.sku === layoutProductVariant.sku);

      if (!matchedVariant) {
        throw new Error(`${layoutProductVariant.name} is not found in inventory`);
      }

      layoutVariantList.push({
        variantId: matchedVariant.id,
        name: matchedVariant.name,
        seq: layoutProductVariant.seq,
        sku: matchedVariant.sku,
        trackType: matchedVariant.trackType,
        barcode: matchedVariant.barcode,
        type: matchedVariant.type,
        isWeightedScale: matchedVariant.isWeightedScale
      });
    });
  } else {
    const packVariants = variants.filter((v) => v.type !== VARIANT_TYPES.PACKAGE);
    const nonPackvariants = variants.filter((v) => v.type === VARIANT_TYPES.PACKAGE);

    layoutVariantList = nonPackvariants.map((v, i) => this.mapLayoutVariant(v, i + 1));
    layoutVariantList = layoutVariantList.concat(
      packVariants.map((v, i) => this.mapLayoutVariant(v, i + 1))
    );
  }

  return layoutVariantList;
};

module.exports.mapLayoutVariant = (variant, seq) => ({
  variantId: variant.id,
  name: variant.name,
  seq,
  sku: variant.sku,
  trackType: variant.trackType,
  barcode: variant.barcode,
  type: variant.type,
  isWeightedScale: variant.isWeightedScale
});

module.exports.mapLayoutIdWithCategories = (layoutId, layoutCategories) => {
  layoutCategories.forEach((category) => {
    const cat = category;
    cat.layoutId = layoutId;
  });
};

module.exports.mapLayoutProductsPayload = (
  productsData, startIndex = 0
) => productsData.map((p) => {
  let startIndexs = startIndex;
  const mapVariant = (v) => v.map((vi, ind) => ({ sku: vi.sku, seq: ind + 1 }));

  let variants = mapVariant(p.ProductVariants.filter((v) => v.type !== VARIANT_TYPES.PACKAGE));
  const packVariants = mapVariant(
    p.ProductVariants.filter((v) => v.type === VARIANT_TYPES.PACKAGE)
  );

  variants = [...variants, ...packVariants];
  startIndexs += 1;

  return {
    productId: p.id,
    seq: startIndexs,
    variants,
  };
});
