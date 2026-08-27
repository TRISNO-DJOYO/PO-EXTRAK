import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { ExtractionMode } from '../types';

interface UploadSectionProps {
  onExtract: (fileData: { base64: string; name: string; size: string }, mode: ExtractionMode, customPrompt: string) => void;
  isLoading: boolean;
  loadingStep: string;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onExtract,
  isLoading,
  loadingStep,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    file: File | null;
    base64: string;
    name: string;
    size: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const handleFile = (file: File) => {
    setErrorMessage(null);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Format file harus berupa PDF (.pdf).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 25 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSelectedFile({
        file,
        base64,
        name: file.name,
        size: formatFileSize(file.size),
      });
    };
    reader.onerror = () => {
      setErrorMessage('Gagal membaca file PDF.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartExtraction = () => {
    if (!selectedFile) return;
    onExtract(
      {
        base64: selectedFile.base64,
        name: selectedFile.name,
        size: selectedFile.size,
      },
      'text',
      ''
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Main Upload Box with Bold Border & Shadow */}
      <div className="bg-white border-4 border-black neo-shadow-lg overflow-hidden">
        <div className="p-6 sm:p-8 space-y-8">
          {/* Drag & Drop Area */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
                Unggah Dokumen PDF
              </h2>
              <span className="text-[10px] font-mono font-bold uppercase text-gray-400">MAX_SIZE: 25MB</span>
            </div>

            <div
              id="pdf-dropzone"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-4 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 ${
                dragActive
                  ? 'border-black bg-blue-50'
                  : selectedFile
                  ? 'border-black bg-gray-50'
                  : 'border-black hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              {selectedFile ? (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-14 h-14 bg-black text-white flex items-center justify-center border-2 border-black neo-shadow-sm">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-black text-black text-lg tracking-tight uppercase">{selectedFile.name}</h3>
                    <p className="text-xs font-mono font-bold text-gray-600 mt-1 uppercase">
                      UKURAN: {selectedFile.size} • STATUS: SIAP DIEKSTRAK
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-xs font-black text-black hover:text-red-600 uppercase underline tracking-wider mt-1"
                  >
                    [Ganti File Dokumen]
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-14 h-14 bg-black text-white flex items-center justify-center border-2 border-black neo-shadow-sm">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-black text-black uppercase tracking-tight">
                      TARIK & LEPAS DOKUMEN PO TBG KE SINI ATAU <span className="underline decoration-2 hover:text-blue-600">PILIH FILE</span>
                    </p>
                    <p className="text-xs font-medium text-gray-600 max-w-md mx-auto">
                      Hanya Mendukung PO TBG (Format PDF)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-center space-x-3 p-4 bg-red-100 border-2 border-black text-black text-xs font-bold neo-shadow-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Start Button & Progress */}
          <div className="pt-2">
            {isLoading ? (
              <div className="p-6 bg-black text-white border-2 border-black space-y-4 neo-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-mono font-black uppercase tracking-wider">
                      {loadingStep || 'PROCESSING DOCUMENT THROUGH OCR PIPELINE...'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-yellow-400 animate-pulse">RUNNING...</span>
                </div>
                <div className="w-full bg-gray-800 h-2 border border-white overflow-hidden">
                  <div className="bg-white h-full w-2/3 animate-pulse"></div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                id="btn-process-extraction"
                disabled={!selectedFile}
                onClick={handleStartExtraction}
                className={`w-full py-5 px-6 font-black text-xl uppercase tracking-tighter transition-all flex items-center justify-center space-x-3 ${
                  selectedFile
                    ? 'bg-black text-white hover:bg-blue-600 border-2 border-black neo-shadow cursor-pointer active:translate-x-1 active:translate-y-1'
                    : 'bg-gray-200 text-gray-500 border-2 border-gray-300 cursor-not-allowed'
                }`}
              >
                <FileSpreadsheet className="w-6 h-6" />
                <span>PROCESS DOCUMENT ALL PAGES</span>
                <ArrowRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
