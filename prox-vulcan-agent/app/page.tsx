"use client";

import { useState } from "react";
import PdfPageView from "@/components/PdfPageView";

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
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hi — I’m your Vulcan OmniPro 220 assistant. Ask me about setup, polarity, duty cycle, troubleshooting, or recommended settings.",
    },
  ]);
  const [input, setInput] = useState("");

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const latestVisual = latestAssistantMessage?.visual ?? null;
  const latestCitations = latestAssistantMessage?.citations ?? [];

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.answer ?? "No response received.",
        citations: data.citations ?? [],
        visual: data.visual ?? null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);

      const errorMessage: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: "Sorry, something went wrong.",
        citations: [],
        visual: null,
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6">
        <header className="mb-6 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold">Prox Vulcan Agent</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Multimodal assistant for the Vulcan OmniPro 220
          </p>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-300">Chat</h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-800 text-zinc-100"
                      }`}
                  >
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                      {message.role === "user" ? "You" : "Assistant"}
                    </div>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
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
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none transition focus:border-zinc-500"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-200"
                >
                  Send
                </button>
              </div>
            </form>
          </section>

          <aside className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-300">
                Visual Help / Artifacts
              </h2>
            </div>

            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-2 text-sm font-medium">Manual Figure</h3>
                {latestVisual ? (
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-400">{latestVisual.label}</p>
                    <PdfPageView
                      key={`${latestAssistantMessage?.id ?? "preview"}-${latestVisual.source}-${latestVisual.page}`}
                      source={latestVisual.source}
                      page={latestVisual.page}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Relevant manual images, diagrams, or page screenshots will
                    appear here when a response cites a manual page.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-4">
                <h3 className="mb-2 text-sm font-medium">Interactive Tool</h3>
                <p className="text-sm text-zinc-400">
                  Later, this panel can show a polarity diagram, duty cycle
                  lookup, or troubleshooting flowchart.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-2 text-sm font-medium">Sources</h3>
                {latestCitations.length > 0 ? (
                  <div className="space-y-2">
                    {latestCitations.map((citation, index) => (
                      <div
                        key={`${citation.source}-${citation.page}-${index}`}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300"
                      >
                        {citation.source} · page {citation.page}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">
                    Manual citations and relevant pages will be listed here.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
