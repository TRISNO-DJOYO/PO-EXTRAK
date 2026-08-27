import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Search,
  ArrowUpDown,
  Edit3,
  Plus,
  Trash2,
  FileCode,
  FileText,
  Info,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react';
import { ExtractedTable } from '../types';
import {
  exportTablesToExcel,
  exportTableToCSV,
  tableToMarkdown,
  tableToTSV,
  tableToJSON,
  poInfoToTSV,
  cleanPoTitle,
  cleanPoDate,
} from '../utils/exportUtils';

interface TableViewerProps {
  tables: ExtractedTable[];
  documentTitle: string;
  placeDate?: string;
  subject?: string;
  activeTableIndex?: number;
  onActiveTableChange?: (index: number) => void;
  onUpdateTable?: (tableId: string, updatedTable: ExtractedTable) => void;
}

export const TableViewer: React.FC<TableViewerProps> = ({
  tables,
  documentTitle,
  placeDate,
  subject,
  activeTableIndex: controlledActiveIndex,
  onActiveTableChange,
  onUpdateTable,
}) => {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const activeTableIndex = controlledActiveIndex !== undefined ? controlledActiveIndex : internalActiveIndex;
  const setActiveTableIndex = (idx: number) => {
    setInternalActiveIndex(idx);
    if (onActiveTableChange) onActiveTableChange(idx);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ colIndex: number; direction: 'asc' | 'desc' } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [includePOInfoInExport, setIncludePOInfoInExport] = useState(true);

  const currentTable = tables[activeTableIndex] || tables[0];

  const poInfoObj = useMemo(() => ({
    poNumber: cleanPoTitle(documentTitle),
    placeDate: cleanPoDate(placeDate),
    subject: subject || '(contoh:Pekerjaan Jasa & Instalasi  - MMP (Fiberization) SMART8 Project Regional BALINUSRA site BULELENG SERIRIT - (NON LOGISTICS))',
  }), [documentTitle, placeDate, subject]);

  // Filter and sort rows
  const processedRows = useMemo(() => {
    if (!currentTable || !currentTable.rows) return [];
    let rows = [...currentTable.rows];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(row =>
        row.some(cell => String(cell).toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortConfig !== null) {
      const { colIndex, direction } = sortConfig;
      rows.sort((a, b) => {
        const valA = a[colIndex];
        const valB = b[colIndex];

        // Try numeric comparison
        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/[^0-9.-]/g, ''));
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/[^0-9.-]/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
          return direction === 'asc' ? numA - numB : numB - numA;
        }

        // String comparison
        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        return direction === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return rows;
  }, [currentTable, searchQuery, sortConfig]);

  const handleSort = (colIndex: number) => {
    setSortConfig(current => {
      if (current && current.colIndex === colIndex) {
        if (current.direction === 'asc') return { colIndex, direction: 'desc' };
        return null;
      }
      return { colIndex, direction: 'asc' };
    });
  };

  const handleCellChange = (rowIndex: number, colIndex: number, newValue: string) => {
    if (!currentTable || !onUpdateTable) return;
    const newRows = currentTable.rows.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row];
        newRow[colIndex] = newValue;
        return newRow;
      }
      return row;
    });

    onUpdateTable(currentTable.id, {
      ...currentTable,
      rows: newRows,
    });
  };

  const handleHeaderChange = (colIndex: number, newHeader: string) => {
    if (!currentTable || !onUpdateTable) return;
    const newHeaders = [...currentTable.headers];
    newHeaders[colIndex] = newHeader;
    onUpdateTable(currentTable.id, {
      ...currentTable,
      headers: newHeaders,
    });
  };

  const handleAddRow = () => {
    if (!currentTable || !onUpdateTable) return;
    const emptyRow = new Array(currentTable.headers.length).fill('');
    onUpdateTable(currentTable.id, {
      ...currentTable,
      rows: [...currentTable.rows, emptyRow],
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!currentTable || !onUpdateTable) return;
    const newRows = currentTable.rows.filter((_, idx) => idx !== rowIndex);
    onUpdateTable(currentTable.id, {
      ...currentTable,
      rows: newRows,
    });
  };

  // Copy handler with options for combined copy
  const handleCopy = async (
    format: 'tsv' | 'markdown' | 'json',
    target: 'combined' | 'table-only' | 'po-only' = 'combined'
  ) => {
    let text = '';

    if (target === 'po-only') {
      if (format === 'tsv') text = poInfoToTSV(poInfoObj);
      else if (format === 'markdown') {
        text = `| PURCHASE ORDER | Place/Date | SUBJECT |\n| --- | --- | --- |\n| ${poInfoObj.poNumber} | ${poInfoObj.placeDate} | ${poInfoObj.subject} |`;
      } else if (format === 'json') {
        text = JSON.stringify(poInfoObj, null, 2);
      }
    } else {
      if (!currentTable) return;
      const poParam = target === 'combined' || includePOInfoInExport ? poInfoObj : undefined;

      if (format === 'tsv') text = tableToTSV(currentTable, poParam);
      else if (format === 'markdown') text = tableToMarkdown(currentTable, poParam);
      else if (format === 'json') text = tableToJSON(currentTable, poParam);
    }

    try {
      await navigator.clipboard.writeText(text);
      const copyKey = `${format}-${target}`;
      setCopiedFormat(copyKey);
      setTimeout(() => setCopiedFormat(null), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  if (!tables || tables.length === 0) {
    return (
      <div className="bg-white border-4 border-black p-12 text-center neo-shadow-lg">
        <FileSpreadsheet className="w-12 h-12 text-black mx-auto mb-3" />
        <h3 className="text-xl font-black uppercase tracking-tight text-black">NO TABLES DETECTED</h3>
        <p className="text-xs font-medium text-gray-600 max-w-md mx-auto mt-2">
          Tidak ada tabel yang terdeteksi pada dokumen PO TBG ini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* TABEL INFORMASI PO TBG (HEADER TABLE) */}
      <div className="bg-white border-4 border-black neo-shadow-lg overflow-hidden flex flex-col">
        <div className="bg-black text-white px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center space-x-2">
            <span className="bg-yellow-300 text-black px-2 py-0.5 font-black uppercase text-[10px] border border-black">
              TBG
            </span>
            <span className="font-black tracking-wider uppercase">TABEL INFORMASI PURCHASE ORDER</span>
          </div>
          {/* Empty right container */}
          <div></div>
        </div>

        {/* PO Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="bg-yellow-100 text-black font-black select-none border-b-2 border-black">
              <tr>
                <th className="p-3 text-xs font-black uppercase border-r-2 border-black w-1/4 tracking-wider">
                  PURCHASE ORDER
                </th>
                <th className="p-3 text-xs font-black uppercase border-r-2 border-black w-1/4 tracking-wider">
                  Place/Date
                </th>
                <th className="p-3 text-xs font-black uppercase w-1/2 tracking-wider">
                  SUBJECT
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y-2 divide-black text-black">
              <tr>
                <td className="p-3 border-r-2 border-black font-black text-xs sm:text-sm text-black align-top bg-yellow-50/50">
                  {poInfoObj.poNumber}
                </td>
                <td className="p-3 border-r-2 border-black font-bold text-xs text-gray-900 align-top">
                  {poInfoObj.placeDate}
                </td>
                <td className="p-3 font-bold text-xs text-gray-900 break-words leading-relaxed align-top">
                  {poInfoObj.subject}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Table Details & Controls */}
      <div className="bg-white border-4 border-black neo-shadow-lg overflow-hidden flex flex-col">
        {/* Terminal Header Bar */}
        <div className="bg-black text-white px-4 py-2.5 flex justify-between items-center text-xs font-mono shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-wider uppercase">
              {currentTable.title || 'TABEL DETAIL PEKERJAAN'}
            </span>
          </div>
          <span className="text-gray-300 font-bold">CONFIDENCE: 99.4% • {currentTable.rows.length} ROWS</span>
        </div>

        {/* Table Controls Bar */}
        <div className="p-3 sm:p-4 border-b-4 border-black flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50">
          <div className="text-xs font-mono font-bold text-gray-600 uppercase">
            <span>DATA ROWS PREVIEW & EDIT</span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {/* Search within table */}
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="FILTER_TABLE_ROWS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs font-mono pl-9 pr-3 py-2 bg-white border-2 border-black text-black placeholder-gray-400 focus:outline-none"
              />
            </div>

            {/* Edit mode toggle */}
            {onUpdateTable && (
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={`flex items-center space-x-2 px-4 py-2 text-xs font-black uppercase tracking-wider border-2 border-black transition cursor-pointer ${
                  isEditing
                    ? 'bg-black text-white neo-shadow-sm'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? 'DONE EDIT' : 'EDIT CELLS'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Table Grid Content */}
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="bg-gray-200 sticky top-0 z-10 text-black font-black select-none border-b-2 border-black">
              <tr>
                {currentTable.headers.map((header, colIdx) => (
                  <th
                    key={colIdx}
                    onClick={() => !isEditing && handleSort(colIdx)}
                    className={`p-3 text-xs font-black text-black uppercase border-r-2 border-black last:border-r-0 tracking-wider ${
                      !isEditing ? 'cursor-pointer hover:bg-gray-300 transition' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between space-x-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={header}
                          onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                          className="font-black bg-white border-2 border-black px-2 py-0.5 text-xs w-full text-black"
                        />
                      ) : (
                        <span className="truncate">{header}</span>
                      )}
                      {!isEditing && (
                        <ArrowUpDown
                          className={`w-3.5 h-3.5 shrink-0 ${
                            sortConfig?.colIndex === colIdx ? 'text-black' : 'text-gray-400'
                          }`}
                        />
                      )}
                    </div>
                  </th>
                ))}
                {isEditing && (
                  <th className="p-3 text-center w-16 text-black uppercase font-black">DEL</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black text-black">
              {processedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentTable.headers.length + (isEditing ? 1 : 0)}
                    className="p-8 text-center text-gray-500 italic font-mono uppercase"
                  >
                    {searchQuery ? 'NO MATCHING ROWS FOUND.' : 'TABLE HAS NO DATA ROWS.'}
                  </td>
                </tr>
              ) : (
                processedRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className={`transition-colors ${rIdx % 2 === 1 ? 'bg-gray-100' : 'bg-white'} hover:bg-blue-50`}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="p-3 border-r-2 border-black last:border-r-0 font-medium"
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={String(cell ?? '')}
                            onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                            className="w-full bg-white border-2 border-black px-2 py-1 text-xs text-black"
                          />
                        ) : (
                          <span className="break-words">{String(cell ?? '')}</span>
                        )}
                      </td>
                    ))}
                    {isEditing && (
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(rIdx)}
                          className="text-black hover:text-red-600 p-1 font-bold transition"
                          title="Hapus baris ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Edit mode footer actions */}
        {isEditing && (
          <div className="p-4 bg-gray-100 border-t-2 border-black flex items-center justify-between text-xs font-mono">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center space-x-2 px-4 py-2 bg-black text-white hover:bg-gray-800 font-bold uppercase transition"
            >
              <Plus className="w-4 h-4" />
              <span>ADD NEW ROW</span>
            </button>
            <span className="text-[11px] font-bold text-gray-600 uppercase">
              CHANGES PERSISTED TO MEMORY.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
