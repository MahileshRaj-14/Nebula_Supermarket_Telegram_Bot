import { tool } from 'ai';
import { z } from 'zod';
import * as inventoryService from '../services/inventory.js';
import * as billingService from '../services/billing.js';
import * as khataService from '../services/khata.js';
import * as analyticsService from '../services/analytics.js';
import * as documentService from '../services/documents.js';
import * as preferenceService from '../services/preferences.js';
import prisma from '../db/client.js';

export const createAgentTools = (telegramUserId: string) => ({
  search_products: tool({
    description: 'Search for products in the inventory by name, category, or SKU.',
    parameters: z.object({
      query: z.string().describe('The product name, keyword, or SKU to search for.'),
    }),
    execute: async ({ query }) => {
      return await inventoryService.searchProducts(query);
    },
  }),

  get_product: tool({
    description: 'Get detailed information about a specific product by its name or SKU.',
    parameters: z.object({
      product: z.string().describe('The product name or exact SKU.'),
    }),
    execute: async ({ product }) => {
      const p = await inventoryService.findProductByNameOrSku(product);
      if (!p) return { error: `Product '${product}' not found.` };
      return p;
    },
  }),

  add_product: tool({
    description: 'Add a new product to the supermarket inventory database.',
    parameters: z.object({
      sku: z.string(),
      name: z.string(),
      category: z.string(),
      unit: z.string().describe('Unit of measurement, e.g., packet, kg, piece, liter'),
      isPackaged: z.boolean().default(true),
      costPrice: z.number().positive(),
      sellPrice: z.number().positive(),
      mrp: z.number().positive(),
      gstRate: z.number().min(0),
      hsnCode: z.string(),
      quantity: z.number().min(0),
      reorderLevel: z.number().min(0),
    }),
    execute: async (input) => {
      try {
        const newProduct = await inventoryService.addProduct(input);
        return { success: true, product: newProduct };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  receive_stock: tool({
    description: 'Receive new stock / replenish inventory for an existing product.',
    parameters: z.object({
      product: z.string().describe('Product name or SKU'),
      addQuantity: z.number().positive().describe('Quantity of stock received to add to existing inventory'),
    }),
    execute: async ({ product, addQuantity }) => {
      try {
        const updated = await inventoryService.receiveStock(product, addQuantity);
        return {
          success: true,
          message: `Stock updated for '${updated.name}'. New Total Stock: ${updated.quantity} ${updated.unit}.`,
          product: updated,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  get_low_stock: tool({
    description: 'Get a list of products that are running low on stock (quantity <= reorder level).',
    parameters: z.object({}),
    execute: async () => {
      const items = await inventoryService.getLowStock();
      return { lowStockCount: items.length, items };
    },
  }),

  add_item_to_bill: tool({
    description: 'Add an item to the active draft bill.',
    parameters: z.object({
      product: z.string().describe('Product name or SKU'),
      quantity: z.number().positive().describe('Quantity to bill'),
    }),
    execute: async ({ product, quantity }) => {
      try {
        const bill = await billingService.addItemToDraft(telegramUserId, product, quantity);
        return {
          success: true,
          billNumber: bill.billNumber,
          items: bill.items.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
          subtotal: bill.subtotal,
          gstAmount: bill.gstAmount,
          total: bill.total,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  remove_item_from_bill: tool({
    description: 'Remove or reduce quantity of an item in the active draft bill.',
    parameters: z.object({
      product: z.string().describe('Product name or SKU'),
      quantityToRemove: z.number().positive().optional().describe('Quantity to reduce. If omitted, removes item completely.'),
    }),
    execute: async ({ product, quantityToRemove }) => {
      try {
        const bill = await billingService.removeItemFromDraft(telegramUserId, product, quantityToRemove);
        return {
          success: true,
          billNumber: bill.billNumber,
          items: bill.items.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.lineTotal,
          })),
          subtotal: bill.subtotal,
          gstAmount: bill.gstAmount,
          total: bill.total,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  get_draft_bill: tool({
    description: 'View the current active draft bill.',
    parameters: z.object({}),
    execute: async () => {
      const bill = await billingService.getOrCreateDraftBill(telegramUserId);
      return {
        billNumber: bill.billNumber,
        items: bill.items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          gstRate: i.gstRate,
          gstAmount: i.gstAmount,
          lineTotal: i.lineTotal,
        })),
        subtotal: bill.subtotal,
        gstAmount: bill.gstAmount,
        total: bill.total,
      };
    },
  }),

  finalize_bill: tool({
    description: 'Finalize the active draft bill with payment mode, check stock, update inventory, and complete sale.',
    parameters: z.object({
      paymentMode: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT']).describe('Payment method used'),
      customerName: z.string().optional().describe('Customer name (required if paymentMode is CREDIT)'),
      paymentReference: z.string().optional().describe('UPI reference / transaction ID or note'),
    }),
    execute: async ({ paymentMode, customerName, paymentReference }) => {
      try {
        const bill = await billingService.finalizeBill(
          telegramUserId,
          paymentMode,
          customerName,
          paymentReference
        );
        return {
          success: true,
          billId: bill.id,
          billNumber: bill.billNumber,
          customer: bill.customer ? bill.customer.name : 'Walk-in',
          paymentMode: bill.paymentMode,
          total: bill.total,
          finalizedAt: bill.finalizedAt,
          items: bill.items.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            total: i.lineTotal,
          })),
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  add_credit: tool({
    description: 'Record credit given to a customer (Khata ledger entry).',
    parameters: z.object({
      customerName: z.string().describe('Customer name'),
      amount: z.number().positive().describe('Credit amount in Rupees'),
      reference: z.string().optional().describe('Reason or invoice reference'),
    }),
    execute: async ({ customerName, amount, reference }) => {
      try {
        const res = await khataService.addCredit(customerName, amount, reference);
        return {
          success: true,
          customer: res.customer.name,
          addedCredit: amount,
          newBalance: res.customer.balance,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  record_credit_payment: tool({
    description: 'Record a credit repayment / payment received from a customer.',
    parameters: z.object({
      customerName: z.string().describe('Customer name'),
      amount: z.number().positive().describe('Payment amount in Rupees'),
      reference: z.string().optional().describe('Payment mode or note'),
    }),
    execute: async ({ customerName, amount, reference }) => {
      try {
        const res = await khataService.recordCreditPayment(customerName, amount, reference);
        return {
          success: true,
          customer: res.customer.name,
          paidAmount: amount,
          remainingBalance: res.customer.balance,
        };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  get_credit_balance: tool({
    description: "Get a customer's total outstanding Khata / credit balance.",
    parameters: z.object({
      customerName: z.string().describe('Customer name'),
    }),
    execute: async ({ customerName }) => {
      return await khataService.getCreditBalance(customerName);
    },
  }),

  get_daily_sales: tool({
    description: "Get today's total sales summary including tax, payment modes, and top products.",
    parameters: z.object({
      date: z.string().optional().describe('Optional YYYY-MM-DD date. Defaults to today.'),
    }),
    execute: async ({ date }) => {
      return await analyticsService.getDailySales(date);
    },
  }),

  get_weekly_sales: tool({
    description: 'Get weekly sales trends and aggregates over the past 7 days.',
    parameters: z.object({}),
    execute: async () => {
      return await analyticsService.getWeeklySales();
    },
  }),

  generate_invoice_pdf: tool({
    description: 'Generate a professional PDF tax invoice for a finalized bill and return the file path.',
    parameters: z.object({
      billId: z.string().optional().describe('Specific bill ID. If omitted, uses the most recently finalized bill.'),
    }),
    execute: async ({ billId }) => {
      try {
        let targetId = billId;
        if (!targetId) {
          const lastBill = await prisma.bill.findFirst({
            where: { telegramUserId, status: 'FINALIZED' },
            orderBy: { finalizedAt: 'desc' },
          });
          if (!lastBill) {
            return { error: 'No finalized bill found to generate invoice.' };
          }
          targetId = lastBill.id;
        }

        const filePath = await documentService.generateInvoicePdf(targetId);
        return { success: true, filePath, fileType: 'pdf' };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  generate_analysis_pptx: tool({
    description: 'Generate a 6-slide PowerPoint sales performance presentation deck (.pptx) and return the file path.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const filePath = await documentService.generateAnalysisPptx();
        return { success: true, filePath, fileType: 'pptx' };
      } catch (err: any) {
        return { error: err.message };
      }
    },
  }),

  set_preference: tool({
    description: 'Save/remember a persistent user setting or preference in PostgreSQL/SQLite.',
    parameters: z.object({
      key: z.string().describe('Preference key e.g., preferred_payment, shop_name, response_style'),
      value: z.string().describe('Preference value'),
    }),
    execute: async ({ key, value }) => {
      const pref = await preferenceService.setPreference(telegramUserId, key, value);
      return { success: true, key: pref.key, value: pref.value };
    },
  }),

  get_preference: tool({
    description: 'Retrieve a saved persistent user setting or preference.',
    parameters: z.object({
      key: z.string().describe('Preference key e.g., preferred_payment, shop_name'),
    }),
    execute: async ({ key }) => {
      const val = await preferenceService.getPreference(telegramUserId, key);
      return { key, value: val };
    },
  }),
});
