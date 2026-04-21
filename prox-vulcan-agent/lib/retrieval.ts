import fs from "fs";
import path from "path";

export type Chunk = {
  id: string;
  source: string;
  page: number;
  text: string;
};

let cachedChunks: Chunk[] | null = null;

function loadChunks(): Chunk[] {
  if (cachedChunks) return cachedChunks;

  const filePath = path.join(process.cwd(), "data", "all-chunks.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedChunks = JSON.parse(raw) as Chunk[];
  return cachedChunks;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

function scoreChunk(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);

  const words = q.split(/\s+/).filter(Boolean);
  let score = 0;

  for (const word of words) {
    if (t.includes(word)) score += 1;
  }

  if (t.includes(q)) score += 5;

  return score;
}

export function retrieveManualContext(query: string, limit = 5): Chunk[] {
  const chunks = loadChunks();

  return chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(query, chunk.text),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}