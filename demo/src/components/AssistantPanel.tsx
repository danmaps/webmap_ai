import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantService, ChatMessage } from "../lib/assistant";
import "./AssistantPanel.css";

interface AssistantPanelProps {
  service: AssistantService | null;
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "👋 Hi! I'm your map assistant. The map shows **US Regions**, **Interstate Highways**, and **Major US Cities**.\n\n" +
    "Try asking:\n" +
    "- *What layers are loaded?*\n" +
    "- *What cities are visible?*\n" +
    "- *Tell me about the current map state.*\n\n" +
    (import.meta.env["VITE_OPENROUTER_API_KEY"]
      ? "🟢 OpenRouter API key detected — using live LLM."
      : "🟡 No API key set — using mock responses. Add `VITE_OPENROUTER_API_KEY` to `demo/.env` for live AI."),
};

function renderContent(text: string) {
  // Very simple markdown-like rendering for bold and bullet points
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const key = i;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const inner = line.slice(2);
      return (
        <li key={key} dangerouslySetInnerHTML={{ __html: formatInline(inner) }} />
      );
    }
    if (line === "") return <br key={key} />;
    return (
      <p key={key} dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
    );
  });
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export function AssistantPanel({ service }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || busy || !service) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Thinking…",
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setBusy(true);

    try {
      const reply = await service.send(userMsg.content);
      setMessages((prev) => prev.map((m) => (m.id === loadingMsg.id ? reply : m)));
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: loadingMsg.id,
        role: "assistant",
        content: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((prev) => prev.map((m) => (m.id === loadingMsg.id ? errorMsg : m)));
    } finally {
      setBusy(false);
    }
  }, [input, busy, service]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  return (
    <aside className="assistant-panel">
      <header className="assistant-header">
        <span className="assistant-title">Map Assistant</span>
        <span className="assistant-badge">{service ? "ready" : "loading…"}</span>
      </header>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message--${msg.role}${msg.isLoading ? " message--loading" : ""}`}>
            <div className="message-content">
              {msg.isLoading ? (
                <span className="loading-dots">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <ul className="message-body">{renderContent(msg.content)}</ul>
              )}
            </div>

            {msg.toolResults && msg.toolResults.length > 0 && (
              <details className="tool-results">
                <summary>Tool results ({msg.toolResults.length})</summary>
                <ul>
                  {msg.toolResults.map((r, i) => (
                    <li key={i} className={r.ok ? "tool-ok" : "tool-err"}>
                      <code>{r.name}</code>
                      {r.ok ? (
                        <span> ✓ {typeof r.data === "object" ? JSON.stringify(r.data).slice(0, 80) + "…" : String(r.data)}</span>
                      ) : (
                        <span> ✗ {r.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className="message-input"
          placeholder={service ? "Ask about the map…" : "Waiting for map…"}
          value={input}
          disabled={!service || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <button type="submit" className="send-btn" disabled={!service || busy || !input.trim()}>
          ↑
        </button>
      </form>
    </aside>
  );
}
