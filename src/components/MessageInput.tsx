import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, X, File as FileIcon } from "lucide-react";
import { useChatContext } from "../context.js";
import type { Room } from "../types.js";
import { Button } from "./ui.js";

interface Props {
  roomId: number;
  sendWs: (data: unknown) => void;
}

export function MessageInput({ roomId, sendWs }: Props) {
  const { api, botHint } = useChatContext();
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: async (content: string) => {
      let mediaUrl: string | undefined;
      let mediaName: string | undefined;
      let mediaType: string | undefined;
      if (pendingFile) {
        const uploaded = await api.uploadMedia(pendingFile);
        mediaUrl = uploaded.url;
        mediaName = uploaded.name;
        mediaType = uploaded.type;
      }
      return api.sendMessage(roomId, { content, mediaUrl, mediaName, mediaType });
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
            ? { ...r, lastMessage: { content: msg.content || msg.mediaName || "", createdAt: msg.createdAt } }
            : r
        )
      );
      setText("");
      clearFile();
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
    if ((!content && !pendingFile) || send.isPending) return;
    send.mutate(content);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    // Only images get a thumbnail preview; other files show a generic chip.
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    e.target.value = "";
  }

  function clearFile() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setPendingFile(null);
    setImagePreview(null);
  }

  const canSend = (text.trim().length > 0 || pendingFile !== null) && !send.isPending;

  return (
    <div className="border-t border-black/10 dark:border-white/10 px-3 py-2 flex flex-col gap-2 shrink-0">
      {pendingFile && (
        imagePreview ? (
          <div className="relative w-fit">
            <img src={imagePreview} alt="pending upload" className="h-20 rounded-lg object-cover border border-black/20 dark:border-white/20" />
            <button
              type="button"
              onClick={clearFile}
              className="absolute -top-1.5 -right-1.5 bg-white dark:bg-black border border-black/20 dark:border-white/20 rounded-full p-0.5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-fit max-w-full rounded-lg border border-black/20 dark:border-white/20 bg-black/5 dark:bg-white/5 px-2.5 py-1.5">
            <FileIcon className="h-4 w-4 shrink-0 text-black/50 dark:text-white/50" />
            <span className="text-sm text-black/80 dark:text-white/80 truncate">{pendingFile.name}</span>
            <span className="text-xs text-black/40 dark:text-white/40 shrink-0">{formatSize(pendingFile.size)}</span>
            <button type="button" onClick={clearFile} className="ml-1 shrink-0 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      )}

      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
        <Button
          type="button" size="icon" variant="ghost"
          className="h-9 w-9 shrink-0 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
          onClick={() => fileInputRef.current?.click()}
          disabled={send.isPending}
          title="Attach a file"
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
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
