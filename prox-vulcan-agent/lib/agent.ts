import { retrieveManualContext } from "@/lib/retrieval";

export type Citation = {
  source: string;
  page: number;
};

export type Visual = {
  source: string;
  page: number;
  label: string;
};

export type AgentResponse = {
  answer: string;
  citations: Citation[];
  visual: Visual | null;
};

export async function runAgent(message: string): Promise<AgentResponse> {
  const chunks = retrieveManualContext(message, 3);

  if (chunks.length === 0) {
    return {
      answer:
        "Sorry, I could not find anything relevant in the manuals yet. Try asking with more detail, like the welding process or voltage.",
      citations: [],
      visual: null,
    };
  }

  const citations: Citation[] = chunks.map((chunk) => ({
    source: chunk.source,
    page: chunk.page,
  }));

  const topCitation = citations[0];

  const contextText = chunks
    .map(
      (chunk) =>
        `[${chunk.source} - page ${chunk.page}]\n${chunk.text}`
    )
    .join("\n\n");

  return {
    answer:
      `Here is the retrieved context for your question:\n\n${contextText}`,
    citations,
    visual: topCitation
      ? {
          ...topCitation,
          label: `${topCitation.source} · page ${topCitation.page}`,
        }
      : null,
  };
}
