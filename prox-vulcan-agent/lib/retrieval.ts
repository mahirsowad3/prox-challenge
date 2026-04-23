import fs from "fs";
import path from "path";
import {
  buildRetrievalIndex,
  normalizeForRetrieval,
  type PageChunk,
  type RetrievalChunk,
  type RetrievalIndexFile,
} from "./retrieval-data";

type IndexedChunk = RetrievalChunk & {
  termFrequencies: Map<string, number>;
  pageKey: string;
};

type LoadedIndex = {
  avgDocumentLength: number;
  chunks: IndexedChunk[];
  components: number[][];
  idfByToken: Map<string, number>;
  vocabularyIndex: Map<string, number>;
};

type CandidateScore = {
  chunk: IndexedChunk;
  lexicalScore: number;
  semanticScore: number;
  rerankScore: number;
  finalScore: number;
};

const RETRIEVAL_INDEX_FILE = path.join(
  process.cwd(),
  "data",
  "retrieval-index-v1.json"
);
const FALLBACK_PAGES_FILE = path.join(process.cwd(), "data", "all-chunks.json");
const BM25_K1 = 1.5;
const BM25_B = 0.75;
const CANDIDATE_LIMIT = 18;
const MAX_CHUNKS_PER_PAGE = 2;
const MIN_FINAL_SCORE = 0.18;
const MIN_SEMANTIC_SCORE = 0.12;

const DOMAIN_EXPANSIONS: Record<string, string[]> = {
  porous: ["porosity"],
  porosity: ["porous"],
  gas: ["cylinder", "shielding", "shielded"],
  hookup: ["connect", "connection"],
  hook: ["connect", "connection"],
  fluxcore: ["flux", "cored", "wire"],
  "flux-cored": ["flux", "cored", "wire"],
  polarity: ["positive", "negative", "dcep", "dcen"],
  ground: ["clamp", "workpiece", "cable"],
  clamp: ["ground", "workpiece"],
  wire: ["feed", "spool"],
  feed: ["wire", "speed"],
  speed: ["feed", "wire"],
  duty: ["cycle"],
  cycle: ["duty"],
  tig: ["torch", "gas"],
  mig: ["wire", "feed"],
  stick: ["electrode"],
};

let cachedIndex: LoadedIndex | null = null;

function safeReadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function tokenize(text: string): string[] {
  return normalizeForRetrieval(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && /[a-z]/.test(token));
}

function buildTermFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  return frequencies;
}

function loadIndexFile(): RetrievalIndexFile {
  const fromDisk = safeReadJson<RetrievalIndexFile>(RETRIEVAL_INDEX_FILE);

  if (fromDisk) {
    return fromDisk;
  }

  const pageChunks = safeReadJson<PageChunk[]>(FALLBACK_PAGES_FILE) ?? [];
  return buildRetrievalIndex(pageChunks);
}

function loadIndex(): LoadedIndex {
  if (cachedIndex) {
    return cachedIndex;
  }

  const indexFile = loadIndexFile();
  const vocabularyIndex = new Map(
    indexFile.vocabulary.map((token, index) => [token, index] as const)
  );
  const idfByToken = new Map(
    indexFile.vocabulary.map((token, index) => [token, indexFile.idf[index]] as const)
  );

  const chunks = indexFile.chunks.map((chunk) => {
    const tokens = tokenize(chunk.normalizedText);

    return {
      ...chunk,
      termFrequencies: buildTermFrequency(tokens),
      pageKey: `${chunk.source}:${chunk.page}`,
    };
  });

  cachedIndex = {
    avgDocumentLength: indexFile.avgDocumentLength || 1,
    chunks,
    components: indexFile.components ?? [],
    idfByToken,
    vocabularyIndex,
  };

  return cachedIndex;
}

function buildWeightedQueryTokens(query: string): Map<string, number> {
  const normalizedQuery = normalizeForRetrieval(query);
  const baseTokens = tokenize(normalizedQuery);
  const weightedTokens = new Map<string, number>();

  for (const token of baseTokens) {
    weightedTokens.set(token, Math.max(weightedTokens.get(token) ?? 0, 1));

    for (const expansion of DOMAIN_EXPANSIONS[token] ?? []) {
      weightedTokens.set(
        expansion,
        Math.max(weightedTokens.get(expansion) ?? 0, 0.45)
      );
    }
  }

  if (normalizedQuery.includes("hook up")) {
    weightedTokens.set("connect", 0.6);
    weightedTokens.set("connection", 0.6);
  }

  if (normalizedQuery.includes("flux core")) {
    weightedTokens.set("flux", 0.8);
    weightedTokens.set("cored", 0.8);
  }

  if (normalizedQuery.includes("wire speed")) {
    weightedTokens.set("feed", 0.8);
  }

  return weightedTokens;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / Math.sqrt(leftNorm * rightNorm);
}

function computeLexicalScore(
  chunk: IndexedChunk,
  weightedQueryTokens: Map<string, number>,
  avgDocumentLength: number,
  normalizedQuery: string,
  idfByToken: Map<string, number>
): number {
  let score = 0;

  for (const [token, queryWeight] of weightedQueryTokens.entries()) {
    const frequency = chunk.termFrequencies.get(token) ?? 0;

    if (!frequency) {
      continue;
    }

    const idf = idfByToken.get(token) ?? 0;
    const denominator =
      frequency +
      BM25_K1 *
        (1 - BM25_B + BM25_B * (chunk.tokenCount / Math.max(avgDocumentLength, 1)));

    score +=
      queryWeight * idf * ((frequency * (BM25_K1 + 1)) / Math.max(denominator, 1e-6));
  }

  if (normalizedQuery && chunk.normalizedText.includes(normalizedQuery)) {
    score += 2;
  }

  for (const phrase of normalizedQuery.split(/\s+/).filter((token) => token.length > 3)) {
    if (chunk.normalizedText.includes(phrase)) {
      score += 0.08;
    }
  }

  return score;
}

function buildQueryEmbedding(
  weightedQueryTokens: Map<string, number>,
  components: number[][],
  vocabularyIndex: Map<string, number>,
  idfByToken: Map<string, number>
): number[] {
  if (components.length === 0) {
    return [];
  }

  const queryVector = Array.from({ length: components.length }, () => 0);

  for (const [token, weight] of weightedQueryTokens.entries()) {
    const index = vocabularyIndex.get(token);

    if (index === undefined) {
      continue;
    }

    const tfidf = weight * (idfByToken.get(token) ?? 0);

    for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
      queryVector[componentIndex] += tfidf * (components[componentIndex][index] ?? 0);
    }
  }

  return queryVector;
}

function inferIntentTokens(query: string): string[] {
  const normalizedQuery = normalizeForRetrieval(query);

  if (/porous|porosity|bubble|contamin/i.test(normalizedQuery)) {
    return ["porosity", "gas", "wire"];
  }

  if (/polarity|positive|negative|dcep|dcen/i.test(normalizedQuery)) {
    return ["polarity", "ground", "wire"];
  }

  if (/gas|cylinder|regulator|argon|co2/i.test(normalizedQuery)) {
    return ["gas", "cylinder", "shielded"];
  }

  if (/duty|cycle|overheat/i.test(normalizedQuery)) {
    return ["duty", "cycle", "overheat"];
  }

  if (/setup|spool|thread|load wire|wire feed/i.test(normalizedQuery)) {
    return ["wire", "feed", "spool"];
  }

  return [];
}

function rerankCandidate(
  chunk: IndexedChunk,
  query: string,
  weightedQueryTokens: Map<string, number>
): number {
  const normalizedQuery = normalizeForRetrieval(query);
  const heading = chunk.sectionTitle ? normalizeForRetrieval(chunk.sectionTitle) : "";
  let score = 0;

  if (heading) {
    for (const token of weightedQueryTokens.keys()) {
      if (heading.includes(token)) {
        score += 0.14;
      }
    }
  }

  for (const token of inferIntentTokens(query)) {
    if (chunk.normalizedText.includes(token)) {
      score += 0.08;
    }

    if (heading.includes(token)) {
      score += 0.1;
    }
  }

  if (/warning|safety/.test(chunk.normalizedText) && !/warning|safety/.test(normalizedQuery)) {
    score -= 0.2;
  }

  if (chunk.source === "selection-chart.pdf" && /setting|voltage|wire|thickness|gauge/.test(normalizedQuery)) {
    score += 0.12;
  }

  if (chunk.source === "quick-start-guide.pdf" && /setup|spool|wire|load|thread/.test(normalizedQuery)) {
    score += 0.12;
  }

  if (chunk.text.length < 180) {
    score -= 0.08;
  }

  return score;
}

function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (Math.abs(max - min) < 1e-9) {
    return values.map((value) => (value > 0 ? 1 : 0));
  }

  return values.map((value) => (value - min) / (max - min));
}

function pickCandidatePool(
  chunks: IndexedChunk[],
  avgDocumentLength: number,
  components: number[][],
  vocabularyIndex: Map<string, number>,
  idfByToken: Map<string, number>,
  query: string
): CandidateScore[] {
  const normalizedQuery = normalizeForRetrieval(query);
  const weightedQueryTokens = buildWeightedQueryTokens(query);
  const queryEmbedding = buildQueryEmbedding(
    weightedQueryTokens,
    components,
    vocabularyIndex,
    idfByToken
  );

  const scored = chunks.map((chunk) => ({
    chunk,
    lexicalScore: computeLexicalScore(
      chunk,
      weightedQueryTokens,
      avgDocumentLength,
      normalizedQuery,
      idfByToken
    ),
    semanticScore:
      queryEmbedding.length > 0 && chunk.embedding
        ? cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0,
    rerankScore: 0,
    finalScore: 0,
  }));

  const topLexical = [...scored]
    .sort((left, right) => right.lexicalScore - left.lexicalScore)
    .slice(0, CANDIDATE_LIMIT);
  const topSemantic = [...scored]
    .sort((left, right) => right.semanticScore - left.semanticScore)
    .slice(0, CANDIDATE_LIMIT);

  const byChunkId = new Map<string, CandidateScore>();

  for (const candidate of [...topLexical, ...topSemantic]) {
    byChunkId.set(candidate.chunk.id, candidate);
  }

  const candidates = [...byChunkId.values()];
  const lexicalNormalized = minMaxNormalize(
    candidates.map((candidate) => candidate.lexicalScore)
  );
  const semanticNormalized = minMaxNormalize(
    candidates.map((candidate) => candidate.semanticScore)
  );

  return candidates
    .map((candidate, index) => {
      const rerankScore = rerankCandidate(candidate.chunk, query, weightedQueryTokens);
      const lexicalWeight = lexicalNormalized[index];
      const semanticWeight =
        semanticNormalized[index] >= MIN_SEMANTIC_SCORE
          ? semanticNormalized[index]
          : 0;
      const finalScore =
        lexicalWeight * 0.52 + semanticWeight * 0.34 + rerankScore * 0.14;

      return {
        ...candidate,
        rerankScore,
        finalScore,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore);
}

function dedupeCandidates(candidates: CandidateScore[], limit: number): RetrievalChunk[] {
  const selected: RetrievalChunk[] = [];
  const countByPage = new Map<string, number>();

  for (const candidate of candidates) {
    if (candidate.finalScore < MIN_FINAL_SCORE) {
      continue;
    }

    const samePageCount = countByPage.get(candidate.chunk.pageKey) ?? 0;

    if (samePageCount >= MAX_CHUNKS_PER_PAGE) {
      continue;
    }

    const isNearExistingChunk = selected.some(
      (existingChunk) =>
        existingChunk.source === candidate.chunk.source &&
        existingChunk.page === candidate.chunk.page &&
        Math.abs(existingChunk.start - candidate.chunk.start) < 160
    );

    if (isNearExistingChunk) {
      continue;
    }

    selected.push(candidate.chunk);
    countByPage.set(candidate.chunk.pageKey, samePageCount + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export type Chunk = RetrievalChunk;

export function retrieveManualContext(query: string, limit = 5): Chunk[] {
  const { avgDocumentLength, chunks, components, idfByToken, vocabularyIndex } =
    loadIndex();

  const candidates = pickCandidatePool(
    chunks,
    avgDocumentLength,
    components,
    vocabularyIndex,
    idfByToken,
    query
  );

  return dedupeCandidates(candidates, limit);
}
