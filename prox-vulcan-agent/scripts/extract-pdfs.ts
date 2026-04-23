import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import {
  buildRetrievalIndex,
  normalizeForDisplay,
  type PageChunk,
} from "../lib/retrieval-data";

const INPUT_DIR = path.join(process.cwd(), "files");
const OUTPUT_DIR = path.join(process.cwd(), "data");

const PDF_FILES = [
  "owner-manual.pdf",
  "quick-start-guide.pdf",
  "selection-chart.pdf",
];

function normalizeText(text: string): string {
  return normalizeForDisplay(text);
}

async function extractPdfByPage(filePath: string, fileName: string): Promise<PageChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();

    return result.pages.map((page) => ({
      id: `${fileName.replace(".pdf", "")}-p${page.num}`,
      source: fileName,
      page: page.num,
      text: normalizeText(page.text),
    }));
  } finally {
    await parser.destroy();
  }
}

async function main() {
  if (!fs.existsSync(INPUT_DIR)) {
    throw new Error(`Input directory not found: ${INPUT_DIR}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allChunks: PageChunk[] = [];

  for (const fileName of PDF_FILES) {
    const filePath = path.join(INPUT_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing file: ${fileName}`);
      continue;
    }

    console.log(`Extracting ${fileName}...`);
    const chunks = await extractPdfByPage(filePath, fileName);

    const outPath = path.join(
      OUTPUT_DIR,
      `${fileName.replace(".pdf", "")}.json`
    );

    fs.writeFileSync(outPath, JSON.stringify(chunks, null, 2), "utf-8");
    allChunks.push(...chunks);

    console.log(`Saved ${outPath}`);
  }

  const combinedPath = path.join(OUTPUT_DIR, "all-chunks.json");
  fs.writeFileSync(combinedPath, JSON.stringify(allChunks, null, 2), "utf-8");

  console.log(`Saved combined output to ${combinedPath}`);

  const retrievalIndex = buildRetrievalIndex(allChunks);
  const retrievalPath = path.join(OUTPUT_DIR, "retrieval-index-v1.json");

  fs.writeFileSync(
    retrievalPath,
    JSON.stringify(retrievalIndex, null, 2),
    "utf-8"
  );

  console.log(`Saved retrieval index to ${retrievalPath}`);
}

main().catch((error) => {
  console.error("Extraction failed:", error);
  process.exit(1);
});
