// Membaca teks dari file PDF di browser memakai pdf.js (Mozilla).
// Library-nya cukup besar, jadi baru diunduh dari CDN saat pengguna memilih PDF pertama kali.

const PDFJS_VERSION = '4.10.38';
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    // webpackIgnore: biarkan browser yang meng-import URL ini, bukan bundler Next.js.
    pdfjsPromise = import(/* webpackIgnore: true */ PDFJS_URL)
      .then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjsLib;
      })
      .catch((error) => {
        pdfjsPromise = null; // supaya bisa dicoba lagi setelah internet kembali
        throw error;
      });
  }
  return pdfjsPromise;
}

export async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = pdf.numPages;
  const pageTexts = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      // hasEOL menandai akhir baris di PDF, jadi baris asli tetap terjaga.
      const text = content.items.map((item) => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('');
      pageTexts.push(text.trim());
    }
  } finally {
    await pdf.destroy();
  }

  const text = pageTexts.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  return { pages: pageCount, text };
}
