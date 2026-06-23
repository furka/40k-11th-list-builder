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

    const examples = [];
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => it.str)
        .join(" ");
      
      if (text.includes("KEYWORDS") && text.includes("FACTION KEYWORDS")) {
        // Extract title and keywords section
        const lines = text.split(/(?=KEYWORDS)/);
        for (const chunk of lines) {
          if (chunk.includes("KEYWORDS") && chunk.includes("FACTION KEYWORDS")) {
            const start = chunk.indexOf("KEYWORDS");
            const end = Math.min(chunk.length, start + 500);
            const sample = chunk.substring(Math.max(0, start - 300), end);
            if (sample.length > 100) {
              examples.push(sample);
            }
          }
        }
        
        if (examples.length >= 3) break;
      }
    }
    
    for (let j = 0; j < examples.length; j++) {
      console.log(`\n=== EXAMPLE ${j + 1} ===`);
      console.log(examples[j]);
      console.log("\n---");
    }
  } catch (e) {
    console.error(e.message);
  }
}

main();
