import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const pdfPath = resolve(".", ".cache/faction-packs/necrons.pdf");
  const pdfBuf = await readFile(pdfPath);
  
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
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

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => it.str)
      .join(" ");
    pages.push(text);
  }

  // Find pages mentioning NECRON WARRIORS and KEYWORDS
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.includes("NECRON WARRIORS") && p.includes("KEYWORDS")) {
      console.log(`\n=== PAGE ${i + 1} (NECRON WARRIORS) ===`);
      const idx = p.indexOf("NECRON WARRIORS");
      const start = Math.max(0, idx - 300);
      const end = Math.min(p.length, idx + 1200);
      console.log(p.substring(start, end));
      console.log("\n");
      break;
    }
  }

  // Also find IMMORTALS datasheet
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.includes("IMMORTALS") && p.includes("KEYWORDS") && !p.includes("NECRON WARRIORS")) {
      console.log(`\n=== PAGE ${i + 1} (IMMORTALS) ===`);
      const idx = p.indexOf("IMMORTALS");
      const start = Math.max(0, idx - 200);
      const end = Math.min(p.length, idx + 1000);
      console.log(p.substring(start, end));
      console.log("\n");
      break;
    }
  }

  // Find a vehicle example
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if ((p.includes("DOOMSTALKER") || p.includes("CATACOMB COMMAND BARGE")) && p.includes("KEYWORDS")) {
      console.log(`\n=== PAGE ${i + 1} (VEHICLE) ===`);
      const idx = Math.max(p.indexOf("DOOMSTALKER"), p.indexOf("CATACOMB COMMAND BARGE"));
      const start = Math.max(0, idx - 200);
      const end = Math.min(p.length, idx + 1000);
      console.log(p.substring(start, end));
      console.log("\n");
      break;
    }
  }
}

main().catch(console.error);
