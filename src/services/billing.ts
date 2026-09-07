import prisma from '../db/client.js';
import { calculateItemGst, calculateBillTotals } from './gst.js';
import { findProductByNameOrSku } from './inventory.js';

export async function getOrCreateDraftBill(telegramUserId: string) {
  let draft = await prisma.bill.findFirst({
    where: {
      telegramUserId,
      status: 'DRAFT',
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });

  if (!draft) {
    const count = await prisma.bill.count();
    const billNumber = `INV-${String(count + 1).padStart(5, '0')}`;
    draft = await prisma.bill.create({
      data: {
        billNumber,
        telegramUserId,
        status: 'DRAFT',
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
      },
    });
  }

  return draft;
}

export async function clearDraftBill(telegramUserId: string) {
  await prisma.bill.deleteMany({
    where: {
      telegramUserId,
      status: 'DRAFT',
    },
  });
}

export async function addItemToDraft(
  telegramUserId: string,
  productQuery: string,
  quantity: number
) {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }

  const product = await findProductByNameOrSku(productQuery);
  if (!product) {
    throw new Error(`Product matching '${productQuery}' not found.`);
  }

  const draft = await getOrCreateDraftBill(telegramUserId);

  const existingItem = draft.items.find((item) => item.productId === product.id);

  const newQuantity = existingItem ? existingItem.quantity + quantity : quantity;
  const gstBreakdown = calculateItemGst(newQuantity, product.sellPrice, product.gstRate);

  if (existingItem) {
    await prisma.billItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: newQuantity,
        unitPrice: product.sellPrice,
        gstRate: product.gstRate,
        gstAmount: gstBreakdown.gstAmount,
        lineTotal: gstBreakdown.lineTotal,
      },
    });
  } else {
    await prisma.billItem.create({
      data: {
        billId: draft.id,
        productId: product.id,
        quantity,
        unitPrice: product.sellPrice,
        gstRate: product.gstRate,
        gstAmount: gstBreakdown.gstAmount,
        lineTotal: gstBreakdown.lineTotal,
      },
    });
  }

  // Update bill totals
  const updatedDraft = await getOrCreateDraftBill(telegramUserId);
  const totals = calculateBillTotals(
    updatedDraft.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      gstRate: i.gstRate,
    }))
  );

  return await prisma.bill.update({
    where: { id: draft.id },
    data: {
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      total: totals.total,
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });
}

export async function removeItemFromDraft(
  telegramUserId: string,
  productQuery: string,
  quantityToRemove?: number
) {
  const product = await findProductByNameOrSku(productQuery);
  if (!product) {
    throw new Error(`Product matching '${productQuery}' not found.`);
  }

  const draft = await getOrCreateDraftBill(telegramUserId);
  const existingItem = draft.items.find((item) => item.productId === product.id);

  if (!existingItem) {
    throw new Error(`Item '${product.name}' is not in the draft bill.`);
  }

  if (!quantityToRemove || quantityToRemove >= existingItem.quantity) {
    // Delete line item completely
    await prisma.billItem.delete({
      where: { id: existingItem.id },
    });
  } else {
    const newQty = existingItem.quantity - quantityToRemove;
    const gstBreakdown = calculateItemGst(newQty, product.sellPrice, product.gstRate);
    await prisma.billItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: newQty,
        gstAmount: gstBreakdown.gstAmount,
        lineTotal: gstBreakdown.lineTotal,
      },
    });
  }

  const updatedDraft = await getOrCreateDraftBill(telegramUserId);
  const totals = calculateBillTotals(
    updatedDraft.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      gstRate: i.gstRate,
    }))
  );

  return await prisma.bill.update({
    where: { id: draft.id },
    data: {
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      total: totals.total,
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });
}

export async function finalizeBill(
  telegramUserId: string,
  paymentMode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT',
  customerName?: string,
  paymentReference?: string
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch current draft bill
    const draft = await tx.bill.findFirst({
      where: {
        telegramUserId,
        status: 'DRAFT',
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!draft) {
      throw new Error('No active draft bill found to finalize.');
    }

    if (draft.status !== 'DRAFT') {
      throw new Error(`Bill ${draft.billNumber} is already finalized or cancelled.`);
    }

    if (draft.items.length === 0) {
      throw new Error('Cannot finalize an empty bill.');
    }

    // 2. Oversell Protection: Check stock for every item
    for (const item of draft.items) {
      const dbProduct = await tx.product.findUnique({
        where: { id: item.productId },
      });

      if (!dbProduct) {
        throw new Error(`Product '${item.product.name}' no longer exists.`);
      }

      if (dbProduct.quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for '${dbProduct.name}'. Required: ${item.quantity} ${dbProduct.unit}, Available: ${dbProduct.quantity} ${dbProduct.unit}.`
        );
      }
    }

    // 3. Customer & Khata Handling
    let customerId = draft.customerId;
    if (customerName) {
      let cust = await tx.customer.findFirst({
        where: { name: { equals: customerName } },
      });
      if (!cust) {
        cust = await tx.customer.create({
          data: { name: customerName },
        });
      }
      customerId = cust.id;
    }

    // 4. Decrement Stock
    for (const item of draft.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          quantity: {
            decrement: item.quantity,
          },
        },
      });
    }

    // 5. Calculate Final Totals
    const totals = calculateBillTotals(
      draft.items.map((i) => ({
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        gstRate: i.gstRate,
      }))
    );

    // 6. Handle Credit Ledger if paymentMode is CREDIT
    if (paymentMode === 'CREDIT') {
      if (!customerId) {
        throw new Error('Customer name is required for credit transactions.');
      }

      await tx.khataTransaction.create({
        data: {
          customerId,
          type: 'CREDIT_GIVEN',
          amount: totals.total,
          reference: `Bill ${draft.billNumber}`,
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            increment: totals.total,
          },
        },
      });
    }

    // 7. Finalize Bill
    const finalizedBill = await tx.bill.update({
      where: { id: draft.id },
      data: {
        status: 'FINALIZED',
        customerId,
        paymentMode,
        paymentReference,
        subtotal: totals.subtotal,
        gstAmount: totals.gstAmount,
        total: totals.total,
        finalizedAt: new Date(),
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
      },
    });

    return finalizedBill;
  });
}
