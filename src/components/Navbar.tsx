import React from 'react';
import { RefreshCw, Copy, Check, FileSpreadsheet } from 'lucide-react';

interface NavbarProps {
  onReset: () => void;
  hasExtractedData: boolean;
  tableCount: number;
  onCopyCombined?: () => void;
  copiedCombined?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onReset,
  hasExtractedData,
  tableCount,
  onCopyCombined,
  copiedCombined,
}) => {
  return (
    <header className="bg-white border-b-4 border-black sticky top-0 z-40 text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand */}
          <div className="flex items-center space-x-4">
            <div
              id="app-header-logo"
              className="w-11 h-11 bg-black text-yellow-300 flex items-center justify-center border-2 border-black neo-shadow-sm transition-transform hover:scale-105"
              title="PO TBG Extractor - PDF to Spreadsheet AI"
            >
              <FileSpreadsheet className="w-6 h-6 text-yellow-300" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <span className="font-black text-2xl tracking-tighter uppercase text-black">
                  TRISNO_DJOYO
                </span>
              </div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden sm:block">
                Hanya Mendukung PO TBG
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-3">
            {hasExtractedData && (
              <div className="flex items-center space-x-2 sm:space-x-3">
                {onCopyCombined && (
                  <button
                    id="btn-copy-combined-nav"
                    onClick={onCopyCombined}
                    title="Sekali klik: Salin Tabel Informasi PO + Tabel Item Pekerjaan untuk Excel / Spreadsheet"
                    className="flex items-center space-x-2 px-3.5 sm:px-4 py-2 text-xs font-black uppercase tracking-wider bg-yellow-300 hover:bg-yellow-400 text-black border-2 border-black neo-shadow-sm transition-all cursor-pointer"
                  >
                    {copiedCombined ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>COPIED!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>COPY</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  id="btn-upload-new"
                  onClick={onReset}
                  className="flex items-center space-x-2 px-3.5 sm:px-4 py-2 text-xs font-black uppercase tracking-wider bg-white hover:bg-black hover:text-white text-black border-2 border-black neo-shadow-sm transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>UNGGAH PO BARU</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

