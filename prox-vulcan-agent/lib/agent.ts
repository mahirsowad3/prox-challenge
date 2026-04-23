import { query } from "@anthropic-ai/claude-agent-sdk";
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

type StructuredAgentResponse = {
  answer: string;
  citations: Citation[];
  visual: Citation | null;
};

const AGENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          page: { type: "number" },
        },
        required: ["source", "page"],
      },
    },
    visual: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            source: { type: "string" },
            page: { type: "number" },
          },
          required: ["source", "page"],
        },
      ],
    },
  },
  required: ["answer", "citations", "visual"],
} as const;

class AgentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigurationError";
  }
}

function requireAnthropicApiKey(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new AgentConfigurationError(
      "ANTHROPIC_API_KEY is missing. Add it to prox-vulcan-agent/.env.local and restart the Next.js server."
    );
  }
}

function buildPrompt(message: string, contextText: string): string {
  return [
    "You are a helpful product-support assistant for the Vulcan OmniPro 220.",
    "Answer the user's question using only the supplied manual excerpts.",
    "Do not invent setup steps, specifications, settings, or troubleshooting advice.",
    "If the excerpts are insufficient, say that clearly and ask the user for a narrower follow-up question.",
    "Write for a non-expert user in a garage or workshop.",
    "Return citations only from the provided excerpts.",
    "Return `visual` only when one cited page would be especially useful to show in the UI.",
    "",
    "User question:",
    message,
    "",
    "Retrieved manual context:",
    contextText,
  ].join("\n");
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();

  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.page}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isCitationAllowed(citation: Citation, allowed: Set<string>): boolean {
  return allowed.has(`${citation.source}:${citation.page}`);
}

function normalizeAgentResponse(
  response: StructuredAgentResponse,
  allowedCitations: Set<string>
): AgentResponse {
  const citations = dedupeCitations(response.citations).filter((citation) =>
    isCitationAllowed(citation, allowedCitations)
  );

  const visualCitation =
    response.visual && isCitationAllowed(response.visual, allowedCitations)
      ? response.visual
      : null;

  const selectedVisual = visualCitation ?? citations[0] ?? null;

  return {
    answer: response.answer.trim(),
    citations,
    visual: selectedVisual
      ? {
          ...selectedVisual,
          label: `${selectedVisual.source} - page ${selectedVisual.page}`,
        }
      : null,
  };
}

async function queryClaudeWithContext(
  message: string,
  contextText: string
): Promise<StructuredAgentResponse> {
  requireAnthropicApiKey();

  let finalMessage:
    | { type: "result"; subtype: string; structured_output?: unknown; result?: string }
    | null = null;

  for await (const sdkMessage of query({
    prompt: buildPrompt(message, contextText),
    options: {
      model: "claude-sonnet-4-5",
      maxTurns: 2,
      permissionMode: "dontAsk",
      allowedTools: [],
      disallowedTools: [
        "Agent",
        "AskUserQuestion",
        "Bash",
        "Edit",
        "Glob",
        "Grep",
        "Monitor",
        "NotebookEdit",
        "Read",
        "WebFetch",
        "WebSearch",
        "Write",
      ],
      settingSources: [],
      systemPrompt:
        "You are a grounded support agent. Use only the provided context and produce output that matches the JSON schema.",
      outputFormat: {
        type: "json_schema",
        schema: AGENT_RESPONSE_SCHEMA,
      },
    },
  })) {
    if (sdkMessage.type === "result") {
      finalMessage = sdkMessage;
    }
  }

  if (!finalMessage) {
    throw new Error("Claude Agent SDK did not return a final result.");
  }

  if (finalMessage.subtype !== "success" || !finalMessage.structured_output) {
    throw new Error(
      finalMessage.result ||
        "Claude Agent SDK could not produce a structured response for this request."
    );
  }

  return finalMessage.structured_output as StructuredAgentResponse;
}

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

  const citations: Citation[] = chunks.map((chunk) => ({
    source: chunk.source,
    page: chunk.page,
  }));

  const topCitation = citations[0];
  const allowedCitations = new Set(
    citations.map((citation) => `${citation.source}:${citation.page}`)
  );

  const contextText = chunks
    .map((chunk) =>
      [
        `[${chunk.source} - page ${chunk.page}${chunk.sectionTitle ? ` - ${chunk.sectionTitle}` : ""}]`,
        chunk.text,
      ].join("\n")
    )
    .join("\n\n");

  const structuredResponse = await queryClaudeWithContext(message, contextText);
  const normalizedResponse = normalizeAgentResponse(
    structuredResponse,
    allowedCitations
  );

  if (!normalizedResponse.answer) {
    return {
      answer:
        "I found relevant manual pages, but I could not turn them into a reliable answer. Try asking a more specific question about the welding process, voltage, or setup step.",
      citations,
      visual: topCitation
        ? {
            ...topCitation,
            label: `${topCitation.source} - page ${topCitation.page}`,
          }
        : null,
    };
  }

  return normalizedResponse;
}
