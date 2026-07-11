import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { AssistantService, ChatMessage } from "../lib/assistant";
import { OPENROUTER_MODEL } from "../lib/assistant";
import "./AssistantPanel.css";

interface AssistantPanelProps {
  service: AssistantService | null;
}

const SUGGESTION_PROMPTS = [
  "What layers are loaded?",
  "What cities are visible?",
  "Tell me about the current map state.",
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "👋 Hi! I'm your map assistant. The map shows **US Regions**, **Interstate Highways**, and **Major US Cities**.\n\n" +
    "Try asking:\n" +
    "- *What layers are loaded?*\n" +
    "- *What cities are visible?*\n" +
    "- *Tell me about the current map state.*\n\n" +
    (import.meta.env["VITE_BACKEND_URL"]
      ? "🟢 Backend URL detected — routing chat through the FastAPI backend."
      : import.meta.env["VITE_OPENROUTER_API_KEY"]
        ? `🟢 Public demo mode — using shared OpenRouter access with a low-cost model (\`${OPENROUTER_MODEL}\`).`
        : "🟡 No API key or backend set — using mock responses. Add `VITE_BACKEND_URL` (FastAPI) or `VITE_OPENROUTER_API_KEY` to `demo/.env` for live AI."),
};

function renderInline(text: string): React.ReactNode[] {
  // Parse **bold**, *italic*, and `code` into React elements without innerHTML
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1] !== undefined) {
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={match.index}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      parts.push(<code key={match.index}>{match[3]}</code>);
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

function renderContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const key = i;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      return <li key={key}>{renderInline(line.slice(2))}</li>;
    }
    if (line === "") return <br key={key} />;
    return <p key={key}>{renderInline(line)}</p>;
  });
}

export function AssistantPanel({ service }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || busy || !service) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
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
  }, [busy, service]);

  const send = useCallback(async () => {
    await sendMessage(input);
  }, [input, sendMessage]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setInput(suggestion);
      void sendMessage(suggestion);
    },
    [sendMessage],
  );

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

            {msg.id === "welcome" && (
              <div className="suggestion-row" aria-label="Try asking suggestions">
                {SUGGESTION_PROMPTS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="suggestion-chip"
                    disabled={!service || busy}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

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
