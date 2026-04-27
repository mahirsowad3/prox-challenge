export type PageChunk = {
  id: string;
  source: string;
  page: number;
  text: string;
};

export type RetrievalChunk = {
  id: string;
  source: string;
  page: number;
  text: string;
  normalizedText: string;
  sectionTitle: string | null;
  start: number;
  end: number;
  tokenCount: number;
  embedding?: number[];
};

export type RetrievalIndexFile = {
  version: "retrieval-v1";
  chunkSize: number;
  chunkOverlap: number;
  avgDocumentLength: number;
  vocabulary: string[];
  idf: number[];
  components: number[][];
  chunks: RetrievalChunk[];
};

const CHUNK_TARGET_SIZE = 460;
const CHUNK_MIN_SIZE = 300;
const CHUNK_MAX_SIZE = 620;
const CHUNK_OVERLAP = 90;
const MAX_COMPONENTS = 12;
const POWER_ITERATIONS = 20;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "use",
  "what",
  "when",
  "while",
  "with",
  "your",
]);

const HEADING_BLACKLIST = new Set([
  "warning",
  "save this manual",
  "table of contents",
  "symbology",
  "fety",
  "top",
  "wire",
  "tig",
  "stick",
  "maintenance",
  "controls",
]);

const BOILERPLATE_PATTERNS = [
  /^page \d+/i,
  /^for technical questions/i,
  /^item \d+/i,
  /^visit our website/i,
  /^email our technical support/i,
  /^copyright/i,
  /^save this manual/i,
  /^read this material before/i,
  /^basic welding instructions/i,
];

const OCR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Â/g, ""],
  [/â€™/g, "'"],
  [/â€²/g, "'"],
  [/â€œ|â€/g, '"'],
  [/â€¢/g, " "],
  [/â€“|â€”/g, "-"],
  [/â€³/g, '"'],
  [/Ã—/g, "x"],
];

function applyOcrReplacements(text: string): string {
  return OCR_REPLACEMENTS.reduce(
    (currentText, [pattern, replacement]) =>
      currentText.replace(pattern, replacement),
    text
  );
}

function stripBoilerplateLines(text: string): string {
  const lines = applyOcrReplacements(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());

  const filtered = lines.filter((line) => {
    if (!line) {
      return true;
    }

    return !BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line));
  });

  return filtered
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeForRetrieval(text: string): string {
  const normalized = stripBoilerplateLines(text)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/[_/]/g, " ")
    .replace(/[^a-zA-Z0-9.+#\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

  return normalized;
}

export function normalizeForDisplay(text: string): string {
  return stripBoilerplateLines(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeForRetrieval(text)
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 1 &&
        !STOP_WORDS.has(token) &&
        /[a-z]/.test(token)
    );
}

function buildTokenCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return counts;
}

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();

  if (
    trimmed.length < 3 ||
    trimmed.length > 80 ||
    HEADING_BLACKLIST.has(trimmed.toLowerCase())
  ) {
    return false;
  }

  if (!/[a-zA-Z]/.test(trimmed)) {
    return false;
  }

  if (!/[aeiou]/i.test(trimmed) && trimmed.length < 8) {
    return false;
  }

  const lettersOnly = trimmed.replace(/[^a-zA-Z]/g, "");

  if (!lettersOnly) {
    return false;
  }

  const uppercaseRatio =
    lettersOnly.replace(/[^A-Z]/g, "").length / lettersOnly.length;

  return uppercaseRatio > 0.55 || /^[A-Z][A-Za-z0-9 /-]{2,}$/.test(trimmed);
}

function inferSectionTitle(text: string): string | null {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 4)) {
    if (looksLikeHeading(line)) {
      return line;
    }
  }

  return null;
}

function findChunkBoundary(
  text: string,
  start: number,
  preferredEnd: number,
  minEnd: number,
  maxEnd: number
): number {
  const boundaryPattern = /(\n\n|[.!?]\s|:\s|;\s|\n)/g;
  let bestBefore = -1;
  let bestAfter = -1;
  let match: RegExpExecArray | null = null;

  boundaryPattern.lastIndex = start;

  while ((match = boundaryPattern.exec(text))) {
    const boundary = match.index + match[0].length;

    if (boundary >= minEnd && boundary <= preferredEnd) {
      bestBefore = boundary;
    }

    if (boundary > preferredEnd && boundary <= maxEnd) {
      bestAfter = boundary;
      break;
    }

    if (boundary > maxEnd) {
      break;
    }
  }

  if (bestBefore !== -1) {
    return bestBefore;
  }

  if (bestAfter !== -1) {
    return bestAfter;
  }

  return maxEnd;
}

function chunkPage(pageChunk: PageChunk): RetrievalChunk[] {
  const text = normalizeForDisplay(pageChunk.text);

  if (!text) {
    return [];
  }

  const chunks: RetrievalChunk[] = [];
  let start = 0;
  let chunkNumber = 0;

  while (start < text.length) {
    const remainingLength = text.length - start;
    const maxEnd = Math.min(start + CHUNK_MAX_SIZE, text.length);
    const minEnd =
      remainingLength <= CHUNK_MIN_SIZE
        ? text.length
        : Math.min(start + CHUNK_MIN_SIZE, text.length);
    const preferredEnd =
      remainingLength <= CHUNK_TARGET_SIZE
        ? text.length
        : Math.min(start + CHUNK_TARGET_SIZE, text.length);

    const end =
      preferredEnd >= text.length
        ? text.length
        : findChunkBoundary(text, start, preferredEnd, minEnd, maxEnd);

    const chunkText = text.slice(start, end).trim();
    const normalizedText = normalizeForRetrieval(chunkText);
    const tokens = tokenize(normalizedText);

    if (chunkText && tokens.length >= 6) {
      chunks.push({
        id: `${pageChunk.id}-c${chunkNumber + 1}`,
        source: pageChunk.source,
        page: pageChunk.page,
        text: chunkText,
        normalizedText,
        sectionTitle: inferSectionTitle(chunkText),
        start,
        end,
        tokenCount: tokens.length,
      });
      chunkNumber += 1;
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = Math.max(end - CHUNK_OVERLAP, start + 1);
    start = nextStart;
  }

  return chunks;
}

type SparseVectorEntry = {
  index: number;
  weight: number;
};

function dotDenseSparse(vector: number[], entries: SparseVectorEntry[]): number {
  let total = 0;

  for (const entry of entries) {
    total += vector[entry.index] * entry.weight;
  }

  return total;
}

function l2Norm(values: number[]): number {
  let total = 0;

  for (const value of values) {
    total += value * value;
  }

  return Math.sqrt(total);
}

function normalizeVector(values: number[]): number[] {
  const norm = l2Norm(values);

  if (!norm) {
    return values;
  }

  return values.map((value) => value / norm);
}

function buildSemanticComponents(
  documentVectors: SparseVectorEntry[][],
  vocabularySize: number
): number[][] {
  const componentCount = Math.min(
    MAX_COMPONENTS,
    vocabularySize,
    documentVectors.length
  );

  if (componentCount <= 0) {
    return [];
  }

  const components: number[][] = [];

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
    let vector: number[] = Array.from({ length: vocabularySize }, (_, index) =>
      ((index + 1) * (componentIndex + 3)) % 17 === 0 ? 1 : 0.35
    );
    vector = normalizeVector(vector);

    for (let iteration = 0; iteration < POWER_ITERATIONS; iteration += 1) {
      const projected = documentVectors.map((entries) =>
        dotDenseSparse(vector, entries)
      );

      const nextVector = Array.from({ length: vocabularySize }, () => 0);

      for (let docIndex = 0; docIndex < documentVectors.length; docIndex += 1) {
        const scale = projected[docIndex];

        if (!scale) {
          continue;
        }

        for (const entry of documentVectors[docIndex]) {
          nextVector[entry.index] += entry.weight * scale;
        }
      }

      for (const existingComponent of components) {
        const overlap = nextVector.reduce(
          (total, value, index) => total + value * existingComponent[index],
          0
        );

        if (!overlap) {
          continue;
        }

        for (let index = 0; index < nextVector.length; index += 1) {
          nextVector[index] -= overlap * existingComponent[index];
        }
      }

      const nextNorm = l2Norm(nextVector);

      if (nextNorm < 1e-6) {
        vector = [];
        break;
      }

      vector = nextVector.map((value) => value / nextNorm);
    }

    if (vector.length === 0 || l2Norm(vector) < 1e-6) {
      break;
    }

    components.push(vector.map((value) => Number(value.toFixed(6))));
  }

  return components;
}

export function buildRetrievalIndex(pageChunks: PageChunk[]): RetrievalIndexFile {
  const retrievalChunks = pageChunks.flatMap(chunkPage);
  const documentCount = retrievalChunks.length;

  if (documentCount === 0) {
    return {
      version: "retrieval-v1",
      chunkSize: CHUNK_TARGET_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      avgDocumentLength: 0,
      vocabulary: [],
      idf: [],
      components: [],
      chunks: [],
    };
  }

  const tokenizedChunks = retrievalChunks.map((chunk) => tokenize(chunk.normalizedText));
  const docFrequency = new Map<string, number>();

  for (const tokens of tokenizedChunks) {
    for (const token of new Set(tokens)) {
      docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1);
    }
  }

  const vocabulary = [...docFrequency.entries()]
    .filter(([, frequency]) => frequency >= 1)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      return a[0].localeCompare(b[0]);
    })
    .map(([token]) => token);

  const vocabularyIndex = new Map(
    vocabulary.map((token, index) => [token, index] as const)
  );

  const idf = vocabulary.map((token) => {
    const frequency = docFrequency.get(token) ?? 0;
    return Math.log(1 + (documentCount - frequency + 0.5) / (frequency + 0.5));
  });

  const avgDocumentLength =
    tokenizedChunks.reduce((total, tokens) => total + tokens.length, 0) /
    documentCount;

  const documentVectors: SparseVectorEntry[][] = tokenizedChunks.map((tokens) => {
    const tokenCounts = buildTokenCounts(tokens);
    const maxFrequency = Math.max(...tokenCounts.values(), 1);

    return [...tokenCounts.entries()].map(([token, count]) => {
      const index = vocabularyIndex.get(token);

      if (index === undefined) {
        return null;
      }

      const tf = 0.5 + 0.5 * (count / maxFrequency);

      return {
        index,
        weight: tf * idf[index],
      };
    }).filter((entry): entry is SparseVectorEntry => entry !== null);
  });

  const components = buildSemanticComponents(documentVectors, vocabulary.length);

  const chunks = retrievalChunks.map((chunk, chunkIndex) => ({
    ...chunk,
    embedding: components.map((component) =>
      Number(dotDenseSparse(component, documentVectors[chunkIndex]).toFixed(6))
    ),
  }));

  return {
    version: "retrieval-v1",
    chunkSize: CHUNK_TARGET_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    avgDocumentLength: Number(avgDocumentLength.toFixed(6)),
    vocabulary,
    idf: idf.map((value) => Number(value.toFixed(6))),
    components,
    chunks,
  };
}
