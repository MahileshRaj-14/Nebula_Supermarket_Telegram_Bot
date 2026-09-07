import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/db/client.js';
import { calculateItemGst, calculateBillTotals } from '../src/services/gst.js';
import * as inventoryService from '../src/services/inventory.js';
import * as billingService from '../src/services/billing.js';
import * as khataService from '../src/services/khata.js';
import * as analyticsService from '../src/services/analytics.js';
import * as preferenceService from '../src/services/preferences.js';
import * as documentService from '../src/services/documents.js';
import fs from 'node:fs';

const TEST_USER = 'test_telegram_user_123';

describe('Supermarket Ops Agent - Suite', () => {
  beforeAll(async () => {
    // Ensure test database is clean or seeded
    await prisma.billItem.deleteMany();
    await prisma.bill.deleteMany();
    await prisma.khataTransaction.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.preference.deleteMany();
    await prisma.processedUpdate.deleteMany();
    await prisma.product.deleteMany();

    // Add test products
    await inventoryService.addProduct({
      sku: 'TEST-MAGGI',
      name: 'Maggi 70g',
      category: 'Instant Food',
      unit: 'packet',
      isPackaged: true,
      costPrice: 10,
      sellPrice: 14,
      mrp: 15,
      gstRate: 12,
      hsnCode: '1902',
      quantity: 10,
      reorderLevel: 5,
    });

    await inventoryService.addProduct({
      sku: 'TEST-SALT',
      name: 'Tata Salt 1kg',
      category: 'Staples',
      unit: 'packet',
      isPackaged: true,
      costPrice: 20,
      sellPrice: 28,
      mrp: 30,
      gstRate: 0,
      hsnCode: '2501',
      quantity: 50,
      reorderLevel: 10,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 1. GST Calculation Tests
  describe('GST Calculations', () => {
    it('should correctly calculate intra-state GST (50% CGST, 50% SGST) with exact paise rounding', () => {
      // 2 Maggi @ Rs 14 with 12% GST
      // Taxable = 28.00
      // GST = 28 * 0.12 = 3.36 (CGST = 1.68, SGST = 1.68)
      // Total = 31.36
      const res = calculateItemGst(2, 14, 12);
      expect(res.taxableValue).toBe(28);
      expect(res.gstAmount).toBe(3.36);
      expect(res.cgst).toBe(1.68);
      expect(res.sgst).toBe(1.68);
      expect(res.lineTotal).toBe(31.36);
    });

    it('should correctly handle 0% GST items', () => {
      const res = calculateItemGst(5, 28, 0);
      expect(res.taxableValue).toBe(140);
      expect(res.gstAmount).toBe(0);
      expect(res.cgst).toBe(0);
      expect(res.sgst).toBe(0);
      expect(res.lineTotal).toBe(140);
    });

    it('should calculate bill aggregate totals correctly', () => {
      const totals = calculateBillTotals([
        { quantity: 2, unitPrice: 14, gstRate: 12 }, // taxable 28, gst 3.36, total 31.36
        { quantity: 1, unitPrice: 28, gstRate: 0 },  // taxable 28, gst 0.00, total 28.00
      ]);
      expect(totals.subtotal).toBe(56);
      expect(totals.gstAmount).toBe(3.36);
      expect(totals.total).toBe(59.36);
    });
  });

  // 2. Inventory & Stock Receiving
  describe('Inventory Management', () => {
    it('should receive stock and update quantity correctly', async () => {
      const updated = await inventoryService.receiveStock('TEST-MAGGI', 20);
      expect(updated.quantity).toBe(30); // Started with 10 + 20 = 30
    });

    it('should detect low stock items correctly', async () => {
      // Set stock of TEST-MAGGI to 4 (below reorder level 5)
      await prisma.product.update({
        where: { sku: 'TEST-MAGGI' },
        data: { quantity: 4 },
      });

      const lowItems = await inventoryService.getLowStock();
      expect(lowItems.some((i) => i.sku === 'TEST-MAGGI')).toBe(true);

      // Restore stock back to 30
      await prisma.product.update({
        where: { sku: 'TEST-MAGGI' },
        data: { quantity: 30 },
      });
    });
  });

  // 3. Billing & Oversell Protection
  describe('Billing & Transactional Oversell Protection', () => {
    it('should manage multi-turn draft bill creation and modifications', async () => {
      // Add 3 Maggi
      let draft = await billingService.addItemToDraft(TEST_USER, 'TEST-MAGGI', 3);
      expect(draft.items.length).toBe(1);
      expect(draft.items[0].quantity).toBe(3);

      // Add 1 Salt
      draft = await billingService.addItemToDraft(TEST_USER, 'TEST-SALT', 1);
      expect(draft.items.length).toBe(2);

      // Remove 1 Maggi (should leave 2 Maggi)
      draft = await billingService.removeItemFromDraft(TEST_USER, 'TEST-MAGGI', 1);
      const maggiItem = draft.items.find((i) => i.product.sku === 'TEST-MAGGI');
      expect(maggiItem?.quantity).toBe(2);
    });

    it('REJECT OVERSELL: should prevent finalization if stock is insufficient', async () => {
      // Current stock of TEST-MAGGI is 30. Try adding 100 Maggi to draft
      await billingService.addItemToDraft(TEST_USER, 'TEST-MAGGI', 100);

      // Finalization must fail with clear error message
      await expect(
        billingService.finalizeBill(TEST_USER, 'UPI')
      ).rejects.toThrow(/Insufficient stock for 'Maggi 70g'/);

      // Remove excess Maggi item from draft to fix draft state
      await billingService.removeItemFromDraft(TEST_USER, 'TEST-MAGGI');
    });

    it('should successfully finalize bill, decrement stock, and record sale', async () => {
      // Re-add 2 Maggi and 1 Salt to draft to be completely sure
      await billingService.clearDraftBill(TEST_USER);
      await billingService.addItemToDraft(TEST_USER, 'TEST-MAGGI', 2);
      await billingService.addItemToDraft(TEST_USER, 'TEST-SALT', 1);

      const maggiBefore = await inventoryService.findProductByNameOrSku('TEST-MAGGI');
      const saltBefore = await inventoryService.findProductByNameOrSku('TEST-SALT');

      const finalized = await billingService.finalizeBill(TEST_USER, 'UPI', 'Ravi', 'UPI-TXN-999');
      expect(finalized.status).toBe('FINALIZED');
      expect(finalized.paymentMode).toBe('UPI');

      // Check stock decremented
      const maggiAfter = await inventoryService.findProductByNameOrSku('TEST-MAGGI');
      const saltAfter = await inventoryService.findProductByNameOrSku('TEST-SALT');

      expect(maggiAfter?.quantity).toBe(maggiBefore!.quantity - 2);
      expect(saltAfter?.quantity).toBe(saltBefore!.quantity - 1);
    });

    it('should reject double finalization', async () => {
      await expect(
        billingService.finalizeBill(TEST_USER, 'UPI')
      ).rejects.toThrow(/No active draft bill found/);
    });
  });

  // 4. Khata / Credit Ledger
  describe('Khata / Credit System', () => {
    it('should add credit given and update customer balance', async () => {
      const res = await khataService.addCredit('Ravi Kumar', 300, 'Grocery credit');
      expect(res.customer.balance).toBe(300);
      expect(res.addedCredit).toBe(300);
    });

    it('should record credit repayment and reduce balance', async () => {
      const res = await khataService.recordCreditPayment('Ravi Kumar', 100, 'UPI Repayment');
      expect(res.remainingBalance).toBe(200);
    });

    it('should retrieve customer balance accurately', async () => {
      const bal = await khataService.getCreditBalance('Ravi Kumar');
      expect(bal.found).toBe(true);
      expect(bal.balance).toBe(200);
      expect(bal.recentTransactions.length).toBeGreaterThan(0);
    });
  });

  // 5. Analytics
  describe('Sales Analytics', () => {
    it('should generate daily sales report with accurate totals', async () => {
      const daily = await analyticsService.getDailySales();
      expect(daily.totalBills).toBeGreaterThan(0);
      expect(daily.totalSales).toBeGreaterThan(0);
      expect(daily.paymentBreakdown.upi).toBeGreaterThan(0);
    });
  });

  // 6. Preferences / Persistent Memory
  describe('Persistent Preferences', () => {
    it('should save and retrieve preferences, surviving draft bill reset', async () => {
      await preferenceService.setPreference(TEST_USER, 'preferred_payment', 'UPI');
      
      const valBefore = await preferenceService.getPreference(TEST_USER, 'preferred_payment');
      expect(valBefore).toBe('UPI');

      // Clear draft bill (/new command)
      await billingService.clearDraftBill(TEST_USER);

      const valAfter = await preferenceService.getPreference(TEST_USER, 'preferred_payment');
      expect(valAfter).toBe('UPI');
    });
  });

  // 7. PDF and PPTX Document Generation
  describe('Document Generation (PDF & PPTX)', () => {
    it('should generate a valid PDF tax invoice file', async () => {
      const lastBill = await prisma.bill.findFirst({
        where: { status: 'FINALIZED' },
      });
      expect(lastBill).not.toBeNull();

      const pdfPath = await documentService.generateInvoicePdf(lastBill!.id);
      expect(fs.existsSync(pdfPath)).toBe(true);
      expect(pdfPath.endsWith('.pdf')).toBe(true);
    });

    it('should generate a valid PPTX sales analysis presentation file', async () => {
      const pptxPath = await documentService.generateAnalysisPptx();
      expect(fs.existsSync(pptxPath)).toBe(true);
      expect(pptxPath.endsWith('.pptx')).toBe(true);
    });
  });
});
