import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Bot, Download, File as FileIcon, Play, Loader2, Check, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatContext, isPrivileged } from "../context.js";
import { roomTitle, type Room, type TypingUser } from "../types.js";
import { Button } from "./ui.js";

// ─── Code block runner ───────────────────────────────────────────────────────

const RUNNABLE = new Set(["python","python3","py","bash","sh","javascript","js","typescript","ts","node"]);

type RunState = "idle" | "running" | "done" | "error";

function RunButton({ lang, code, terminalBase }: { lang: string; code: string; terminalBase: string }) {
  const [state, setState] = useState<RunState>("idle");
  const [output, setOutput] = useState<string | null>(null);

  const run = useCallback(async () => {
    setState("running"); setOutput(null);
    try {
      // Wrap in the appropriate interpreter
      const cmd = lang === "python" || lang === "python3" || lang === "py"
        ? `python3 -c ${JSON.stringify(code)}`
        : lang === "javascript" || lang === "js" || lang === "node"
          ? `node -e ${JSON.stringify(code)}`
          : lang === "typescript" || lang === "ts"
            ? `npx -y tsx -e ${JSON.stringify(code)} 2>&1`
            : `bash -c ${JSON.stringify(code)}`;

      const r = await fetch(`${terminalBase}/execute`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeout: 30 }),
      });
      const { id } = await r.json();

      // Poll until done
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 500));
        const s = await fetch(`${terminalBase}/execute/${id}/status`).then(r => r.json());
        if (s.status === "done") {
          const text = s.output.map((o: { data: string }) => o.data).join("").trimEnd();
          setOutput(text || "(no output)");
          setState(s.exit_code === 0 ? "done" : "error");
          return;
        }
      }
      setOutput("timed out"); setState("error");
    } catch (e) {
      setOutput((e as Error).message); setState("error");
    }
  }, [lang, code, terminalBase]);

  return (
    <div className="mt-1">
      <button
        onClick={run}
        disabled={state === "running"}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors
          ${state === "running" ? "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 cursor-not-allowed"
          : state === "done"    ? "bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20"
          : state === "error"   ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
          : "bg-black/10 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-black/20 dark:hover:bg-white/20"}`}
      >
        {state === "running" ? <Loader2 className="h-3 w-3 animate-spin" />
         : state === "done"  ? <Check className="h-3 w-3" />
         : state === "error" ? <AlertCircle className="h-3 w-3" />
         : <Play className="h-3 w-3" />}
        {state === "running" ? "Running…" : state === "done" ? "Done" : state === "error" ? "Error" : `Run ${lang}`}
      </button>
      {output !== null && (
        <pre className={`mt-2 text-[11px] font-mono p-2 rounded border whitespace-pre-wrap break-words
          ${state === "error"
            ? "bg-red-500/5 border-red-500/20 text-red-500"
            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-black/80 dark:text-white/80"}`}>
          {output}
        </pre>
      )}
    </div>
  );
}

const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6",   label: "Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5",  label: "Haiku 4.5" },
];

const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

// Images render inline; everything else shows as a download link.
function isImageAttachment(url: string, type: string | null): boolean {
  if (type) return type.startsWith("image/");
  const lower = url.toLowerCase();
  return IMAGE_EXT.some((ext) => lower.endsWith(ext));
}

interface Props {
  room: Room;
  typingUsers: TypingUser[];
  onBack: () => void;
}

export function MessageThread({ room, typingUsers, onBack }: Props) {
  const { api, userFlags } = useChatContext();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const privileged = isPrivileged(userFlags);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", "messages", room.id],
    queryFn: () => api.getMessages(room.id),
  });

  useEffect(() => {
    api.markRead(room.id).then(() => {
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
        prev?.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );
    }).catch(() => {});
  }, [room.id, qc, api]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingUsers.length]);

  const { terminalBase } = useChatContext();

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Render a bot message as markdown with optional ▶ run buttons on code blocks
  function BotMessage({ content }: { content: string }) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-p:leading-relaxed prose-p:my-1
        prose-headings:font-semibold prose-headings:my-2
        prose-code:text-[11px] prose-code:bg-black/10 prose-code:dark:bg-white/10 prose-code:px-1 prose-code:rounded
        prose-pre:bg-black/10 prose-pre:dark:bg-white/10 prose-pre:p-0 prose-pre:my-2
        prose-table:text-xs prose-td:py-1 prose-th:py-1
        prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            pre({ children }) { return <div>{children}</div>; },
            code({ className, children, ...props }) {
              const lang = (className?.replace("language-","") ?? "").toLowerCase();
              const isBlock = !props.hasOwnProperty("inline") && (className || String(children).includes("\n"));
              const code = String(children).replace(/\n$/, "");
              if (!isBlock) return <code className={className} {...props}>{children}</code>;
              return (
                <div className="rounded border border-black/10 dark:border-white/10 overflow-hidden my-2">
                  <div className="flex items-center justify-between px-3 py-1 bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
                    <span className="text-[10px] font-mono text-black/40 dark:text-white/40">{lang || "code"}</span>
                  </div>
                  <pre className="px-3 py-2 overflow-x-auto text-[11px] font-mono leading-relaxed text-black/80 dark:text-white/80 whitespace-pre m-0">{code}</pre>
                  {terminalBase && RUNNABLE.has(lang) && (
                    <div className="px-3 pb-2">
                      <RunButton lang={lang} code={code} terminalBase={terminalBase} />
                    </div>
                  )}
                </div>
              );
            },
          }}
        >{content}</ReactMarkdown>
      </div>
    );
  }

  // Local state so the select reflects the chosen value immediately — the room
  // prop won't re-render with the new pinnedModel until the parent re-derives
  // selectedRoom from the rooms cache, which may lag.
  const DEFAULT_MODEL = AVAILABLE_MODELS[0].id; // Opus 4.6
  const [pinnedModel, setPinnedModel] = useState(room.pinnedModel ?? DEFAULT_MODEL);

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setPinnedModel(next);
    api.moveRoom(room.id, { pinnedModel: next }).then((updated) => {
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
        prev?.map((r) => (r.id === room.id ? { ...r, pinnedModel: updated.pinnedModel } : r))
      );
    }).catch(() => {});
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-black/10 dark:border-white/10 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-black dark:text-white truncate block">{roomTitle(room)}</span>
        </div>
        {privileged && room.roomType !== "folder" && (
          <select
            className="h-7 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/60 dark:text-white/60 rounded px-1.5 shrink-0 hover:text-black dark:hover:text-white transition-colors"
            value={pinnedModel}
            onChange={handleModelChange}
            title="LLM model for this conversation"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-black/30 dark:text-white/30 text-sm py-10">No messages yet.</p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${msg.isBot ? "text-blue-500 dark:text-blue-400" : "text-black/70 dark:text-white/70"}`}>
                {msg.displayName ?? msg.username}
              </span>
              {msg.isBot && <Bot className="h-3 w-3 text-blue-500/60 dark:text-blue-400/60 shrink-0" />}
              <span className="text-xs text-black/25 dark:text-white/25">{formatTime(msg.createdAt)}</span>
            </div>
            {(() => {
              // Prefer the attachments array; fall back to the legacy single-media fields.
              const atts = (msg.attachments && msg.attachments.length > 0)
                ? msg.attachments
                : (msg.mediaUrl ? [{ url: msg.mediaUrl, name: msg.mediaName ?? "attachment", type: msg.mediaType ?? "" }] : []);
              // Content renderer — bot messages use markdown, human messages plain text
              const contentEl = msg.content
                ? msg.isBot
                  ? <BotMessage content={msg.content} />
                  : <p className="text-sm text-black/90 dark:text-white/90 leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                : null;

              if (atts.length === 0) return contentEl;
              return (
                <div className="pl-0 mt-1">
                  <div className="flex flex-wrap gap-2">
                    {atts.map((a, i) => (
                      isImageAttachment(a.url, a.type ?? null) ? (
                        <img
                          key={i}
                          src={a.url}
                          alt={a.name}
                          className="max-w-xs max-h-64 rounded-lg object-cover border border-black/10 dark:border-white/10 cursor-pointer"
                          onClick={() => window.open(a.url, "_blank")}
                          onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <a
                          key={i}
                          href={a.url}
                          download={a.name || undefined}
                          className="inline-flex items-center gap-2 max-w-xs rounded-lg border border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 px-3 py-2 hover:bg-black/10 dark:hover:bg-white/10 transition-colors group"
                        >
                          <FileIcon className="h-4 w-4 shrink-0 text-black/50 dark:text-white/50" />
                          <span className="text-sm text-black/80 dark:text-white/80 truncate">{a.name || "Download file"}</span>
                          <Download className="h-3.5 w-3.5 shrink-0 text-black/40 dark:text-white/40 group-hover:text-black dark:group-hover:text-white" />
                        </a>
                      )
                    ))}
                  </div>
                  {contentEl && <div className="mt-1">{contentEl}</div>}
                </div>
              );
            })()}
          </div>
        ))}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-black/40 dark:text-white/40 italic">
            <Bot className="h-3 w-3 shrink-0" />
            <span>{typingUsers.map((u) => u.displayName ?? u.username).join(", ")} is typing…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
