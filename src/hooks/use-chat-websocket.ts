import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Room, Message, TypingUser } from "../types.js";

interface WsMessageEnvelope {
  type: "message";
  roomId: number;
  message: Message;
}

interface WsTypingEnvelope {
  type: "typing";
  roomId: number;
  userId: number;
  username: string;
  displayName: string | null;
}

interface WsTypingStopEnvelope {
  type: "typing_stop";
  roomId: number;
  userId: number;
}

type WsEnvelope = WsMessageEnvelope | WsTypingEnvelope | WsTypingStopEnvelope;

const TYPING_TIMEOUT_MS = 30000;

export function useChatWebSocket(roomId: number | null) {
  const ws = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const removeTyping = useCallback((userId: number) => {
    const timer = typingTimers.current.get(userId);
    if (timer) { clearTimeout(timer); typingTimers.current.delete(userId); }
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  const addTyping = useCallback((user: TypingUser) => {
    const existing = typingTimers.current.get(user.userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => removeTyping(user.userId), TYPING_TIMEOUT_MS);
    typingTimers.current.set(user.userId, timer);
    setTypingUsers((prev) =>
      prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]
    );
  }, [removeTyping]);

  const detach = (sock: WebSocket | null) => {
    if (!sock) return;
    sock.onmessage = null;
    sock.onclose = null;
    sock.onerror = null;
  };

  const connect = useCallback(() => {
    if (!roomId) return;
    detach(ws.current);
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) ws.current.close();

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${window.location.host}/ws/chat/${roomId}`);
    ws.current = sock;

    sock.onmessage = (event) => {
      const envelope = JSON.parse(event.data) as WsEnvelope;
      if (envelope.roomId !== roomId) return;

      if (envelope.type === "message") {
        removeTyping(envelope.message.userId);
        qc.setQueryData<Message[]>(["chat", "messages", roomId], (prev) =>
          prev
            ? prev.some((m) => m.id === envelope.message.id) ? prev : [...prev, envelope.message]
            : [envelope.message]
        );
        qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
          prev?.map((r) =>
            r.id === roomId
              ? { ...r, lastMessage: { content: envelope.message.content, createdAt: envelope.message.createdAt } }
              : r
          )
        );
      } else if (envelope.type === "typing") {
        addTyping({ userId: envelope.userId, username: envelope.username, displayName: envelope.displayName });
      } else if (envelope.type === "typing_stop") {
        removeTyping(envelope.userId);
      }
    };

    sock.onclose = () => {
      if (ws.current !== sock) return;
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    sock.onerror = () => sock.close();
  }, [roomId, qc, addTyping, removeTyping]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      for (const t of typingTimers.current.values()) clearTimeout(t);
      typingTimers.current.clear();
      setTypingUsers([]);
      detach(ws.current);
      ws.current?.close();
      ws.current = null;
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(data));
  }, []);

  return { send, typingUsers };
}
