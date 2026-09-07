import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import prisma from '../db/client.js';
import { getDailySales, getWeeklySales } from './analytics.js';
import { getLowStock } from './inventory.js';

export async function generateInvoicePdf(billId: string): Promise<string> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });

  if (!bill) {
    throw new Error(`Bill with ID ${billId} not found.`);
  }

  const outputDir = path.resolve('generated/invoices');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `${bill.billNumber}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header
    doc
      .fontSize(22)
      .fillColor('#1A365D')
      .text('SUPERMARKET OPS STORE', { align: 'center' })
      .fontSize(10)
      .fillColor('#4A5568')
      .text('123 Main Bazaar Road, Bengaluru, Karnataka - 560001', { align: 'center' })
      .text('GSTIN: 29ABCDE1234F1Z5 | Phone: +91 98765 43210', { align: 'center' })
      .moveDown(1.5);

    // Title & Metadata
    doc
      .fontSize(14)
      .fillColor('#2D3748')
      .text(`TAX INVOICE - ${bill.billNumber}`, { underline: true });
    
    doc.fontSize(10).moveDown(0.5);
    const dateStr = bill.finalizedAt
      ? new Date(bill.finalizedAt).toLocaleString('en-IN')
      : new Date(bill.createdAt).toLocaleString('en-IN');

    doc.text(`Date: ${dateStr}`);
    doc.text(`Customer: ${bill.customer ? bill.customer.name : 'Walk-in Customer'}`);
    doc.text(`Payment Mode: ${bill.paymentMode || 'PENDING'}`);
    if (bill.paymentReference) {
      doc.text(`Payment Ref: ${bill.paymentReference}`);
    }
    doc.moveDown(1);

    // Table Header
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Item Name', 40, tableTop);
    doc.text('Qty', 230, tableTop, { width: 40, align: 'right' });
    doc.text('Price', 280, tableTop, { width: 50, align: 'right' });
    doc.text('GST %', 345, tableTop, { width: 45, align: 'right' });
    doc.text('GST Amt', 400, tableTop, { width: 55, align: 'right' });
    doc.text('Total (₹)', 470, tableTop, { width: 70, align: 'right' });

    doc
      .moveTo(40, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .strokeColor('#CBD5E0')
      .stroke();

    let position = tableTop + 22;
    doc.font('Helvetica');

    let totalCgst = 0;
    let totalSgst = 0;

    for (const item of bill.items) {
      const cgst = item.gstAmount / 2;
      const sgst = item.gstAmount / 2;
      totalCgst += cgst;
      totalSgst += sgst;

      doc.text(item.product.name, 40, position);
      doc.text(`${item.quantity} ${item.product.unit}`, 230, position, { width: 40, align: 'right' });
      doc.text(`₹${item.unitPrice.toFixed(2)}`, 280, position, { width: 50, align: 'right' });
      doc.text(`${item.gstRate}%`, 345, position, { width: 45, align: 'right' });
      doc.text(`₹${item.gstAmount.toFixed(2)}`, 400, position, { width: 55, align: 'right' });
      doc.text(`₹${item.lineTotal.toFixed(2)}`, 470, position, { width: 70, align: 'right' });

      position += 20;
    }

    doc
      .moveTo(40, position)
      .lineTo(550, position)
      .strokeColor('#CBD5E0')
      .stroke();

    position += 10;

    // Totals Summary
    doc.font('Helvetica-Bold');
    doc.text(`Subtotal (Taxable): ₹${bill.subtotal.toFixed(2)}`, 320, position, { align: 'right' });
    position += 15;
    doc.text(`CGST: ₹${totalCgst.toFixed(2)}`, 320, position, { align: 'right' });
    position += 15;
    doc.text(`SGST: ₹${totalSgst.toFixed(2)}`, 320, position, { align: 'right' });
    position += 15;
    doc.text(`Total GST: ₹${bill.gstAmount.toFixed(2)}`, 320, position, { align: 'right' });
    position += 20;

    doc.fontSize(14).fillColor('#2B6CB0');
    doc.text(`Grand Total: ₹${bill.total.toFixed(2)}`, 320, position, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#718096').text('Thank you for shopping with us!', { align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', (err) => reject(err));
  });
}

export async function generateAnalysisPptx(): Promise<string> {
  const dailySales = await getDailySales();
  const weeklySales = await getWeeklySales();
  const lowStock = await getLowStock();

  const pptx = new (PptxGenJS as any)();
  pptx.layout = 'LAYOUT_16x9';

  // Slide 1: Sales Overview
  const slide1 = pptx.addSlide();
  slide1.addText('Supermarket Performance Analysis', {
    x: 1.0,
    y: 1.0,
    fontSize: 28,
    bold: true,
    color: '1A365D',
  });
  slide1.addText(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, {
    x: 1.0,
    y: 1.8,
    fontSize: 14,
    color: '718096',
  });

  slide1.addShape(pptx.ShapeType.rect, { x: 1.0, y: 2.5, w: 3.5, h: 2.0, fill: { color: 'EBF8FF' } });
  slide1.addText('Today Total Sales', { x: 1.2, y: 2.8, fontSize: 14, color: '2B6CB0' });
  slide1.addText(`₹${dailySales.totalSales.toFixed(2)}`, { x: 1.2, y: 3.5, fontSize: 24, bold: true, color: '2C5282' });

  slide1.addShape(pptx.ShapeType.rect, { x: 5.0, y: 2.5, w: 3.5, h: 2.0, fill: { color: 'F0FFF4' } });
  slide1.addText("Today's Bills", { x: 5.2, y: 2.8, fontSize: 14, color: '2F855A' });
  slide1.addText(`${dailySales.totalBills}`, { x: 5.2, y: 3.5, fontSize: 24, bold: true, color: '276749' });

  slide1.addShape(pptx.ShapeType.rect, { x: 9.0, y: 2.5, w: 3.5, h: 2.0, fill: { color: 'FEFCBF' } });
  slide1.addText('Weekly Sales', { x: 9.2, y: 2.8, fontSize: 14, color: 'D69E2E' });
  slide1.addText(`₹${weeklySales.totalSales.toFixed(2)}`, { x: 9.2, y: 3.5, fontSize: 24, bold: true, color: 'B7791F' });

  // Slide 2: Weekly Sales Trend
  const slide2 = pptx.addSlide();
  slide2.addText('Daily & Weekly Sales Trend', { x: 0.8, y: 0.6, fontSize: 22, bold: true, color: '1A365D' });

  const chartData = [
    {
      name: 'Sales (₹)',
      labels: weeklySales.dailyTrends.map((d) => d.date.slice(5)),
      values: weeklySales.dailyTrends.map((d) => d.sales),
    },
  ];
  slide2.addChart(pptx.ChartType.bar, chartData, {
    x: 0.8,
    y: 1.4,
    w: 11.5,
    h: 5.0,
    barDir: 'col',
    showValue: true,
  });

  // Slide 3: Top Selling Products
  const slide3 = pptx.addSlide();
  slide3.addText('Top-Selling Products', { x: 0.8, y: 0.6, fontSize: 22, bold: true, color: '1A365D' });

  const tableRows: any[] = [
    [
      { text: 'Product Name', options: { bold: true, fill: { color: '2B6CB0' }, color: 'FFFFFF' } },
      { text: 'Qty Sold', options: { bold: true, fill: { color: '2B6CB0' }, color: 'FFFFFF' } },
      { text: 'Total Revenue (₹)', options: { bold: true, fill: { color: '2B6CB0' }, color: 'FFFFFF' } },
    ],
  ];

  if (dailySales.topProducts.length === 0) {
    tableRows.push([{ text: 'No sales recorded today yet', options: { colspan: 3 } }]);
  } else {
    for (const p of dailySales.topProducts) {
      tableRows.push([
        { text: p.name },
        { text: String(p.quantity) },
        { text: `₹${p.total.toFixed(2)}` },
      ]);
    }
  }

  slide3.addTable(tableRows, { x: 0.8, y: 1.5, w: 11.5, colW: [5.0, 3.0, 3.5] });

  // Slide 4: Payment Method Breakdown
  const slide4 = pptx.addSlide();
  slide4.addText('Payment Method Breakdown', { x: 0.8, y: 0.6, fontSize: 22, bold: true, color: '1A365D' });

  const pieData = [
    {
      name: 'Payment Modes',
      labels: ['Cash', 'UPI', 'Card', 'Credit'],
      values: [
        dailySales.paymentBreakdown.cash,
        dailySales.paymentBreakdown.upi,
        dailySales.paymentBreakdown.card,
        dailySales.paymentBreakdown.credit,
      ],
    },
  ];
  slide4.addChart(pptx.ChartType.pie, pieData, {
    x: 1.5,
    y: 1.4,
    w: 9.5,
    h: 5.0,
    showLegend: true,
  });

  // Slide 5: GST Summary
  const slide5 = pptx.addSlide();
  slide5.addText('GST Tax Collection Summary', { x: 0.8, y: 0.6, fontSize: 22, bold: true, color: '1A365D' });

  const gstRows: any[] = [
    [
      { text: 'Tax Category', options: { bold: true, fill: { color: '4A5568' }, color: 'FFFFFF' } },
      { text: 'Amount (₹)', options: { bold: true, fill: { color: '4A5568' }, color: 'FFFFFF' } },
    ],
    [{ text: 'Taxable Sales Subtotal' }, { text: `₹${dailySales.taxableSales.toFixed(2)}` }],
    [{ text: 'CGST (Central Tax 50%)' }, { text: `₹${dailySales.cgst.toFixed(2)}` }],
    [{ text: 'SGST (State Tax 50%)' }, { text: `₹${dailySales.sgst.toFixed(2)}` }],
    [{ text: 'Total GST Collected' }, { text: `₹${dailySales.totalGst.toFixed(2)}` }],
    [{ text: 'Gross Revenue' }, { text: `₹${dailySales.totalSales.toFixed(2)}` }],
  ];

  slide5.addTable(gstRows, { x: 1.5, y: 1.5, w: 9.5, colW: [5.5, 4.0] });

  // Slide 6: Inventory & Low Stock Insights
  const slide6 = pptx.addSlide();
  slide6.addText('Inventory & Low-Stock Insights', { x: 0.8, y: 0.6, fontSize: 22, bold: true, color: '1A365D' });

  const stockRows: any[] = [
    [
      { text: 'Product', options: { bold: true, fill: { color: 'C53030' }, color: 'FFFFFF' } },
      { text: 'Current Stock', options: { bold: true, fill: { color: 'C53030' }, color: 'FFFFFF' } },
      { text: 'Reorder Threshold', options: { bold: true, fill: { color: 'C53030' }, color: 'FFFFFF' } },
    ],
  ];

  if (lowStock.length === 0) {
    stockRows.push([{ text: 'All products are well stocked!', options: { colspan: 3 } }]);
  } else {
    for (const item of lowStock) {
      stockRows.push([
        { text: item.name },
        { text: `${item.quantity} ${item.unit}` },
        { text: `${item.reorderLevel} ${item.unit}` },
      ]);
    }
  }

  slide6.addTable(stockRows, { x: 0.8, y: 1.5, w: 11.5, colW: [5.0, 3.25, 3.25] });

  const outputDir = path.resolve('generated/reports');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, 'sales_analysis.pptx');
  await pptx.writeFile({ fileName: filePath });
  return filePath;
}
