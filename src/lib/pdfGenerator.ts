import { jsPDF } from 'jspdf';
import { Transaction, Purchase, CompanySettings } from '../types';
import { formatDateDDMMAAAA, isBolivaresPaymentMethod } from './formatters';

/**
 * Generates and downloads a highly polished, professional PDF receipt/invoice for a transaction.
 */
export function downloadTransactionPDF(transaction: Transaction, companySettings: CompanySettings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297

  // Color Palette
  const primaryColor = [17, 24, 39]; // Slate-900 / Near Black
  const secondaryColor = [79, 70, 229]; // Indigo-600
  const lightGrey = [243, 244, 246]; // Slate-100
  const textDark = [31, 41, 55]; // Gray-800
  const textMuted = [107, 114, 128]; // Gray-500
  const borderGrey = [229, 231, 235]; // Gray-200
  const dangerColor = [220, 38, 38]; // Red-600

  // Margins
  const marginX = 15;
  let y = 15;

  // Helper for currency formatting inside PDF
  const fmt = (val: number, cur: 'USD' | 'VES') => {
    if (cur === 'USD') {
      return `$${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `Bs. ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const isBolivares = isBolivaresPaymentMethod(transaction.paymentMethod);
  const currencySymbol = isBolivares ? 'Bs.' : '$';

  // 1. Watermark if Anulado
  if (transaction.status === 'anulado') {
    doc.saveGraphicsState();
    doc.setGState(doc.GState({ opacity: 0.15 }));
    doc.setTextColor(dangerColor[0], dangerColor[1], dangerColor[2]);
    doc.setFontSize(54);
    doc.setFont('helvetica', 'bold');
    doc.text('ANULADO', pageWidth / 2, pageHeight / 2 - 20, { align: 'center', angle: 45 });
    doc.text('NO VALIDO', pageWidth / 2, pageHeight / 2 + 10, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();
  }

  // Margen superior y encabezado
  // Solo las facturas NO llevan encabezado (para imprimir en hoja preimpresa oficial)
  // Los recibos, cotizaciones, consignaciones, etc., SÍ llevan el encabezado completo de la empresa.
  if (transaction.type !== 'factura') {
    y = 15;
    const typeLabels: Record<string, string> = {
      cotizacion: 'COTIZACIÓN FORMAL',
      recibo: 'RECIBO DE PAGO DE CAJA',
      consignacion: 'NOTA DE ENTREGA EN CONSIGNACIÓN'
    };
    const docTitle = typeLabels[transaction.type] || 'DOCUMENTO COMERCIAL';

    // Document Title (Top Right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(docTitle, pageWidth - marginX, y, { align: 'right' });

    // Company Name (Top Left, wrapped to max width 95mm to avoid collision with title)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const companyName = companySettings.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.";
    const nameLines = doc.splitTextToSize(companyName.toUpperCase(), 95);
    doc.text(nameLines, marginX, y);

    y += Math.max(nameLines.length * 4.5, 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`RIF: ${companySettings.rif || 'J-50375018-9'}`, marginX, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(dangerColor[0], dangerColor[1], dangerColor[2]);
    doc.text(`N°: ${transaction.id}`, pageWidth - marginX, y, { align: 'right' });

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Teléfono: ${companySettings.phone || '0212-9876543'}`, marginX, y);
    doc.text(`Fecha: ${formatDateDDMMAAAA(transaction.timestamp)}`, pageWidth - marginX, y, { align: 'right' });

    y += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`Estado: ${transaction.status.toUpperCase()}`, pageWidth - marginX, y, { align: 'right' });

    const address = companySettings.address || "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080";
    const addressLines = doc.splitTextToSize(`Dirección: ${address}`, 115);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(addressLines, marginX, y);

    y += Math.max(addressLines.length * 4.2, 9);

    // Decorative Horizontal Bar (Blue line)
    doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.setLineWidth(0.8);
    doc.line(marginX, y, pageWidth - marginX, y);
    
    y += 5;
  } else {
    // Margen superior reservado para facturas en hojas con membrete/enunciado predeterminado
    y = 48;
  }

  // Prominent Annulment Warning Box if status is anulado
  if (transaction.status === 'anulado') {
    doc.setFillColor(254, 226, 226); // Light Red background
    doc.setDrawColor(220, 38, 38); // Red border
    doc.setLineWidth(0.5);

    const reasonText = transaction.cancellationReason || 'Documento anulado comercialmente.';
    const reasonLines = doc.splitTextToSize(`MOTIVO DE ANULACIÓN: ${reasonText}`, pageWidth - (marginX * 2) - 8);
    const boxHeight = 10 + (reasonLines.length * 3.8);

    doc.rect(marginX, y, pageWidth - (marginX * 2), boxHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.text('DOCUMENTO ANULADO - SIN VALIDEZ FISCAL NI COMERCIAL', marginX + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27);
    doc.text(reasonLines, marginX + 4, y + 9);

    if (transaction.cancelledByName) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      const cancelledDateStr = transaction.cancelledAt ? formatDateDDMMAAAA(transaction.cancelledAt) : '';
      doc.text(`Anulado por: ${transaction.cancelledByName} ${cancelledDateStr ? `(${cancelledDateStr})` : ''}`, marginX + 4, y + boxHeight - 2);
    }

    y += boxHeight + 4;
  }

  // 3. Client Information Block
  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 33, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('DATOS DEL RECEPTOR / CLIENTE', marginX + 4, y + 5);

  doc.setFontSize(8.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Nombre / Razón Social:', marginX + 4, y + 11);
  doc.text('C.I. o R.I.F.:', marginX + 4, y + 16);
  doc.text('Teléfono:', marginX + 4, y + 21);
  doc.text('Vendedor / Atendido por:', marginX + 4, y + 26);

  doc.setFont('helvetica', 'normal');
  doc.text(transaction.clientName, marginX + 42, y + 11);
  doc.text(transaction.clientRif, marginX + 42, y + 16);
  doc.text(transaction.clientPhone || 'No registrado', marginX + 42, y + 21);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(transaction.createdByName || 'No asignado', marginX + 42, y + 26);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  // Right column of client info (Email only for factura, Payment Method, Date, and Exchange Rate)
  const showEmailInDoc = transaction.type === 'factura' && !!transaction.clientEmail;
  doc.setFont('helvetica', 'bold');
  if (showEmailInDoc) {
    doc.text('Correo Electrónico:', marginX + 105, y + 11);
    doc.text('Condición de Pago:', marginX + 105, y + 16);
    doc.text('Fecha de Emisión:', marginX + 105, y + 21);
    if (isBolivares) {
      doc.text('Tasa Ref. BCV:', marginX + 105, y + 26);
    }

    doc.setFont('helvetica', 'normal');
    doc.text(transaction.clientEmail || 'No registrado', marginX + 138, y + 11);
    doc.text(transaction.paymentMethod, marginX + 138, y + 16);
    doc.text(formatDateDDMMAAAA(transaction.timestamp), marginX + 138, y + 21);
    if (isBolivares) {
      doc.text(`${transaction.exchangeRateUsed.toFixed(2)} Bs./$`, marginX + 138, y + 26);
    }
  } else {
    // For recibos, cotizaciones, consignaciones: do not reflect email
    doc.text('Condición de Pago:', marginX + 105, y + 11);
    doc.text('Fecha de Emisión:', marginX + 105, y + 16);
    if (isBolivares) {
      doc.text('Tasa Ref. BCV:', marginX + 105, y + 21);
    }

    doc.setFont('helvetica', 'normal');
    doc.text(transaction.paymentMethod, marginX + 138, y + 11);
    doc.text(formatDateDDMMAAAA(transaction.timestamp), marginX + 138, y + 16);
    if (isBolivares) {
      doc.text(`${transaction.exchangeRateUsed.toFixed(2)} Bs./$`, marginX + 138, y + 21);
    }
  }

  y += 38;

  // 4. Table Headers with explicit currency indicator
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  
  doc.text(`DESCRIPCIÓN / PRODUCTO (${currencySymbol})`, marginX + 3, y + 5);
  doc.text('CANT', marginX + 90, y + 5, { align: 'center' });
  if (isBolivares) {
    doc.text('PRECIO (Bs.)', marginX + 115, y + 5, { align: 'right' });
    doc.text('TOTAL (Bs.)', pageWidth - marginX - 3, y + 5, { align: 'right' });
  } else {
    doc.text('PRECIO ($)', marginX + 130, y + 5, { align: 'right' });
    doc.text('TOTAL ($)', pageWidth - marginX - 3, y + 5, { align: 'right' });
  }

  y += 7;

  // 5. Table Items with currency symbols on description and prices
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  transaction.items.forEach((item, index) => {
    // Alternate row backgrounds
    if (index % 2 === 1) {
      doc.setFillColor(249, 250, 251); // Slate-50
      doc.rect(marginX, y, pageWidth - (marginX * 2), 6.5, 'F');
    }
    
    // Draw fine grid line
    doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
    doc.setLineWidth(0.1);
    doc.line(marginX, y + 6.5, pageWidth - marginX, y + 6.5);

    // Product description with currency symbol
    const itemLabel = `[${currencySymbol}] ${item.name}`;
    const descWrapped = doc.splitTextToSize(itemLabel, 68);
    doc.text(descWrapped, marginX + 3, y + 4.5);
    
    // Calculate extra height if text wrapped
    const rowHeight = Math.max(6.5, descWrapped.length * 3.5 + 1);

    doc.text(String(item.qty), marginX + 90, y + 4.5, { align: 'center' });
    if (isBolivares) {
      const unitBs = (item.priceUSD * transaction.exchangeRateUsed).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const totalBs = item.totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(`Bs. ${unitBs}`, marginX + 115, y + 4.5, { align: 'right' });
      doc.text(`Bs. ${totalBs}`, pageWidth - marginX - 3, y + 4.5, { align: 'right' });
    } else {
      doc.text(`$${item.priceUSD.toFixed(2)}`, marginX + 130, y + 4.5, { align: 'right' });
      doc.text(`$${item.totalUSD.toFixed(2)}`, pageWidth - marginX - 3, y + 4.5, { align: 'right' });
    }

    y += rowHeight;
  });

  y += 4;

  // 6. Totals Block (Right Aligned)
  const totalsX = pageWidth - marginX;
  const labelX = totalsX - 48;

  // Check if we are running out of page space. A4 height is 297mm. If y is > 230, add a new page.
  if (y > 230) {
    doc.addPage();
    y = 15;
    
    // Header for 2nd page
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`CONTINUACIÓN - DOCUMENTO N° ${transaction.id}`, marginX, y);
    doc.line(marginX, y + 2, pageWidth - marginX, y + 2);
    y += 8;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  if (isBolivares) {
    // Subtotal
    doc.text('Subtotal:', labelX, y, { align: 'right' });
    doc.text(fmt(transaction.subtotalVES, 'VES'), totalsX, y, { align: 'right' });
    y += 4.5;

    // IVA (only if present and > 0)
    if (transaction.ivaVES > 0) {
      doc.text(`IVA (${transaction.ivaPercent}%):`, labelX, y, { align: 'right' });
      doc.text(fmt(transaction.ivaVES, 'VES'), totalsX, y, { align: 'right' });
      y += 4.5;
    }

    // Draw totals separator line
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(labelX - 25, y - 1, totalsX, y - 1);

    // Grand Total VES
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL A PAGAR (Bs.):', labelX, y + 3, { align: 'right' });
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(fmt(transaction.totalVES, 'VES'), totalsX, y + 3, { align: 'right' });
  } else {
    // Subtotal
    doc.text('Subtotal:', labelX, y, { align: 'right' });
    doc.text(fmt(transaction.subtotalUSD, 'USD'), totalsX, y, { align: 'right' });
    y += 4.5;

    // IVA (only if present and > 0)
    if (transaction.ivaUSD > 0) {
      doc.text(`IVA (${transaction.ivaPercent}%):`, labelX, y, { align: 'right' });
      doc.text(fmt(transaction.ivaUSD, 'USD'), totalsX, y, { align: 'right' });
      y += 4.5;
    }

    // IGTF (only if present and > 0)
    if (transaction.igtfUSD > 0) {
      doc.text(`IGTF (${transaction.igtfPercent}%):`, labelX, y, { align: 'right' });
      doc.text(fmt(transaction.igtfUSD, 'USD'), totalsX, y, { align: 'right' });
      y += 4.5;
    }

    // Draw totals separator line
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(labelX - 25, y - 1, totalsX, y - 1);

    // Grand Total USD
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL A PAGAR (USD):', labelX, y + 3, { align: 'right' });
    doc.text(fmt(transaction.totalUSD, 'USD'), totalsX, y + 3, { align: 'right' });
    
    y += 5.5;
  }

  y += 12;

  // 7. Footer / Terms / Signatures / Notes (Bottom Left)
  if (transaction.additionalNotes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text('NOTAS ADICIONALES:', marginX, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const notesWrapped = doc.splitTextToSize(transaction.additionalNotes, 110);
    doc.text(notesWrapped, marginX, y);
    y += (notesWrapped.length * 3.5) + 6;
  }

  // Bank Payment Information Block for Non-Facturas (Cotización, Recibo, Consignación)
  if (transaction.type !== 'factura') {
    // Position at fixed bottom block
    const boxY = pageHeight - 32;
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(marginX, boxY, pageWidth - (marginX * 2), 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text('INFORMACIÓN DE PAGO BANCARIO:', marginX + 4, boxY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    
    const bankDetails = [
      "Realizar transferencia bancaria a nombre de Inversiones, Producciones y Suministros CIMA C.A,",
      "RIF J-50375018-9 | Banco Mercantil | Cuenta Nro: 0105 0091 5310 9131 6287",
      "Teléfono contacto CIMA C.A: 0412 9862939 / 0212-9876543"
    ];

    doc.text(bankDetails[0], marginX + 4, boxY + 10);
    doc.text(bankDetails[1], marginX + 4, boxY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(bankDetails[2], marginX + 4, boxY + 18);
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Documento emitido por CIMA ERP - Fecha: ${formatDateDDMMAAAA(new Date())}`, marginX, pageHeight - 6);
  doc.text('Página 1 de 1', pageWidth - marginX, pageHeight - 6, { align: 'right' });

  // Download PDF
  doc.save(`CIMA_${transaction.type.toUpperCase()}_${transaction.id}.pdf`);
}

function saveDocPDF(doc: jsPDF, filename: string) {
  try {
    doc.save(filename);
  } catch (err) {
    console.warn("Standard doc.save fallback to Blob link:", err);
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 5000);
    } catch (blobErr) {
      console.error("Failed to trigger PDF download:", blobErr);
      throw blobErr;
    }
  }
}

/**
 * Generates and downloads a highly polished, professional PDF receipt/order for a purchase intake.
 */
export function downloadPurchasePDF(purchase: Purchase, companySettings?: CompanySettings) {
  if (!purchase) {
    throw new Error("No purchase data provided for PDF generation");
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297

  // Color Palette
  const primaryColor = [17, 24, 39]; // Slate-900
  const secondaryColor = [79, 70, 229]; // Indigo-600
  const lightGrey = [243, 244, 246]; // Slate-100
  const textDark = [31, 41, 55]; // Gray-800
  const textMuted = [107, 114, 128]; // Gray-500
  const borderGrey = [229, 231, 235]; // Gray-200
  const successColor = [16, 185, 129]; // Emerald-600

  const marginX = 15;
  let y = 15;

  const fmt = (val: number = 0, cur: 'USD' | 'VES') => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    if (cur === 'USD') {
      return `$${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  // Safe company info
  const comp: CompanySettings = companySettings || {
    name: "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.",
    rif: "J-50375018-9",
    phone: "0212-9876543",
    email: "contacto@cima.com.ve",
    address: "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080",
    logoUrl: "",
    ivaRate: 16,
    igtfRate: 3
  };

  // Render High-Resolution CIMA Corporate Logo Badge
  let hasImageLogo = false;
  if (comp.logoUrl && comp.logoUrl.startsWith('data:image')) {
    try {
      doc.addImage(comp.logoUrl, 'PNG', marginX, y - 2, 34, 18);
      hasImageLogo = true;
    } catch (e) {
      hasImageLogo = false;
    }
  }

  if (!hasImageLogo) {
    // Official CIMA Corporate Brandmark Badge
    const badgeW = 34;
    const badgeH = 18;
    // Deep Navy Slate container with subtle border
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(marginX, y - 2, badgeW, badgeH, 2.5, 2.5, 'F');
    doc.setDrawColor(245, 158, 11); // amber gold border line
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, y - 2, badgeW, badgeH, 2.5, 2.5, 'D');

    // Stylized CIMA geometric peak crest (amber gold + indigo)
    doc.setFillColor(245, 158, 11); // Amber
    doc.triangle(marginX + 9, y + 4.5, marginX + 17, y + 0.5, marginX + 25, y + 4.5, 'F');
    doc.setFillColor(79, 70, 229); // Indigo inner peak
    doc.triangle(marginX + 13, y + 4.5, marginX + 17, y + 2, marginX + 21, y + 4.5, 'F');

    // Bold CIMA Typography
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('C I M A', marginX + (badgeW / 2), y + 9.5, { align: 'center' });

    // Subtitle Bar
    doc.setFillColor(79, 70, 229);
    doc.rect(marginX + 2, y + 11.5, badgeW - 4, 3.5, 'F');
    doc.setFontSize(4.5);
    doc.setTextColor(255, 255, 255);
    doc.text('SUMINISTROS C.A.', marginX + (badgeW / 2), y + 14, { align: 'center' });
  }

  const compStartX = marginX + 38;
  const compColWidth = 68;

  // Header Title (Top Right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('ORDEN DE COMPRA Y ENTRADA DE ALMACÉN', pageWidth - marginX, y + 1, { align: 'right' });

  // Document Number on Right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`N°: ${purchase.id || 'COM-0000'}`, pageWidth - marginX, y + 6.5, { align: 'right' });

  // Company Name (Wrapped cleanly)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const companyName = comp.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.";
  const nameLines = doc.splitTextToSize(companyName.toUpperCase(), compColWidth);
  doc.text(nameLines, compStartX, y + 1);

  let compY = y + 1 + (nameLines.length * 3.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`RIF: ${comp.rif || 'J-50375018-9'}`, compStartX, compY);

  let dateStr = 'Fecha: -';
  try {
    const purchaseDate = purchase.timestamp ? new Date(purchase.timestamp) : new Date();
    const timeStr = purchaseDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    dateStr = `Fecha: ${formatDateDDMMAAAA(purchase.timestamp || new Date())} - ${timeStr}`;
  } catch (e) {
    dateStr = `Fecha: ${formatDateDDMMAAAA(new Date())}`;
  }
  doc.text(dateStr, pageWidth - marginX, y + 11.5, { align: 'right' });

  compY += 3.5;
  doc.text(`Teléfono: ${comp.phone || '0212-9876543'}`, compStartX, compY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const rateUsed = purchase.exchangeRateUsed || 1;
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`Tasa BCV: ${fmt(rateUsed, 'VES')}/$`, pageWidth - marginX, y + 16, { align: 'right' });

  compY += 3.5;
  const addressLines = doc.splitTextToSize(`Dirección: ${comp.address || 'Caracas, Venezuela'}`, compColWidth);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(addressLines, compStartX, compY);

  const leftBottomY = compY + (addressLines.length * 3.2);
  const rightBottomY = y + 19;
  y = Math.max(leftBottomY, rightBottomY) + 3;

  // Horizontal divider
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 3.5;

  // Supplier & Reception Data Box (with dynamic height to avoid any text collision)
  const supColWidth = 62;
  const supLines = doc.splitTextToSize(purchase.supplierName || 'Proveedor General', supColWidth);
  const supBoxHeight = Math.max(22, 12 + (supLines.length * 3.8));

  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.roundedRect(marginX, y, pageWidth - (marginX * 2), supBoxHeight, 2, 2, 'F');
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(marginX, y, pageWidth - (marginX * 2), supBoxHeight, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('DATOS DEL PROVEEDOR Y RECEPCIÓN:', marginX + 4, y + 4.5);

  // Left column in box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Proveedor / Razón Social:', marginX + 4, y + 8.8);
  doc.setFont('helvetica', 'normal');
  doc.text(supLines, marginX + 40, y + 8.8);

  const supRifY = y + 8.8 + (supLines.length * 3.6);
  doc.setFont('helvetica', 'bold');
  doc.text('RIF Proveedor:', marginX + 4, supRifY);
  doc.setFont('helvetica', 'normal');
  doc.text(purchase.supplierRif || 'N/A', marginX + 40, supRifY);

  // Right column in box
  const rightColX = marginX + 105;
  doc.setFont('helvetica', 'bold');
  doc.text('Responsable de Carga:', rightColX, y + 8.8);
  doc.setFont('helvetica', 'normal');
  doc.text(purchase.createdByName || 'ssuarez', rightColX + 36, y + 8.8);

  doc.setFont('helvetica', 'bold');
  doc.text('Estado Almacén:', rightColX, y + 13.5);
  doc.setTextColor(successColor[0], successColor[1], successColor[2]);
  doc.text('MERCANCÍA INGRESADA', rightColX + 36, y + 13.5);

  y += supBoxHeight + 4;

  // Table Header - perfectly balanced columns that never overwrite
  const colX = {
    idx: marginX + 2,             // 14
    code: marginX + 8,            // 20
    desc: marginX + 34,           // 46
    qty: marginX + 96,            // 108 (align right)
    unit: marginX + 118,          // 130 (align right)
    totalUSD: marginX + 142,      // 154 (align right)
    totalVES: pageWidth - marginX - 2 // 196 (align right)
  };

  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  doc.text('#', colX.idx, y + 4.5);
  doc.text('CÓDIGO/SKU', colX.code, y + 4.5);
  doc.text('DESCRIPCIÓN DE MERCANCÍA', colX.desc, y + 4.5);
  doc.text('CANTIDAD', colX.qty, y + 4.5, { align: 'right' });
  doc.text('COSTO ($)', colX.unit, y + 4.5, { align: 'right' });
  doc.text('TOTAL ($)', colX.totalUSD, y + 4.5, { align: 'right' });
  doc.text('TOTAL BS.', colX.totalVES, y + 4.5, { align: 'right' });

  y += 6.5;

  // Table Body Rows
  let totalUnits = 0;
  const items = Array.isArray(purchase.items) ? purchase.items : [];
  items.forEach((item, index) => {
    const descLines = doc.splitTextToSize(item.name || 'Producto', 58);
    const rowHeight = descLines.length > 1 ? 9 : 6.2;

    // Check page overflow
    if (y + rowHeight > pageHeight - 45) {
      doc.addPage();
      y = 15;
    }

    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y, pageWidth - (marginX * 2), rowHeight, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    doc.text(String(index + 1), colX.idx, y + 4.2);
    const itemCode = String(item.productId || (item as any).sku || '-').slice(0, 16);
    doc.text(itemCode, colX.code, y + 4.2);
    doc.text(descLines, colX.desc, y + 4.2);

    const qty = Number(item.qty) || 0;
    const costUSD = Number(item.costUSD) || 0;
    const itemTotalUSD = Number(item.totalUSD) || (qty * costUSD);

    doc.setFont('helvetica', 'bold');
    doc.text(String(qty), colX.qty, y + 4.2, { align: 'right' });
    totalUnits += qty;

    doc.setFont('helvetica', 'normal');
    doc.text(fmt(costUSD, 'USD'), colX.unit, y + 4.2, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(fmt(itemTotalUSD, 'USD'), colX.totalUSD, y + 4.2, { align: 'right' });

    const vesLine = itemTotalUSD * rateUsed;
    doc.setTextColor(successColor[0], successColor[1], successColor[2]);
    doc.text(fmt(vesLine, 'VES'), colX.totalVES, y + 4.2, { align: 'right' });

    y += rowHeight;
  });

  y += 4;

  // Summary Totals Box
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 15;
  }

  const totalsBoxWidth = 85;
  const totalsBoxX = pageWidth - marginX - totalsBoxWidth;
  const totalsBoxHeight = 24;

  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.roundedRect(totalsBoxX, y, totalsBoxWidth, totalsBoxHeight, 2, 2, 'F');
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.roundedRect(totalsBoxX, y, totalsBoxWidth, totalsBoxHeight, 2, 2, 'D');

  let ty = y + 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Total Unidades Ingresadas:', totalsBoxX + 4, ty);
  doc.text(`${totalUnits} unids`, totalsBoxX + totalsBoxWidth - 4, ty, { align: 'right' });

  ty += 6;
  doc.text('TOTAL COMPRA (USD):', totalsBoxX + 4, ty);
  doc.setFontSize(10);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(fmt(purchase.totalUSD || 0, 'USD'), totalsBoxX + totalsBoxWidth - 4, ty, { align: 'right' });

  ty += 6;
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('TOTAL EQUIVALENTE (VES):', totalsBoxX + 4, ty);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(successColor[0], successColor[1], successColor[2]);
  const totVES = purchase.totalVES || ((purchase.totalUSD || 0) * rateUsed);
  doc.text(fmt(totVES, 'VES'), totalsBoxX + totalsBoxWidth - 4, ty, { align: 'right' });

  y += totalsBoxHeight + 12;

  // Signature lines
  if (y > pageHeight - 35) {
    doc.addPage();
    y = 20;
  }

  const sigWidth = 70;
  const sig1X = marginX + 10;
  const sig2X = pageWidth - marginX - sigWidth - 10;

  doc.setDrawColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setLineWidth(0.3);
  doc.line(sig1X, y + 10, sig1X + sigWidth, y + 10);
  doc.line(sig2X, y + 10, sig2X + sigWidth, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('RECIBIDO CONFORME EN ALMACÉN', sig1X + (sigWidth / 2), y + 14, { align: 'center' });
  doc.text('Nombre, Firma y Sello', sig1X + (sigWidth / 2), y + 18, { align: 'center' });

  doc.text('AUTORIZADO POR ADMINISTRACIÓN', sig2X + (sigWidth / 2), y + 14, { align: 'center' });
  doc.text('Firma Autorizada CIMA', sig2X + (sigWidth / 2), y + 18, { align: 'center' });

  // Footer note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Comprobante Oficial de Compra CIMA - Registrado por: ${purchase.createdByName || 'ssuarez'} - Fecha: ${formatDateDDMMAAAA(new Date())}`, marginX, pageHeight - 6);
  doc.text('Página 1 de 1', pageWidth - marginX, pageHeight - 6, { align: 'right' });

  // Download PDF safely
  saveDocPDF(doc, `CIMA_ORDEN_COMPRA_${purchase.id || 'DETALLE'}.pdf`);
}

/**
 * Generates and downloads a complete, consolidated PDF report of all purchases in the history.
 */
export function downloadPurchasesReportPDF(
  purchases: Purchase[],
  companySettings?: CompanySettings,
  authorName = 'ssuarez'
) {
  if (!Array.isArray(purchases) || purchases.length === 0) {
    throw new Error("No hay compras para generar el reporte");
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297

  const primaryColor = [17, 24, 39];
  const secondaryColor = [79, 70, 229];
  const lightGrey = [243, 244, 246];
  const textDark = [31, 41, 55];
  const textMuted = [107, 114, 128];
  const borderGrey = [229, 231, 235];
  const successColor = [16, 185, 129];

  const marginX = 14;
  let y = 14;

  const comp = companySettings || {
    name: "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.",
    rif: "J-50375018-9",
    phone: "0212-9876543",
    email: "contacto@cima.com.ve",
    address: "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080"
  };

  const fmt = (val: number = 0, cur: 'USD' | 'VES') => {
    const num = typeof val === 'number' && !isNaN(val) ? val : 0;
    if (cur === 'USD') {
      return `$${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('REPORTE CONSOLIDADO DE COMPRAS', pageWidth - marginX, y, { align: 'right' });

  // Company Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const companyName = comp.name || "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.";
  const nameLines = doc.splitTextToSize(companyName.toUpperCase(), 110);
  doc.text(nameLines, marginX, y);
  y += Math.max(nameLines.length * 4.2, 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`RIF: ${comp.rif || 'J-50375018-9'} | Tel: ${comp.phone || '0212-9876543'}`, marginX, y);
  doc.text(`Fecha de Emisión: ${formatDateDDMMAAAA(new Date())}`, pageWidth - marginX, y, { align: 'right' });

  y += 4;
  doc.text(`Generado por: ${authorName} - Total Órdenes: ${purchases.length}`, marginX, y);

  y += 5;
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 5;

  // KPI Summary Cards
  const totalUSD = purchases.reduce((s, p) => s + (p.totalUSD || 0), 0);
  const totalVES = purchases.reduce((s, p) => s + (p.totalVES || 0), 0);
  const totalItems = purchases.reduce((s, p) => s + (p.items?.reduce((is, i) => is + (i.qty || 0), 0) || 0), 0);

  const kpiW = (pageWidth - (marginX * 2) - 6) / 3;
  const kpiH = 14;

  // Card 1: Total USD
  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.roundedRect(marginX, y, kpiW, kpiH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL INVERSIÓN (USD):', marginX + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(fmt(totalUSD, 'USD'), marginX + 3, y + 10.5);

  // Card 2: Total VES
  const card2X = marginX + kpiW + 3;
  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.roundedRect(card2X, y, kpiW, kpiH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL EQUIVALENTE (BS.):', card2X + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(successColor[0], successColor[1], successColor[2]);
  doc.text(fmt(totalVES, 'VES'), card2X + 3, y + 10.5);

  // Card 3: Total Unidades
  const card3X = card2X + kpiW + 3;
  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.roundedRect(card3X, y, kpiW, kpiH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL ARTÍCULOS INGRESADOS:', card3X + 3, y + 4.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`${totalItems} unidades`, card3X + 3, y + 10.5);

  y += kpiH + 6;

  // Table Header
  const colX = {
    id: marginX + 2,
    date: marginX + 24,
    supplier: marginX + 48,
    rif: marginX + 94,
    items: marginX + 118,
    rate: marginX + 138,
    usd: marginX + 158,
    ves: pageWidth - marginX - 2
  };

  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  doc.text('ID ORDEN', colX.id, y + 4.5);
  doc.text('FECHA', colX.date, y + 4.5);
  doc.text('PROVEEDOR', colX.supplier, y + 4.5);
  doc.text('RIF', colX.rif, y + 4.5);
  doc.text('ÍTEMS', colX.items, y + 4.5, { align: 'right' });
  doc.text('TASA BCV', colX.rate, y + 4.5, { align: 'right' });
  doc.text('TOTAL USD', colX.usd, y + 4.5, { align: 'right' });
  doc.text('TOTAL BS.', colX.ves, y + 4.5, { align: 'right' });

  y += 6.5;

  purchases.forEach((p, idx) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 15;
      // Repeat header on new page
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(marginX, y, pageWidth - (marginX * 2), 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('ID ORDEN', colX.id, y + 4.5);
      doc.text('FECHA', colX.date, y + 4.5);
      doc.text('PROVEEDOR', colX.supplier, y + 4.5);
      doc.text('RIF', colX.rif, y + 4.5);
      doc.text('ÍTEMS', colX.items, y + 4.5, { align: 'right' });
      doc.text('TASA BCV', colX.rate, y + 4.5, { align: 'right' });
      doc.text('TOTAL USD', colX.usd, y + 4.5, { align: 'right' });
      doc.text('TOTAL BS.', colX.ves, y + 4.5, { align: 'right' });
      y += 6.5;
    }

    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y, pageWidth - (marginX * 2), 6, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(p.id || '-', colX.id, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(formatDateDDMMAAAA(p.timestamp || new Date()), colX.date, y + 4.2);

    const supName = doc.splitTextToSize(p.supplierName || 'General', 44)[0] || p.supplierName || '';
    doc.text(supName, colX.supplier, y + 4.2);

    doc.text(p.supplierRif || '-', colX.rif, y + 4.2);

    const itCount = p.items ? p.items.length : 0;
    doc.text(`${itCount}`, colX.items, y + 4.2, { align: 'right' });

    doc.text(fmt(p.exchangeRateUsed || 1, 'VES'), colX.rate, y + 4.2, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(fmt(p.totalUSD || 0, 'USD'), colX.usd, y + 4.2, { align: 'right' });

    doc.setTextColor(successColor[0], successColor[1], successColor[2]);
    doc.text(fmt(p.totalVES || 0, 'VES'), colX.ves, y + 4.2, { align: 'right' });

    y += 6;
  });

  // Bottom Summary row
  y += 3;
  if (y > pageHeight - 35) {
    doc.addPage();
    y = 15;
  }

  doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 7, 'F');
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.rect(marginX, y, pageWidth - (marginX * 2), 7, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('TOTALES CONSOLIDADOS:', marginX + 3, y + 4.8);

  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(fmt(totalUSD, 'USD'), colX.usd, y + 4.8, { align: 'right' });

  doc.setTextColor(successColor[0], successColor[1], successColor[2]);
  doc.text(fmt(totalVES, 'VES'), colX.ves, y + 4.8, { align: 'right' });

  y += 15;

  // Signature Block
  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }

  const sigWidth = 70;
  const sig1X = marginX + 10;
  const sig2X = pageWidth - marginX - sigWidth - 10;

  doc.setDrawColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setLineWidth(0.3);
  doc.line(sig1X, y + 10, sig1X + sigWidth, y + 10);
  doc.line(sig2X, y + 10, sig2X + sigWidth, y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('REVISADO POR JEFE DE ALMACÉN', sig1X + (sigWidth / 2), y + 14, { align: 'center' });
  doc.text('Firma y Sello', sig1X + (sigWidth / 2), y + 18, { align: 'center' });

  doc.text('CONFORMIDAD ADMINISTRATIVA', sig2X + (sigWidth / 2), y + 14, { align: 'center' });
  doc.text('Firma Autorizada CIMA', sig2X + (sigWidth / 2), y + 18, { align: 'center' });

  saveDocPDF(doc, `REPORTE_COMPRAS_CIMA_${formatDateDDMMAAAA(new Date()).replace(/\//g, '-')}.pdf`);
}
