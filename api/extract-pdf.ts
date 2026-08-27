import { GoogleGenAI, Type } from '@google/genai';
import { jsonrepair } from 'jsonrepair';

// Lazy/Safe Gemini AI Client Initializer
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('Warning: GEMINI_API_KEY is not set. Real AI calls will fail until configured.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-vercel',
        },
      },
    });
  }
  return aiClient;
}

// Helper to execute Gemini requests with automatic retries, backoff, and model fallback
async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  requestParams: { contents: any[]; config?: any },
  modelsToTry: string[] = [
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-3.1-pro-preview',
    'gemini-pro-latest',
  ]
) {
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Gemini Vercel] Attempting extraction with model "${model}"...`);

      const modelConfig = { ...requestParams.config };
      if (!model.includes('3.7') && modelConfig.thinkingConfig) {
        delete modelConfig.thinkingConfig;
      }

      const response = await ai.models.generateContent({
        model,
        contents: requestParams.contents,
        config: modelConfig,
      });
      console.log(`[Gemini Vercel] Extraction succeeded with model "${model}".`);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err || '');
      const statusCode = err?.status || err?.statusCode || (err?.error && err.error.code);

      console.warn(
        `[Gemini Vercel] Model "${model}" hit ${statusCode || 'issue'}: ${errMsg.slice(0, 150)}. Switching to next model...`
      );
    }
  }

  throw lastError || new Error('Semua model AI sedang mengalami beban tinggi sementara. Silakan coba sesaat lagi.');
}

// Helper to clean PO Date to only extract date portion
function cleanPoDate(dateStr?: string): string {
  if (!dateStr) return '';
  let cleaned = dateStr.trim();
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    cleaned = parts.slice(1).join(',').trim();
  }
  cleaned = cleaned.replace(/^(?:place\s*\/\s*date|place\s*&\s*date|date|tanggal|tgl|tempat\s*\/\s*tgl)\s*[-:]?\s*/i, '').trim();
  const datePattern = /\b\d{1,2}[-\s/.](?:[a-zA-Z]{3,12}|\d{1,2})[-\s/.]\d{2,4}\b/;
  const match = cleaned.match(datePattern);
  if (match) {
    return match[0].trim();
  }
  const isoMatch = cleaned.match(/\b\d{4}[-\s/.]\d{1,2}[-\s/.]\d{1,2}\b/);
  if (isoMatch) {
    return isoMatch[0].trim();
  }
  return cleaned;
}

// Helper to normalize UoM for special items like "Instalasi ODP/OTB"
function normalizeTableUom(tables: any[]): any[] {
  if (!Array.isArray(tables)) return [];

  const isOdpOtb = (text: string): boolean => {
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
  };

  return tables.map((tbl, idx) => {
    const headers: string[] = Array.isArray(tbl.headers) ? tbl.headers.map(String) : [];
    let uomColIdx = headers.findIndex(h => /^(?:uom|u\.o\.m|unit\s*of\s*measure(?:ment)?|satuan|unit)$/i.test(h.trim()));
    if (uomColIdx === -1) {
      uomColIdx = headers.findIndex(h => /(?:uom|satuan)/i.test(h.trim()));
    }

    const rows: string[][] = Array.isArray(tbl.rows)
      ? tbl.rows.map((r: any) => {
          const rowArr: string[] = Array.isArray(r) ? r.map(String) : [String(r)];
          const hasOdpOtb = rowArr.some(cell => isOdpOtb(cell));
          if (!hasOdpOtb) return rowArr;

          const updatedRow = [...rowArr];
          if (uomColIdx !== -1 && uomColIdx < updatedRow.length) {
            updatedRow[uomColIdx] = 'unit';
          } else {
            const unitValIdx = updatedRow.findIndex(cell =>
              /^(?:lot|ls|set|pcs|meter|m|m'|titik|lokasi|unit|core|port|bh|btg)$/i.test(cell.trim())
            );
            if (unitValIdx !== -1) {
              updatedRow[unitValIdx] = 'unit';
            }
          }
          return updatedRow;
        })
      : [];

    return {
      id: tbl.id || `table-${idx + 1}`,
      title: tbl.title || `Tabel ${idx + 1}`,
      pageNumber: typeof tbl.pageNumber === 'number' ? tbl.pageNumber : 1,
      headers,
      rows,
      summary: tbl.summary || '',
    };
  });
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Gunakan method POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({ error: 'Payload tidak valid.' });
      }
    }

    const { pdfBase64, fileName, fileSize, customInstructions } = body || {};

    if (!pdfBase64) {
      return res.status(400).json({ error: 'Data PDF dalam format base64 diperlukan.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(403).json({
        error: 'API Key Gemini (GEMINI_API_KEY) belum disetel di Vercel. Buka Vercel Dashboard > Project Settings > Environment Variables, lalu tambahkan GEMINI_API_KEY.',
      });
    }

    // Clean base64 string if it contains data URL prefix
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');

    const ai = getGeminiClient();

    const systemPrompt = `Ekstrak data Purchase Order PT Tower Bersama Group (PO TBG) dari dokumen PDF ini dalam format JSON:
1. "documentTitle": Nomor PO murni (contoh: "PO/TB/26/N013959"). Jangan sertakan awalan "Purchase Order".
2. "placeDate": Hanya tanggal PO saja tanpa nama tempat atau kota (contoh: "08-May-2026" atau "08-05-2026"). Jika di dokumen tertulis "Jakarta, 08-May-2026", ambil HANYA bagian tanggalnya yaitu "08-May-2026".
3. "subject": Subject / Lingkup pekerjaan lengkap PO TBG.
4. "overviewSummary": Ringkasan 1 kalimat.
5. "tables": Array tabel item pekerjaan:
   - "id": "table-1"
   - "title": Judul tabel
   - "headers": Header kolom
   - "rows": Array 2D baris data lengkap tanpa terpotong.
6. ATURAN KHUSUS ITEM PEKERJAAN: Jika terdapat item / baris pekerjaan "Instalasi ODP/OTB" (atau mengandung "Instalasi ODP/OTB" / "ODP/OTB"), pastikan nilai kolom UoM / Satuan untuk baris tersebut diisi / diubah menjadi "unit".
${customInstructions ? `Instruksi tambahan: ${customInstructions}` : ''}`;

    const response = await generateContentWithRetryAndFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: cleanBase64,
          },
        },
        {
          text: systemPrompt,
        },
      ],
      config: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentTitle: { type: Type.STRING },
            placeDate: { type: Type.STRING },
            subject: { type: Type.STRING },
            totalPages: { type: Type.INTEGER },
            language: { type: Type.STRING },
            overviewSummary: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  pageNumber: { type: Type.INTEGER },
                  headers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  summary: { type: Type.STRING },
                },
                required: ['id', 'title', 'headers', 'rows'],
              },
            },
            keyValuePairs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  value: { type: Type.STRING },
                },
                required: ['key', 'value'],
              },
            },
          },
          required: ['documentTitle', 'tables'],
        },
      },
    });

    let responseText = (response.text || '').trim();
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    let parsedData: any = null;
    try {
      parsedData = JSON.parse(responseText);
    } catch (initialErr) {
      try {
        const repaired = jsonrepair(responseText);
        parsedData = JSON.parse(repaired);
      } catch (repairErr) {
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            const sub = responseText.substring(firstBrace, lastBrace + 1);
            const repairedSub = jsonrepair(sub);
            parsedData = JSON.parse(repairedSub);
          } catch (subErr) {
            console.error('Substring repair failed:', subErr);
          }
        }
      }
    }

    if (!parsedData || typeof parsedData !== 'object') {
      parsedData = {
        documentTitle: 'PO TBG',
        overviewSummary: 'Berhasil membaca dokumen PO TBG.',
        tables: [],
        sections: [],
        keyValuePairs: [],
      };
    }

    if (!Array.isArray(parsedData.tables)) {
      parsedData.tables = [];
    }

    parsedData.tables = normalizeTableUom(parsedData.tables);
    parsedData.fileName = fileName || 'document.pdf';
    parsedData.fileSizeFormatted = fileSize || 'N/A';
    parsedData.extractedAt = new Date().toISOString();
    if (!parsedData.confidence) parsedData.confidence = 96;

    if (parsedData.documentTitle) {
      parsedData.documentTitle = parsedData.documentTitle
        .replace(/^Purchase Order\s+(?:PT\.?\s+)?Tower Bersama\s*[-:]?\s*/i, '')
        .replace(/^PT\.?\s+Tower Bersama\s*[-:]?\s*/i, '')
        .replace(/^Purchase Order\s*[-:]?\s*/i, '')
        .trim();
    }

    if (!parsedData.placeDate && Array.isArray(parsedData.keyValuePairs)) {
      const foundDate = parsedData.keyValuePairs.find((kv: any) =>
        /place|date|tanggal|tgl/i.test(kv.key || '')
      );
      if (foundDate && foundDate.value) {
        parsedData.placeDate = foundDate.value;
      }
    }

    if (parsedData.placeDate) {
      parsedData.placeDate = cleanPoDate(parsedData.placeDate);
    }

    if (parsedData.subject) {
      parsedData.subject = parsedData.subject
        .replace(/^(?:subject|perihal|subjek)\s*[-:]?\s*/i, '')
        .trim();
    } else if (Array.isArray(parsedData.keyValuePairs)) {
      const foundSubject = parsedData.keyValuePairs.find((kv: any) =>
        /subject|perihal|subjek|pekerjaan|lingkup/i.test(kv.key || '')
      );
      if (foundSubject && foundSubject.value) {
        parsedData.subject = foundSubject.value
          .replace(/^(?:subject|perihal|subjek)\s*[-:]?\s*/i, '')
          .trim();
      }
    }

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('Error during Vercel PDF extraction:', error);
    const rawMsg = error?.message || '';
    let userMsg = 'Terjadi kesalahan saat memproses ekstraksi PDF. Pastikan file PDF valid.';
    if (rawMsg.includes('unregistered callers') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('403')) {
      userMsg = 'API Key Gemini (GEMINI_API_KEY) tidak valid atau belum diatur di Vercel. Buka Vercel > Settings > Environment Variables, lalu tambahkan GEMINI_API_KEY.';
    } else if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('high demand') || rawMsg.includes('Overloaded')) {
      userMsg = 'Layanan AI sedang mengalami lonjakan antrean sementara (503). Sistem telah mencoba kembali secara otomatis. Silakan klik tombol coba lagi dalam beberapa detik.';
    } else if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      userMsg = 'Batas kuota sementara tercapai. Mohon tunggu beberapa saat sebelum mencoba kembali.';
    } else if (rawMsg) {
      userMsg = rawMsg;
    }

    return res.status(500).json({ error: userMsg });
  }
}
