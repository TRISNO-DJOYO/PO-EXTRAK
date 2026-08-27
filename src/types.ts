export interface ExtractedCell {
  value: string | number;
  isHeader?: boolean;
}

export interface ExtractedTable {
  id: string;
  title: string;
  pageNumber?: number;
  headers: string[];
  rows: (string | number)[][];
  summary?: string;
  columnTypes?: ('text' | 'number' | 'currency' | 'date')[];
  sourceContext?: string;
}

export interface ExtractedSection {
  title: string;
  content: string;
  level: number;
  pageNumber?: number;
}

export interface KeyValuePair {
  key: string;
  value: string;
  category?: string;
}

export interface ExtractionResult {
  documentTitle: string;
  placeDate?: string;
  subject?: string;
  totalPages?: number;
  language?: string;
  overviewSummary: string;
  tables: ExtractedTable[];
  sections: ExtractedSection[];
  rawText: string;
  keyValuePairs: KeyValuePair[];
  confidence: number;
  extractedAt: string;
  fileSizeFormatted: string;
  fileName: string;
}

export type ExtractionMode = 'all' | 'tables' | 'text' | 'key_values';
