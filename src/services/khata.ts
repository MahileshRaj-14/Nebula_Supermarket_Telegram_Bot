import prisma from '../db/client.js';

export async function findOrCreateCustomer(name: string) {
  const cleanName = name.trim();
  let customer = await prisma.customer.findFirst({
    where: { name: { equals: cleanName } },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: cleanName },
    });
  }

  return customer;
}

export async function addCredit(customerName: string, amount: number, reference?: string) {
  if (amount <= 0) {
    throw new Error('Credit amount must be greater than 0');
  }

  const customer = await findOrCreateCustomer(customerName);

  return await prisma.$transaction(async (tx) => {
    const transaction = await tx.khataTransaction.create({
      data: {
        customerId: customer.id,
        type: 'CREDIT_GIVEN',
        amount,
        reference: reference || 'Store credit',
      },
    });

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    return {
      transaction,
      customer: updatedCustomer,
      addedCredit: amount,
      newBalance: updatedCustomer.balance,
    };
  });
}

export async function recordCreditPayment(customerName: string, amount: number, reference?: string) {
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }

  const customer = await findOrCreateCustomer(customerName);

  return await prisma.$transaction(async (tx) => {
    const transaction = await tx.khataTransaction.create({
      data: {
        customerId: customer.id,
        type: 'PAYMENT_RECEIVED',
        amount,
        reference: reference || 'Khata payment',
      },
    });

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    return {
      transaction,
      customer: updatedCustomer,
      paidAmount: amount,
      remainingBalance: updatedCustomer.balance,
    };
  });
}

export async function getCreditBalance(customerName: string) {
  const cleanName = customerName.trim();
  const customer = await prisma.customer.findFirst({
    where: { name: { equals: cleanName } },
    include: {
      khataTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!customer) {
    return {
      found: false,
      name: customerName,
      balance: 0,
      recentTransactions: [],
    };
  }

  return {
    found: true,
    name: customer.name,
    balance: customer.balance,
    recentTransactions: customer.khataTransactions,
  };
}
