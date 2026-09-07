import prisma from '../db/client.js';

export interface CreateProductInput {
  sku: string;
  name: string;
  category: string;
  unit: string;
  isPackaged?: boolean;
  costPrice: number;
  sellPrice: number;
  mrp: number;
  gstRate: number;
  hsnCode: string;
  quantity: number;
  reorderLevel: number;
}

export async function searchProducts(query: string) {
  const q = query.trim().toLowerCase();
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { category: { contains: q } },
      ],
    },
    take: 10,
  });
  return products;
}

export async function findProductByNameOrSku(identifier: string) {
  const clean = identifier.trim();
  // Exact SKU match first
  let product = await prisma.product.findUnique({
    where: { sku: clean },
  });

  if (!product) {
    // Case-insensitive name search
    const results = await prisma.product.findMany({
      where: {
        name: { contains: clean },
      },
      take: 1,
    });
    if (results.length > 0) {
      product = results[0];
    }
  }

  return product;
}

export async function addProduct(data: CreateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { sku: data.sku },
  });
  if (existing) {
    throw new Error(`Product with SKU '${data.sku}' already exists.`);
  }

  return await prisma.product.create({
    data: {
      sku: data.sku,
      name: data.name,
      category: data.category,
      unit: data.unit,
      isPackaged: data.isPackaged ?? true,
      costPrice: data.costPrice,
      sellPrice: data.sellPrice,
      mrp: data.mrp,
      gstRate: data.gstRate,
      hsnCode: data.hsnCode,
      quantity: data.quantity,
      reorderLevel: data.reorderLevel,
    },
  });
}

export async function receiveStock(skuOrName: string, addQuantity: number) {
  if (addQuantity <= 0) {
    throw new Error('Quantity to receive must be greater than 0');
  }

  const product = await findProductByNameOrSku(skuOrName);
  if (!product) {
    throw new Error(`Product matching '${skuOrName}' not found.`);
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      quantity: {
        increment: addQuantity,
      },
    },
  });

  return updated;
}

export async function getLowStock() {
  const allProducts = await prisma.product.findMany();
  // quantity <= reorderLevel
  return allProducts.filter((p) => p.quantity <= p.reorderLevel);
}
