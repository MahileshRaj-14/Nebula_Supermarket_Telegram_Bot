export interface GstBreakdown {
  taxableValue: number; // In Rupees
  gstRate: number;      // e.g. 5, 12, 18
  gstAmount: number;    // Total GST in Rupees
  cgst: number;         // CGST in Rupees (50%)
  sgst: number;         // SGST in Rupees (50%)
  lineTotal: number;    // Taxable + GST in Rupees
}

export function calculateItemGst(
  quantity: number,
  unitPrice: number,
  gstRate: number
): GstBreakdown {
  const taxableValuePaise = Math.round(quantity * unitPrice * 100);
  const gstAmountPaise = Math.round(taxableValuePaise * (gstRate / 100));
  
  // Intra-state split: CGST = 50%, SGST = 50%
  const cgstPaise = Math.floor(gstAmountPaise / 2);
  const sgstPaise = gstAmountPaise - cgstPaise;
  const lineTotalPaise = taxableValuePaise + gstAmountPaise;

  return {
    taxableValue: taxableValuePaise / 100,
    gstRate,
    gstAmount: gstAmountPaise / 100,
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    lineTotal: lineTotalPaise / 100,
  };
}

export function calculateBillTotals(items: { quantity: number; unitPrice: number; gstRate: number }[]) {
  let totalSubtotalPaise = 0;
  let totalGstPaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let grandTotalPaise = 0;

  for (const item of items) {
    const b = calculateItemGst(item.quantity, item.unitPrice, item.gstRate);
    totalSubtotalPaise += Math.round(b.taxableValue * 100);
    totalGstPaise += Math.round(b.gstAmount * 100);
    totalCgstPaise += Math.round(b.cgst * 100);
    totalSgstPaise += Math.round(b.sgst * 100);
    grandTotalPaise += Math.round(b.lineTotal * 100);
  }

  return {
    subtotal: totalSubtotalPaise / 100,
    gstAmount: totalGstPaise / 100,
    cgst: totalCgstPaise / 100,
    sgst: totalSgstPaise / 100,
    total: grandTotalPaise / 100,
  };
}
