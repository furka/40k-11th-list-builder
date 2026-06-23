import { readFile } from "node:fs/promises";

async function main() {
  const pdfBuf = await readFile(".cache/faction-packs/necrons.pdf");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  const data = new Uint8Array(pdfBuf.buffer ?? pdfBuf, pdfBuf.byteOffset ?? 0, pdfBuf.byteLength ?? pdfBuf.length);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  let found = 0;
  for (let i = 13; i <= 25 && found < 3; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => it.str)
      .join(" ");
    
    if (text.includes("KEYWORDS") && text.includes("FACTION KEYWORDS")) {
      console.log(`\n========== PAGE ${i} ==========`);
      console.log(text);
      found++;
    }
  }
}

main().catch(console.error);
