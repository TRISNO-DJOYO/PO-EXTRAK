import * as XLSX from 'xlsx';
import { ExtractedTable, ExtractionResult } from '../types';

export interface POInfoData {
  poNumber: string;
  placeDate?: string;
  subject?: string;
}

/**
 * Clean PO Document Title to pure PO Number
 */
export function cleanPoTitle(title?: string): string {
  if (!title) return '(contoh:PO/TB/26/N013959)';
  const cleaned = title
    .replace(/^Purchase Order\s+(?:PT\.?\s+)?Tower Bersama\s*[-:]?\s*/i, '')
    .replace(/^PT\.?\s+Tower Bersama\s*[-:]?\s*/i, '')
    .replace(/^Purchase Order\s*[-:]?\s*/i, '')
    .trim();
  return cleaned || '(contoh:PO/TB/26/N013959)';
}

/**
 * Clean PO Date to extract date only without place/city
 */
export function cleanPoDate(dateStr?: string): string {
  if (!dateStr) return '(contoh:08-May-2026)';
  let cleaned = dateStr.trim();
  // If it has comma like "Jakarta, 08-May-2026", take after comma
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    cleaned = parts.slice(1).join(',').trim();
  }
  // Remove common place/date prefixes
  cleaned = cleaned.replace(/^(?:place\s*\/\s*date|place\s*&\s*date|date|tanggal|tgl|tempat\s*\/\s*tgl)\s*[-:]?\s*/i, '').trim();
  // Extract standard date pattern (e.g. 08-May-2026, 08-05-2026, 08 Mei 2026)
  const datePattern = /\b\d{1,2}[-\s/.](?:[a-zA-Z]{3,12}|\d{1,2})[-\s/.]\d{2,4}\b/;
  const match = cleaned.match(datePattern);
  if (match) {
    return match[0].trim();
  }
  // Extract ISO format YYYY-MM-DD
  const isoMatch = cleaned.match(/\b\d{4}[-\s/.]\d{1,2}[-\s/.]\d{1,2}\b/);
  if (isoMatch) {
    return isoMatch[0].trim();
  }
  return cleaned || '(contoh:08-May-2026)';
}

/**
 * Check if a text references "Instalasi ODP/OTB"
 */
export function isOdpOtbItem(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('instalasi odp/otb') ||
    lower.includes('instalasi odp / otb') ||
    lower.includes('instalasi odp & otb') ||
    lower.includes('instalasi odp dan otb') ||
    /instalasi\s+(?:dan\s+)?(?:odp\s*[\/\&]\s*otb|otb\s*[\/\&]\s*odp)/i.test(text) ||
    /\bodp\s*[\/\&]\s*otb\b/i.test(text)
  );
}

/**
 * Normalize tables so that any row with "Instalasi ODP/OTB" has its UoM set to "unit"
 */
export function normalizeTableWithOdpOtb(table: ExtractedTable): ExtractedTable {
  if (!table || !table.headers || !table.rows) return table;

  const headers = table.headers;
  let uomColIdx = headers.findIndex(h => /^(?:uom|u\.o\.m|unit\s*of\s*measure(?:ment)?|satuan|unit)$/i.test(h.trim()));
  if (uomColIdx === -1) {
    uomColIdx = headers.findIndex(h => /(?:uom|satuan)/i.test(h.trim()));
  }

  const updatedRows = table.rows.map(row => {
    const hasOdpOtb = row.some(cell => isOdpOtbItem(String(cell)));
    if (!hasOdpOtb) return row;

    const newRow = [...row];
    if (uomColIdx !== -1 && uomColIdx < newRow.length) {
      newRow[uomColIdx] = 'unit';
    } else {
      const unitValIdx = newRow.findIndex(cell =>
        /^(?:lot|ls|set|pcs|meter|m|m'|titik|lokasi|unit|core|port|bh|btg)$/i.test(String(cell).trim())
      );
      if (unitValIdx !== -1) {
        newRow[unitValIdx] = 'unit';
      }
    }
    return newRow;
  });

  return {
    ...table,
    rows: updatedRows,
  };
}

/**
 * Export single or multiple tables to an Excel (.xlsx) file with optional PO Info header block
 */
export function exportTablesToExcel(
  tables: ExtractedTable[],
  documentTitle: string = 'Extracted_Tables',
  poInfo?: POInfoData
) {
  if (!tables || tables.length === 0) return;

  const normalizedTables = tables.map(normalizeTableWithOdpOtb);
  const workbook = XLSX.utils.book_new();

  // If poInfo is provided, we can either create a dedicated PO_INFO sheet or prepend to each sheet
  if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
    const poHeaders = ['PURCHASE ORDER', 'Place/Date', 'SUBJECT'];
    const poRows = [
      [poInfo.poNumber || '-', poInfo.placeDate || '-', poInfo.subject || '-']
    ];
    const poSheet = XLSX.utils.aoa_to_sheet([poHeaders, ...poRows]);
    poSheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, poSheet, 'PO_INFO');
  }

  normalizedTables.forEach((table, index) => {
    // Sheet name max 31 chars
    let sheetName = (table.title || `Tabel ${index + 1}`).replace(/[:\\\/\?\*\[\]]/g, '').trim();
    if (sheetName.length > 28) {
      sheetName = sheetName.substring(0, 28) + `_${index + 1}`;
    }
    if (!sheetName) sheetName = `Sheet${index + 1}`;

    const sheetData: any[][] = [];

    // Prepend PO Header rows if provided
    if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
      sheetData.push(['PURCHASE ORDER', 'Place/Date', 'SUBJECT']);
      sheetData.push([poInfo.poNumber || '-', poInfo.placeDate || '-', poInfo.subject || '-']);
      sheetData.push([]); // blank row separator
    }

    sheetData.push(table.headers);
    table.rows.forEach(r => sheetData.push(r));

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto calculate column widths
    const colWidths = table.headers.map((header, colIdx) => {
      let maxLen = String(header).length;
      table.rows.forEach(row => {
        const valStr = String(row[colIdx] ?? '');
        if (valStr.length > maxLen) maxLen = Math.min(valStr.length, 50);
      });
      return { wch: Math.max(maxLen + 4, 14) };
    });
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  const safeFileName = (documentTitle || 'extracted_tables').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(workbook, `${safeFileName}_tables.xlsx`);
}

/**
 * Export a single table to CSV string and download, with optional PO Info
 */
export function exportTableToCSV(
  table: ExtractedTable,
  fileName: string = 'table',
  poInfo?: POInfoData
) {
  const normalizedTable = normalizeTableWithOdpOtb(table);
  const lines: string[] = [];

  // Escape CSV value
  const escapeVal = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
    lines.push(['PURCHASE ORDER', 'Place/Date', 'SUBJECT'].map(escapeVal).join(','));
    lines.push([poInfo.poNumber || '-', poInfo.placeDate || '-', poInfo.subject || '-'].map(escapeVal).join(','));
    lines.push(''); // Empty line separator
  }

  lines.push(normalizedTable.headers.map(escapeVal).join(','));
  normalizedTable.rows.forEach(row => {
    lines.push(row.map(escapeVal).join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n'); // Add UTF-8 BOM
  downloadBlob(csvContent, `${fileName}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Convert table to Markdown string
 */
export function tableToMarkdown(table: ExtractedTable, poInfo?: POInfoData): string {
  const normalizedTable = normalizeTableWithOdpOtb(table);
  if (!normalizedTable.headers || normalizedTable.headers.length === 0) return '';
  let result = '';

  if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
    result += `| PURCHASE ORDER | Place/Date | SUBJECT |\n`;
    result += `| --- | --- | --- |\n`;
    result += `| ${poInfo.poNumber || '-'} | ${poInfo.placeDate || '-'} | ${poInfo.subject || '-'} |\n\n`;
  }

  const headerRow = `| ${normalizedTable.headers.join(' | ')} |`;
  const separatorRow = `| ${normalizedTable.headers.map(() => '---').join(' | ')} |`;
  const dataRows = normalizedTable.rows.map(row => `| ${row.map(cell => String(cell ?? '')).join(' | ')} |`).join('\n');
  return result + `${headerRow}\n${separatorRow}\n${dataRows}`;
}

/**
 * Convert table to TSV string for copying to spreadsheet (Excel/Google Sheets)
 * Optionally prepends the PO Header information table
 */
export function tableToTSV(table: ExtractedTable, poInfo?: POInfoData): string {
  const normalizedTable = normalizeTableWithOdpOtb(table);
  let result = '';

  if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
    result += `PURCHASE ORDER\tPlace/Date\tSUBJECT\n`;
    result += `${poInfo.poNumber || '-'}\t${poInfo.placeDate || '-'}\t${poInfo.subject || '-'}\n\n`;
  }

  const headerRow = normalizedTable.headers.join('\t');
  const dataRows = normalizedTable.rows.map(row => row.map(cell => String(cell ?? '')).join('\t')).join('\n');
  return result + `${headerRow}\n${dataRows}`;
}

/**
 * Convert PO Info table alone to TSV
 */
export function poInfoToTSV(poInfo: POInfoData): string {
  return `PURCHASE ORDER\tPlace/Date\tSUBJECT\n${poInfo.poNumber || '-'}\t${poInfo.placeDate || '-'}\t${poInfo.subject || '-'}`;
}

/**
 * Convert table to JSON string
 */
export function tableToJSON(table: ExtractedTable, poInfo?: POInfoData): string {
  const normalizedTable = normalizeTableWithOdpOtb(table);
  const objects = normalizedTable.rows.map(row => {
    const obj: Record<string, any> = {};
    normalizedTable.headers.forEach((header, idx) => {
      obj[header || `col_${idx + 1}`] = row[idx] ?? '';
    });
    return obj;
  });

  if (poInfo && (poInfo.poNumber || poInfo.placeDate || poInfo.subject)) {
    return JSON.stringify({
      poInfo: {
        purchaseOrder: poInfo.poNumber,
        placeDate: poInfo.placeDate,
        subject: poInfo.subject,
      },
      table: {
        title: normalizedTable.title,
        headers: normalizedTable.headers,
        rows: objects,
      }
    }, null, 2);
  }

  return JSON.stringify(objects, null, 2);
}

/**
 * Export full document extraction as Markdown
 */
export function exportExtractionToMarkdown(data: ExtractionResult) {
  let md = `# ${data.documentTitle || 'Ekstraksi Dokumen PDF'}\n\n`;
  md += `*File: ${data.fileName} | Diekstrak: ${new Date(data.extractedAt).toLocaleString('id-ID')} | Tingkat Keyakinan: ${data.confidence}%*\n\n`;
  md += `## Ringkasan Eksekutif\n\n${data.overviewSummary}\n\n`;

  if (data.keyValuePairs && data.keyValuePairs.length > 0) {
    md += `## Poin Kunci & Metadata\n\n`;
    data.keyValuePairs.forEach(kv => {
      md += `- **${kv.key}**: ${kv.value}\n`;
    });
    md += `\n`;
  }

  if (data.tables && data.tables.length > 0) {
    md += `## Tabel yang Diekstrak (${data.tables.length})\n\n`;
    data.tables.forEach((tbl, idx) => {
      md += `### ${idx + 1}. ${tbl.title || `Tabel ${idx + 1}`}\n`;
      if (tbl.summary) md += `*${tbl.summary}*\n\n`;
      md += `${tableToMarkdown(tbl)}\n\n`;
    });
  }

  if (data.sections && data.sections.length > 0) {
    md += `## Teks dan Bagian Dokumen\n\n`;
    data.sections.forEach(sec => {
      const headingPrefix = '#'.repeat(Math.min(sec.level + 2, 5));
      md += `${headingPrefix} ${sec.title}\n\n${sec.content}\n\n`;
    });
  } else if (data.rawText) {
    md += `## Isi Teks Lengkap\n\n${data.rawText}\n\n`;
  }

  const safeFileName = (data.fileName || 'dokumen').replace(/\.pdf$/i, '');
  downloadBlob(md, `${safeFileName}_ekstraksi.md`, 'text/markdown;charset=utf-8;');
}

/**
 * Export full document extraction as JSON
 */
export function exportExtractionToJSON(data: ExtractionResult) {
  const jsonStr = JSON.stringify(data, null, 2);
  const safeFileName = (data.fileName || 'dokumen').replace(/\.pdf$/i, '');
  downloadBlob(jsonStr, `${safeFileName}_ekstraksi.json`, 'application/json;charset=utf-8;');
}

/**
 * Export raw text as TXT
 */
export function exportRawText(text: string, fileName: string = 'ekstraksi_teks') {
  downloadBlob(text, `${fileName}.txt`, 'text/plain;charset=utf-8;');
}

/**
 * Helper to download Blob
 */
function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
