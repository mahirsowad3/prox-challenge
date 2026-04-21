import { retrieveManualContext } from "@/lib/retrieval";

export type AgentResponse = {
  answer: string;
  citations: { source: string; page: number }[];
  visual: null;
};

export async function runAgent(message: string): Promise<AgentResponse> {
  const chunks = retrieveManualContext(message, 5);

  if (chunks.length === 0) {
    return {
      answer:
        "Sorry, I could not find anything relevant in the manuals yet. Try asking with more detail, like the welding process or voltage.",
      citations: [],
      visual: null,
    };
  }

  const contextText = chunks
    .map(
      (chunk) =>
        `[${chunk.source} - page ${chunk.page}]\n${chunk.text}`
    )
    .join("\n\n");

  return {
    answer:
      `Here is the retrieved context for your question:\n\n${contextText}`,
    citations: chunks.map((chunk) => ({
      source: chunk.source,
      page: chunk.page,
    })),
    visual: null,
  };
}