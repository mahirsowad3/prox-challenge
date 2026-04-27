# Prox Vulcan Agent

<img src="product.webp" alt="Vulcan OmniPro 220" width="400" /> <img src="product-inside.webp" alt="Vulcan OmniPro 220 inside panel" width="400" />

## Product Context

The [Vulcan OmniPro 220](https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html) is a multiprocess welding system sold by Harbor Freight. It supports MIG, Flux-Cored, TIG, and Stick welding, runs on both 120V and 240V input, and includes an LCD-based synergic control system.

The owner's manual is dense: duty-cycle tables, polarity setup procedures, wire-feed instructions, troubleshooting matrices, weld diagnosis material, diagrams, schematics, and parts references. This project turns those manuals into a grounded support agent that can answer technical questions and show the relevant visual/manual context alongside the answer.

## Agent Overview

The implementation lives in [`prox-vulcan-agent`](prox-vulcan-agent), a Next.js app backed by the Anthropic Claude Agent SDK.

The UI is split into two working areas:

- **Chat:** ask setup, polarity, duty-cycle, settings, or troubleshooting questions in natural language.
- **Visual Help / Artifacts:** see cited manual pages rendered from the source PDFs, navigate between citations, and interact with generated support tools.

The assistant is not text-only. When a question benefits from visual support, the app shows the relevant manual page. For structured tasks, it can also surface deterministic interactive cards, currently including a duty-cycle calculator and guided troubleshooting flowchart.

## How the Agent Works

1. The browser posts each user message to `prox-vulcan-agent/app/api/chat/route.ts`.
2. The API route calls `runAgent` in `prox-vulcan-agent/lib/agent.ts`.
3. `runAgent` first checks whether the message should create a deterministic tool payload, such as the duty-cycle calculator or troubleshooting flowchart.
4. It retrieves the most relevant manual chunks with `retrieveManualContext`.
5. It sends only those retrieved excerpts to Claude through the Claude Agent SDK.
6. Claude is instructed to answer only from the supplied excerpts and return schema-shaped JSON containing:
   - `answer`
   - `citations`
   - `visual`
7. The response is normalized before returning to the UI. Citations are deduplicated, filtered to pages that were actually retrieved, and used to choose the best page preview for the visual panel.

## Knowledge Extraction and Representation

The source manuals live in `prox-vulcan-agent/files`:

- `owner-manual.pdf`
- `quick-start-guide.pdf`
- `selection-chart.pdf`

The retrieval data is generated with:

```bash
npm run build:retrieval
```

That command runs `prox-vulcan-agent/scripts/extract-pdfs.ts`, which extracts PDF text page by page and writes JSON data into `prox-vulcan-agent/data`.

The knowledge pipeline is deliberately local and reproducible:

- PDF text is extracted per page so every answer can cite an exact source PDF and page number.
- Text is normalized separately for display and retrieval.
- Pages are split into overlapping chunks so the retriever can match specific procedures without losing nearby context.
- Section titles are inferred from nearby headings when possible.
- A prebuilt retrieval index stores chunk text, source metadata, token counts, IDF values, and lightweight semantic components.
- Retrieval combines BM25-style lexical scoring, local semantic similarity, manual-domain query expansions, and reranking rules for welder-specific intents such as polarity, shielding gas, wire feed, duty cycle, and troubleshooting.

This keeps startup fast and avoids a separate embedding API dependency while still giving the agent useful recall over technical manual content.

## Multimodal and Artifact Design

The app represents multimodal help in three ways:

- **Manual page previews:** cited PDF pages are rendered in the right-hand panel with `pdfjs-dist`, so users can inspect diagrams, tables, front-panel labels, and setup figures directly.
- **Citation navigation:** every assistant answer can return multiple citations, and the UI lets users switch between cited pages.
- **Interactive artifacts:** deterministic tool payloads render as React cards instead of prose-only explanations.

Current artifact examples:

- **Duty Cycle Calculator:** built from manual-rated points for MIG, TIG, and Stick at 120V and 240V. It calculates weld/rest time within a 10-minute duty-cycle window only for manual-listed ratings.
- **Troubleshooting Flowchart:** built from the manual troubleshooting tables. It guides the user through process-specific checks for MIG, TIG, and Stick symptoms while preserving manual source pages.

## Design Decisions

- **Grounded retrieval over unconstrained generation:** the model only sees selected manual excerpts, which reduces hallucination risk for setup and safety-sensitive questions.
- **Deterministic tools for structured tasks:** duty-cycle math and troubleshooting flows are encoded in TypeScript so the UI can provide reliable interactions instead of asking the model to improvise calculations or decision trees.
- **Schema-constrained model output:** Claude returns predictable JSON, making the frontend simpler and preventing brittle parsing of free-form text.
- **Citation filtering:** returned citations must match retrieved pages, so the assistant cannot cite unsupported pages.
- **Local prebuilt index:** retrieval works from committed JSON data and does not require a vector database or embedding service.
- **Visual-first support when useful:** manual pages, charts, and diagrams are shown beside the answer because many welding setup questions are easier to verify visually than through text alone.

## How to Run

From a fresh clone:

```bash
git clone <your-fork>
cd <your-fork>/prox-vulcan-agent
cp ../.env.example .env.local
npm install
npm run dev
```

Set your Anthropic API key in `prox-vulcan-agent/.env.local`:

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

Then open [http://localhost:3000](http://localhost:3000).
