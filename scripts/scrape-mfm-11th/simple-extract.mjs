import { readFile } from "node:fs/promises";

async function main() {
  try {
    const pdfPath = ".cache/faction-packs/necrons.pdf";
    const pdfBuf = await readFile(pdfPath);
    console.log("PDF loaded, size:", pdfBuf.length);
    
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    console.log("pdfjs imported");
    
    const data = new Uint8Array(
      pdfBuf.buffer ?? pdfBuf,
      pdfBuf.byteOffset ?? 0,
      pdfBuf.byteLength ?? pdfBuf.length
    );
    const doc = await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    console.log("PDF pages:", doc.numPages);
    
    let foundCount = 0;
    for (let i = 1; i <= Math.min(doc.numPages, 150); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .filter((it) => it.str && it.str.trim())
        .map((it) => it.str)
        .join(" ");
      
      if (text.includes("NECRON WARRIORS") && text.includes("KEYWORDS")) {
        console.log(`\n=== PAGE ${i} (NECRON WARRIORS) ===`);
        const idx = text.indexOf("NECRON WARRIORS");
        const start = Math.max(0, idx - 300);
        const end = Math.min(text.length, idx + 1500);
        console.log(text.substring(start, end));
        foundCount++;
        break;
      }
    }
    
    if (foundCount === 0) {
      console.log("\nNot found on first 150 pages, checking further...");
      for (let i = 150; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items
          .filter((it) => it.str && it.str.trim())
          .map((it) => it.str)
          .join(" ");
        
        if (text.includes("NECRON WARRIORS")) {
          console.log(`Found NECRON WARRIORS on page ${i}`);
          console.log(text.substring(0, 500));
          break;
        }
      }
    }
  } catch (e) {
    console.error(e.message);
    console.error(e.stack);
  }
}

main();
