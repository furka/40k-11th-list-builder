import { readFile } from "node:fs/promises";

async function main() {
  try {
    const pdfBuf = await readFile(".cache/faction-packs/necrons.pdf");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    
    const data = new Uint8Array(pdfBuf.buffer ?? pdfBuf, pdfBuf.byteOffset ?? 0, pdfBuf.byteLength ?? pdfBuf.length);
    const doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    console.log(`Searching ${doc.numPages} pages for KEYWORDS pattern...`);
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => it.str)
        .join(" ");
      
      if (text.includes("KEYWORDS")) {
        console.log(`\n=== PAGE ${i} ===`);
        const idx = text.indexOf("KEYWORDS");
        const start = Math.max(0, idx - 500);
        const end = Math.min(text.length, idx + 800);
        console.log(text.substring(start, end));
        console.log("\n---");
        
        if (i > 20) break; // Stop after first match on page 20+
      }
    }
  } catch (e) {
    console.error(e.message);
  }
}

main();
