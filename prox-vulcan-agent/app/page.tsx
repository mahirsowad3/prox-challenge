"use client";

import { useEffect, useRef, useState } from "react";
import PdfPageView from "@/components/PdfPageView";
import {
  DUTY_CYCLE_RATINGS,
  estimateDutyCycleResult,
  findExactDutyCycleResult,
  type DutyCycleToolPayload,
  type InputVoltage,
  type WeldingProcess,
} from "@/lib/duty-cycle";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Citation = {
  source: string;
  page: number;
};

type Visual = {
  source: string;
  page: number;
  label: string;
};

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  visual?: Visual | null;
  tool?: DutyCycleToolPayload | null;
};

const PROCESS_OPTIONS: WeldingProcess[] = ["MIG", "TIG", "Stick"];
const VOLTAGE_OPTIONS: InputVoltage[] = [120, 240];

function getInitialCitationIndex(
  citations: Citation[],
  visual: Visual | null | undefined
) {
  if (citations.length === 0) {
    return 0;
  }

  const visualIndex = visual
    ? citations.findIndex(
        (citation) =>
          citation.source === visual.source && citation.page === visual.page
      )
    : -1;

  return visualIndex >= 0 ? visualIndex : 0;
}

function AssistantMessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-3 last:mb-0">{children}</p>
        ),
        ol: ({ children }) => (
          <ol className="my-4 list-decimal space-y-3 pl-5">{children}</ol>
        ),
        ul: ({ children }) => (
          <ul className="my-4 list-disc space-y-3 pl-5">{children}</ul>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => (
          <strong className="rounded-md bg-amber-300/10 px-1.5 py-0.5 font-bold text-amber-100">
            {children}
          </strong>
        ),
        code: ({ children }) => (
          <code className="rounded bg-zinc-950/70 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-100">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function DutyCycleToolCard({
  tool,
}: {
  tool: DutyCycleToolPayload | null | undefined;
}) {
  const [selectedProcess, setSelectedProcess] = useState<WeldingProcess | "">(
    tool?.process ?? ""
  );
  const [selectedVoltage, setSelectedVoltage] = useState<InputVoltage | "">(
    tool?.inputVoltage ?? ""
  );
  const [amperageInput, setAmperageInput] = useState(
    tool?.amperage !== undefined ? String(tool.amperage) : ""
  );

  const parsedAmperage = Number(amperageInput);
  const hasProcess = selectedProcess !== "";
  const hasVoltage = selectedVoltage !== "";
  const hasAmperage = amperageInput.trim() !== "" && Number.isFinite(parsedAmperage);
  const ratedPoints =
    hasProcess && hasVoltage
      ? DUTY_CYCLE_RATINGS[selectedProcess][selectedVoltage]
      : [];
  const exactResult =
    hasProcess && hasVoltage && hasAmperage
      ? findExactDutyCycleResult(selectedProcess, selectedVoltage, parsedAmperage)
      : undefined;
  const estimatedResult =
    hasProcess && hasVoltage && hasAmperage && !exactResult
      ? estimateDutyCycleResult(selectedProcess, selectedVoltage, parsedAmperage)
      : undefined;
  const displayedResult = exactResult ?? estimatedResult ?? tool.result;
  const displayedNotes =
    hasProcess && hasVoltage && hasAmperage && !exactResult && estimatedResult
      ? [
          `The manual does not list an exact duty cycle rating at ${parsedAmperage}A for ${selectedProcess} on ${selectedVoltage}V.`,
          "Estimated values are interpolated between the two manual-listed ratings for this process and voltage.",
        ]
      : tool.notes;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-medium">{tool.title}</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Use the manual’s rated points to see how many minutes you can weld in
          a 10-minute window before the machine should rest.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Process
          </p>
          <div className="flex flex-wrap gap-2">
            {PROCESS_OPTIONS.map((process) => (
              <button
                key={process}
                type="button"
                onClick={() => setSelectedProcess(process)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  selectedProcess === process
                    ? "border-blue-500/80 bg-blue-500/10 text-blue-100"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {process}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Input Voltage
          </p>
          <div className="flex flex-wrap gap-2">
            {VOLTAGE_OPTIONS.map((voltage) => (
              <button
                key={voltage}
                type="button"
                onClick={() => setSelectedVoltage(voltage)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  selectedVoltage === voltage
                    ? "border-blue-500/80 bg-blue-500/10 text-blue-100"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {voltage}V
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="duty-cycle-amperage"
            className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Amperage
          </label>
          <input
            id="duty-cycle-amperage"
            type="number"
            min="1"
            step="1"
            value={amperageInput}
            onChange={(event) => setAmperageInput(event.target.value)}
            placeholder="Enter amperage"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
          />
        </div>

        {ratedPoints.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Rated Points
            </p>
            <div className="flex flex-wrap gap-2">
              {ratedPoints.map((rating) => (
                <button
                  key={`${rating.amperage}-${rating.dutyCyclePercent}`}
                  type="button"
                  onClick={() => setAmperageInput(String(rating.amperage))}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  {rating.amperage}A at {rating.dutyCyclePercent}%
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {displayedResult ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Result
                </p>
                <p className="text-sm text-zinc-300">
                  {selectedProcess || tool.process || "Selected process"} on{" "}
                  {selectedVoltage || tool.inputVoltage || "selected voltage"}V
                  {hasAmperage ? ` at ${parsedAmperage}A` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${
                  displayedResult.source === "manual"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-amber-500/10 text-amber-300"
                }`}
              >
                {displayedResult.source === "manual" ? "Manual" : "Estimated"}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Duty Cycle
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {displayedResult.dutyCyclePercent}%
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Weld Time
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {displayedResult.weldMinutes} min
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Rest Time
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {displayedResult.restMinutes} min
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
            Select a process and voltage, then enter an amperage to calculate
            duty cycle guidance.
          </div>
        )}

        <div className="space-y-2">
          {displayedNotes.map((note) => (
            <p key={note} className="text-sm text-zinc-400">
              {note}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedCitationIndex, setSelectedCitationIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hi - I'm your Vulcan OmniPro 220 assistant. Ask me about setup, polarity, duty cycle, troubleshooting, or recommended settings.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const latestVisual = latestAssistantMessage?.visual ?? null;
  const latestCitations = latestAssistantMessage?.citations ?? [];
  const latestTool = latestAssistantMessage?.tool ?? null;
  const selectedCitation = latestCitations[selectedCitationIndex] ?? null;
  const displayedVisual = selectedCitation
    ? {
        ...selectedCitation,
        label: `${selectedCitation.source} - page ${selectedCitation.page}`,
      }
    : latestVisual;
  const hasMultipleCitations = latestCitations.length > 1;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  const selectAdjacentCitation = (direction: -1 | 1) => {
    if (latestCitations.length <= 1) {
      return;
    }

    setSelectedCitationIndex(
      (currentIndex) =>
        (currentIndex + direction + latestCitations.length) %
        latestCitations.length
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(
          errorPayload?.error || `Server error: ${response.statusText}`
        );
      }

      const data = await response.json();
      const citations = data.citations ?? [];
      const visual = data.visual ?? null;
      const tool = data.tool ?? null;

      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.answer ?? "No response received.",
        citations,
        visual,
        tool,
      };

      setSelectedCitationIndex(getInitialCitationIndex(citations, visual));
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);

      const errorMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Sorry, something went wrong.",
        citations: [],
        visual: null,
        tool: null,
      };

      setSelectedCitationIndex(0);
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex h-full max-w-7xl flex-col px-4 py-6">
        <header className="mb-6 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold">Prox Vulcan Agent</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Multimodal assistant for the Vulcan OmniPro 220
          </p>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
          <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-300">Chat</h2>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pr-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                      {message.role === "user" ? "You" : "Assistant"}
                    </div>
                    {message.role === "assistant" ? (
                      <div className="text-zinc-100">
                        <AssistantMessageContent content={message.content} />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-6 text-zinc-100">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                      Assistant
                    </div>
                    <div
                      className="flex items-center gap-3 text-zinc-300"
                      role="status"
                    >
                      <span>
                        Searching the manuals and generating an answer...
                      </span>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Generating response</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t border-zinc-800 px-4 py-4"
            >
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about polarity, duty cycle, porosity, settings..."
                  disabled={isLoading}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Thinking..." : "Send"}
                </button>
              </div>
            </form>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-300">
                Visual Help / Artifacts
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 outline-none focus-visible:border-zinc-500"
                tabIndex={displayedVisual && hasMultipleCitations ? 0 : -1}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    selectAdjacentCitation(-1);
                  }

                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    selectAdjacentCitation(1);
                  }
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Manual Figure</h3>
                  {hasMultipleCitations ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectAdjacentCitation(-1)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                        aria-label="Show previous source"
                      >
                        &larr;
                      </button>
                      <span className="text-xs text-zinc-500">
                        {selectedCitationIndex + 1} / {latestCitations.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => selectAdjacentCitation(1)}
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                        aria-label="Show next source"
                      >
                        &rarr;
                      </button>
                    </div>
                  ) : null}
                </div>
                {displayedVisual ? (
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-400">
                      {displayedVisual.label}
                    </p>
                    <PdfPageView
                      key={`${latestAssistantMessage?.id ?? "preview"}-${displayedVisual.source}-${displayedVisual.page}`}
                      source={displayedVisual.source}
                      page={displayedVisual.page}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Relevant manual images, diagrams, or page screenshots will
                    appear here when a response cites a manual page.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-2 text-sm font-medium">Sources</h3>
                {latestCitations.length > 0 ? (
                  <div className="space-y-2">
                    {latestCitations.map((citation, index) => (
                      <button
                        key={`${citation.source}-${citation.page}-${index}`}
                        type="button"
                        onClick={() => setSelectedCitationIndex(index)}
                        aria-pressed={index === selectedCitationIndex}
                        className={`block w-full cursor-pointer rounded-xl border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                          index === selectedCitationIndex
                            ? "border-blue-500/80 bg-blue-500/10 text-blue-100"
                            : "border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900 hover:text-white"
                        }`}
                      >
                        {citation.source} - page {citation.page}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Manual citations and relevant pages will be listed here.
                  </p>
                )}
              </div>

              {latestTool?.type === "duty-cycle" ? (
                <DutyCycleToolCard
                  key={latestAssistantMessage?.id ?? "duty-cycle-tool"}
                  tool={latestTool}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
