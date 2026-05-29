import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Bot, Download, File as FileIcon } from "lucide-react";
import { useChatContext, isPrivileged } from "../context.js";
import { roomTitle, type Room, type TypingUser } from "../types.js";
import { Button } from "./ui.js";

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

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const pinnedModel = e.target.value || null;
    api.moveRoom(room.id, { pinnedModel }).then((updated) => {
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
            value={room.pinnedModel ?? ""}
            onChange={handleModelChange}
            title="LLM model for this conversation"
          >
            <option value="">default</option>
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
            {msg.mediaUrl ? (
              <div className="pl-0 mt-1">
                {isImageAttachment(msg.mediaUrl, msg.mediaType) ? (
                  <img
                    src={msg.mediaUrl}
                    alt={msg.mediaName ?? "attachment"}
                    className="max-w-xs max-h-64 rounded-lg object-cover border border-black/10 dark:border-white/10 cursor-pointer"
                    onClick={() => window.open(msg.mediaUrl!, "_blank")}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <a
                    href={msg.mediaUrl}
                    download={msg.mediaName ?? undefined}
                    className="inline-flex items-center gap-2 max-w-xs rounded-lg border border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 px-3 py-2 hover:bg-black/10 dark:hover:bg-white/10 transition-colors group"
                  >
                    <FileIcon className="h-4 w-4 shrink-0 text-black/50 dark:text-white/50" />
                    <span className="text-sm text-black/80 dark:text-white/80 truncate">{msg.mediaName ?? "Download file"}</span>
                    <Download className="h-3.5 w-3.5 shrink-0 text-black/40 dark:text-white/40 group-hover:text-black dark:group-hover:text-white" />
                  </a>
                )}
                {msg.content && (
                  <p className="text-sm text-black/90 dark:text-white/90 leading-relaxed whitespace-pre-wrap break-words mt-1">
                    {msg.content}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-black/90 dark:text-white/90 leading-relaxed whitespace-pre-wrap break-words">
                {msg.content}
              </p>
            )}
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
