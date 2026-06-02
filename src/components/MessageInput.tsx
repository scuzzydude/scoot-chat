import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, X, File as FileIcon } from "lucide-react";
import { useChatContext } from "../context.js";
import type { Room, Attachment } from "../types.js";
import { Button } from "./ui.js";

const MAX_FILES = 25;

interface Props {
  roomId: number;
  sendWs: (data: unknown) => void;
}

interface Pending {
  file: File;
  preview: string | null; // object URL for images, null otherwise
}

export function MessageInput({ roomId, sendWs }: Props) {
  const { api, botHint } = useChatContext();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: async (content: string) => {
      let attachments: Attachment[] = [];
      if (pending.length > 0) {
        // upload all pending files, preserve order
        attachments = await Promise.all(pending.map((p) => api.uploadMedia(p.file)));
      }
      return api.sendMessage(roomId, { content, attachments });
    },
    onError: (err) => {
      console.error("send failed:", err);
    },
    onSuccess: (msg) => {
      qc.setQueryData(
        ["chat", "messages", roomId],
        (prev: typeof msg[] | undefined) =>
          prev ? (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]) : [msg]
      );
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
        prev?.map((r) =>
          r.id === roomId
            ? { ...r, lastMessage: { content: msg.content || msg.attachments?.[0]?.name || msg.mediaName || "", createdAt: msg.createdAt } }
            : r
        )
      );
      setText("");
      clearFiles();
      textareaRef.current?.focus();
    },
  });

  const sendTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    sendWs({ type: "typing_client" });
    typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
  }, [sendWs]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    if (e.target.value.length > 0) sendTyping();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  function submit() {
    const content = text.trim();
    if ((!content && pending.length === 0) || send.isPending) return;
    send.mutate(content);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPending((prev) => {
      const room = MAX_FILES - prev.length;
      const added = files.slice(0, Math.max(0, room)).map((file) => ({
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));
      return [...prev, ...added];
    });
    e.target.value = "";
  }

  function removeAt(i: number) {
    setPending((prev) => {
      const p = prev[i];
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function clearFiles() {
    setPending((prev) => {
      prev.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
      return [];
    });
  }

  const canSend = (text.trim().length > 0 || pending.length > 0) && !send.isPending;
  const atLimit = pending.length >= MAX_FILES;

  return (
    <div className="border-t border-black/10 dark:border-white/10 px-3 py-2 flex flex-col gap-2 shrink-0">
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pending.map((p, i) => (
            p.preview ? (
              <div key={i} className="relative w-fit">
                <img src={p.preview} alt={p.file.name} className="h-20 rounded-lg object-cover border border-black/20 dark:border-white/20" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute -top-1.5 -right-1.5 bg-white dark:bg-black border border-black/20 dark:border-white/20 rounded-full p-0.5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div key={i} className="flex items-center gap-2 w-fit max-w-full rounded-lg border border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5 px-2.5 py-1.5">
                <FileIcon className="h-4 w-4 shrink-0 text-black/50 dark:text-white/50" />
                <span className="text-sm text-black/80 dark:text-white/80 truncate max-w-[160px]">{p.file.name}</span>
                <span className="text-xs text-black/40 dark:text-white/40 shrink-0">{formatSize(p.file.size)}</span>
                <button type="button" onClick={() => removeAt(i)} className="ml-1 shrink-0 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <span className="text-[10px] text-black/30 dark:text-white/30 px-1">
          {pending.length}/{MAX_FILES} file{pending.length === 1 ? "" : "s"}{atLimit ? " — limit reached" : ""}
        </span>
      )}

      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        <Button
          type="button" size="icon" variant="ghost"
          className="h-9 w-9 shrink-0 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
          onClick={() => fileInputRef.current?.click()}
          disabled={send.isPending || atLimit}
          title={atLimit ? `Max ${MAX_FILES} files` : "Attach files"}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 resize-none bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2 text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border border-black/10 dark:border-white/10 focus:outline-none focus:border-black/20 dark:focus:border-white/20 max-h-32 leading-relaxed"
          placeholder={`Message… or ${botHint}`}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          maxLength={4000}
        />

        <Button size="icon" className="h-9 w-9 shrink-0" disabled={!canSend} onClick={submit}>
          {send.isPending
            ? <span className="h-4 w-4 rounded-full border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white animate-spin" />
            : <Send className="h-4 w-4" />
          }
        </Button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
