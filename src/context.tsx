import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createChatApi, type ChatApi } from "./api.js";

// Privilege bit constants (must match server FLAGS)
export const FLAGS = {
  CHIEF_ENGINEER: 1n,
  LAB_ENGINEER: 2n,
} as const;

export function isPrivileged(userFlags: string): boolean {
  const f = BigInt(userFlags);
  return (f & (FLAGS.CHIEF_ENGINEER | FLAGS.LAB_ENGINEER)) !== 0n;
}

interface ChatConfig {
  api: ChatApi;
  botHint: string;
  userFlags: string;
  title: string;
  /** Proxy base for the user's Open Terminal container, e.g. "/terminal-brandon".
   *  When set, code blocks in bot messages get a ▶ Run button. */
  terminalBase?: string;
}

const ChatContext = createContext<ChatConfig | null>(null);

export function ChatProvider({
  apiBase,
  botHint = "@bot to ask anything",
  userFlags = "0",
  title = "Chat",
  terminalBase,
  children,
}: {
  apiBase: string;
  botHint?: string;
  userFlags?: string;
  title?: string;
  terminalBase?: string;
  children: ReactNode;
}) {
  const api = useMemo(() => createChatApi(apiBase), [apiBase]);
  return (
    <ChatContext.Provider value={{ api, botHint, userFlags, title, terminalBase }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext(): ChatConfig {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("scoot-chat: must be used inside <ChatProvider>");
  return ctx;
}
