import prisma from '../db/client.js';

export async function getDailySales(dateInput?: string | Date) {
  const targetDate = dateInput ? new Date(dateInput) : new Date();
  const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
  const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

  const bills = await prisma.bill.findMany({
    where: {
      status: 'FINALIZED',
      finalizedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  let totalSales = 0;
  let taxableSales = 0;
  let totalGst = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  let cashSales = 0;
  let upiSales = 0;
  let cardSales = 0;
  let creditSales = 0;

  const productSalesMap = new Map<string, { name: string; quantity: number; total: number }>();

  for (const bill of bills) {
    totalSales += bill.total;
    taxableSales += bill.subtotal;
    totalGst += bill.gstAmount;
    totalCgst += bill.gstAmount / 2;
    totalSgst += bill.gstAmount / 2;

    switch (bill.paymentMode) {
      case 'CASH':
        cashSales += bill.total;
        break;
      case 'UPI':
        upiSales += bill.total;
        break;
      case 'CARD':
        cardSales += bill.total;
        break;
      case 'CREDIT':
        creditSales += bill.total;
        break;
    }

    for (const item of bill.items) {
      const existing = productSalesMap.get(item.productId) || {
        name: item.product.name,
        quantity: 0,
        total: 0,
      };
      existing.quantity += item.quantity;
      existing.total += item.lineTotal;
      productSalesMap.set(item.productId, existing);
    }
  }

  const topProducts = Array.from(productSalesMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    date: startOfDay.toISOString().split('T')[0],
    totalBills: bills.length,
    totalSales,
    taxableSales,
    totalGst,
    cgst: totalCgst,
    sgst: totalSgst,
    paymentBreakdown: {
      cash: cashSales,
      upi: upiSales,
      card: cardSales,
      credit: creditSales,
    },
    topProducts,
  };
}

export async function getWeeklySales() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const bills = await prisma.bill.findMany({
    where: {
      status: 'FINALIZED',
      finalizedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  const dailyAggregates = new Map<string, { date: string; sales: number; billsCount: number }>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    dailyAggregates.set(dateStr, { date: dateStr, sales: 0, billsCount: 0 });
  }

  let grandTotal = 0;
  let totalGst = 0;

  for (const bill of bills) {
    if (!bill.finalizedAt) continue;
    const dateStr = bill.finalizedAt.toISOString().split('T')[0];
    const agg = dailyAggregates.get(dateStr);
    if (agg) {
      agg.sales += bill.total;
      agg.billsCount += 1;
    }
    grandTotal += bill.total;
    totalGst += bill.gstAmount;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    totalSales: grandTotal,
    totalGst,
    totalBills: bills.length,
    dailyTrends: Array.from(dailyAggregates.values()),
  };
}
