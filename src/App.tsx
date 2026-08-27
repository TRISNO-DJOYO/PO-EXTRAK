import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { UploadSection } from './components/UploadSection';
import { TableViewer } from './components/TableViewer';
import { ExtractionResult, ExtractionMode, ExtractedTable } from './types';
import { tableToTSV, cleanPoTitle, cleanPoDate, normalizeTableWithOdpOtb } from './utils/exportUtils';
import { AlertCircle } from 'lucide-react';

export default function App() {
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [activeTableIndex, setActiveTableIndex] = useState(0);
  const [copiedCombined, setCopiedCombined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<{
    fileData: { base64: string; name: string; size: string };
    mode: ExtractionMode;
    customPrompt: string;
  } | null>(null);

  const handleCopyCombined = async () => {
    if (!extractionResult || !extractionResult.tables || extractionResult.tables.length === 0) return;
    const currentTable = extractionResult.tables[activeTableIndex] || extractionResult.tables[0];
    const poInfoObj = {
      poNumber: cleanPoTitle(extractionResult.documentTitle),
      placeDate: cleanPoDate(extractionResult.placeDate),
      subject: extractionResult.subject || '(contoh:Pekerjaan Jasa & Instalasi  - MMP (Fiberization) SMART8 Project Regional BALINUSRA site BULELENG SERIRIT - (NON LOGISTICS))',
    };
    const text = tableToTSV(currentTable, poInfoObj);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCombined(true);
      setTimeout(() => setCopiedCombined(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleExtract = async (
    fileData: { base64: string; name: string; size: string },
    mode: ExtractionMode,
    customPrompt: string
  ) => {
    setLastRequest({ fileData, mode, customPrompt });
    setIsLoading(true);
    setErrorMessage(null);
    setActiveTableIndex(0);
    setLoadingStep('Mengirim file PDF PO TBG ke mesin analisis AI...');

    // Progress simulation steps
    const stepTimer1 = setTimeout(() => {
      setLoadingStep('Mendeteksi struktur tabel PO TBG & detail item pekerjaan...');
    }, 1500);

    const stepTimer2 = setTimeout(() => {
      setLoadingStep('Mengekstrak baris BOQ, harga, PPN, dan termin pembayaran...');
    }, 3500);

    const stepTimer3 = setTimeout(() => {
      setLoadingStep('Memformat tabel Excel dan data terstruktur...');
    }, 6000);

    try {
      const response = await fetch('/api/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: fileData.base64,
          fileName: fileData.name,
          fileSize: fileData.size,
          mode: 'tables',
          customInstructions: customPrompt,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error: ${response.statusText}`);
      }

      const data: ExtractionResult = await response.json();
      if (data && Array.isArray(data.tables)) {
        data.tables = data.tables.map(normalizeTableWithOdpOtb);
      }
      setExtractionResult(data);
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(err.message || 'Gagal mengekstrak dokumen PO TBG. Pastikan file PDF valid.');
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleUpdateTable = (tableId: string, updatedTable: ExtractedTable) => {
    if (!extractionResult) return;
    const newTables = extractionResult.tables.map(t => (t.id === tableId ? updatedTable : t));
    const updated = { ...extractionResult, tables: newTables };
    setExtractionResult(updated);
  };

  const handleReset = () => {
    setExtractionResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans">
      <Navbar
        onReset={handleReset}
        hasExtractedData={!!extractionResult}
        tableCount={extractionResult?.tables?.length || 0}
        onCopyCombined={handleCopyCombined}
        copiedCombined={copiedCombined}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Error notification */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border-4 border-black text-black text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 neo-shadow">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black uppercase tracking-tight text-red-900">EXTRACTION_STATUS / INFO</h4>
                <p className="mt-0.5 font-medium">{errorMessage}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
              {lastRequest && !isLoading && (
                <button
                  onClick={() => handleExtract(lastRequest.fileData, lastRequest.mode, lastRequest.customPrompt)}
                  className="px-3 py-1.5 bg-black text-white font-black text-xs uppercase tracking-wider hover:bg-red-600 transition cursor-pointer"
                >
                  COBA LAGI (RETRY)
                </button>
              )}
              <button
                onClick={() => setErrorMessage(null)}
                className="px-3 py-1.5 border-2 border-black font-black uppercase text-xs hover:bg-gray-100 cursor-pointer"
              >
                TUTUP
              </button>
            </div>
          </div>
        )}

        {!extractionResult ? (
          <UploadSection
            onExtract={handleExtract}
            isLoading={isLoading}
            loadingStep={loadingStep}
          />
        ) : (
          <TableViewer
            tables={extractionResult.tables || []}
            documentTitle={extractionResult.documentTitle}
            placeDate={extractionResult.placeDate}
            subject={extractionResult.subject}
            activeTableIndex={activeTableIndex}
            onActiveTableChange={setActiveTableIndex}
            onUpdateTable={handleUpdateTable}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-black bg-white py-6 text-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <span className="font-black uppercase tracking-wider">PO TBG TABLE EXTRACTION SYSTEM</span>
          <span className="font-bold text-gray-600 uppercase">HANYA MENDUKUNG PO TBG // FORMAT: XLSX • CSV • TSV • JSON</span>
        </div>
      </footer>
    </div>
  );
}

