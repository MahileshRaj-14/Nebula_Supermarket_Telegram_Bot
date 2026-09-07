import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial supermarket product inventory...');

  const products = [
    {
      sku: 'ATTA-5KG',
      name: 'Aashirvaad Atta 5kg',
      category: 'Flour & Staples',
      unit: 'packet',
      isPackaged: true,
      costPrice: 210.0,
      sellPrice: 240.0,
      mrp: 260.0,
      gstRate: 5.0,
      hsnCode: '1101',
      quantity: 50,
      reorderLevel: 10,
    },
    {
      sku: 'SALT-1KG',
      name: 'Tata Salt 1kg',
      category: 'Spices & Salt',
      unit: 'packet',
      isPackaged: true,
      costPrice: 20.0,
      sellPrice: 28.0,
      mrp: 30.0,
      gstRate: 0.0,
      hsnCode: '2501',
      quantity: 100,
      reorderLevel: 20,
    },
    {
      sku: 'BUTTER-100G',
      name: 'Amul Butter 100g',
      category: 'Dairy',
      unit: 'pack',
      isPackaged: true,
      costPrice: 48.0,
      sellPrice: 56.0,
      mrp: 58.0,
      gstRate: 12.0,
      hsnCode: '0405',
      quantity: 30,
      reorderLevel: 5,
    },
    {
      sku: 'OIL-1L',
      name: 'Fortune Sunflower Oil 1L',
      category: 'Edible Oils',
      unit: 'pouch',
      isPackaged: true,
      costPrice: 125.0,
      sellPrice: 145.0,
      mrp: 160.0,
      gstRate: 5.0,
      hsnCode: '1512',
      quantity: 40,
      reorderLevel: 8,
    },
    {
      sku: 'MAGGI-70G',
      name: 'Maggi 70g',
      category: 'Instant Food',
      unit: 'packet',
      isPackaged: true,
      costPrice: 11.0,
      sellPrice: 14.0,
      mrp: 15.0,
      gstRate: 12.0,
      hsnCode: '1902',
      quantity: 120,
      reorderLevel: 15,
    },
    {
      sku: 'PARLE-G',
      name: 'Parle-G 250g',
      category: 'Snacks & Biscuits',
      unit: 'packet',
      isPackaged: true,
      costPrice: 22.0,
      sellPrice: 28.0,
      mrp: 30.0,
      gstRate: 18.0,
      hsnCode: '1905',
      quantity: 80,
      reorderLevel: 15,
    },
    {
      sku: 'SURF-1KG',
      name: 'Surf Excel 1kg',
      category: 'Detergents & Cleaning',
      unit: 'pack',
      isPackaged: true,
      costPrice: 110.0,
      sellPrice: 135.0,
      mrp: 145.0,
      gstRate: 18.0,
      hsnCode: '3402',
      quantity: 25,
      reorderLevel: 5,
    },
    {
      sku: 'SUGAR-LOOSE',
      name: 'Sugar (Loose)',
      category: 'Staples',
      unit: 'kg',
      isPackaged: false,
      costPrice: 36.0,
      sellPrice: 42.0,
      mrp: 45.0,
      gstRate: 5.0,
      hsnCode: '1701',
      quantity: 100,
      reorderLevel: 15,
    },
    {
      sku: 'RICE-LOOSE',
      name: 'Basmati Rice (Loose)',
      category: 'Staples',
      unit: 'kg',
      isPackaged: false,
      costPrice: 75.0,
      sellPrice: 95.0,
      mrp: 110.0,
      gstRate: 5.0,
      hsnCode: '1006',
      quantity: 150,
      reorderLevel: 25,
    },
    {
      sku: 'DAL-LOOSE',
      name: 'Toor Dal (Loose)',
      category: 'Pulses',
      unit: 'kg',
      isPackaged: false,
      costPrice: 110.0,
      sellPrice: 135.0,
      mrp: 150.0,
      gstRate: 0.0,
      hsnCode: '0713',
      quantity: 60,
      reorderLevel: 10,
    },
  ];

  for (const item of products) {
    await prisma.product.upsert({
      where: { sku: item.sku },
      update: item,
      create: item,
    });
  }

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
