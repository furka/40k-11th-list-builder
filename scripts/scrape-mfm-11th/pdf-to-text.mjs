// Flatten a Faction Pack PDF to plain text — one string per page, joined with
// form-feed (\f) as a soft page boundary. Replaces the layout-anchored state
// machine from the prior iteration: no fontSize ranges, no column splitting,
// no header detection. Just the raw text in reading order.
//
// pdfjs items come pre-ordered roughly top-to-bottom within a page; joining
// with spaces is close enough for the downstream search + LLM steps. Multi-
// column pages occasionally interleave column-A line N with column-B line N,
// but the LLM tolerates that since it's reading a section it's been told the
// name of.

export async function pdfToText(pdfBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs rejects Node Buffer (a Uint8Array subclass) and demands a plain
  // Uint8Array — recopy.
  const data = new Uint8Array(
    pdfBuffer.buffer ?? pdfBuffer,
    pdfBuffer.byteOffset ?? 0,
    pdfBuffer.byteLength ?? pdfBuffer.length
  );
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => it.str)
      .join(" ");
    pageTexts.push(text);
  }
  return pageTexts.join("\n\f\n");
}
