import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createChatApi, type ChatApi } from "./api.js";

interface ChatConfig {
  api: ChatApi;
  botHint: string;  // text shown in message input placeholder, e.g. "@BigMo to ask anything"
}

const ChatContext = createContext<ChatConfig | null>(null);

export function ChatProvider({
  apiBase,
  botHint = "@bot to ask anything",
  children,
}: {
  apiBase: string;
  botHint?: string;
  children: ReactNode;
}) {
  const api = useMemo(() => createChatApi(apiBase), [apiBase]);
  return (
    <ChatContext.Provider value={{ api, botHint }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext(): ChatConfig {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("scoot-chat: must be used inside <ChatProvider>");
  return ctx;
}
