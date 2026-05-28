import type { Room, Message, Member, Peer } from "./types.js";

async function apiFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export function createChatApi(apiBase: string) {
  const f = <T>(path: string, init?: RequestInit) => apiFetch<T>(apiBase, path, init);

  return {
    getRooms: () => f<Room[]>("/chat/rooms"),

    createRoom: (data: { name: string; inviteIds?: number[]; skipBots?: boolean }) =>
      f<Room>("/chat/rooms", { method: "POST", body: JSON.stringify(data) }),

    moveRoom: (id: number, data: { name?: string; parentId?: number | null; pinnedModel?: string | null }) =>
      f<Room>(`/chat/rooms/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

    getMessages: (roomId: number, before?: string) =>
      f<Message[]>(`/chat/rooms/${roomId}/messages${before ? `?before=${before}` : ""}`),

    sendMessage: (roomId: number, data: { content: string; mediaUrl?: string }) =>
      f<Message>(`/chat/rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify(data) }),

    getUsers: () => f<Peer[]>("/chat/users"),

    getParticipants: () => f<(Peer & { isBot: boolean })[]>("/chat/participants"),

    getOrCreateDm: (userId: number, title?: string) =>
      f<Room>(`/chat/dms/${userId}`, { method: "POST", body: JSON.stringify({ title }) }),

    getMembers: (roomId: number) => f<Member[]>(`/chat/rooms/${roomId}/members`),

    markRead: (roomId: number) =>
      f<null>(`/chat/rooms/${roomId}/read`, { method: "POST" }),

    uploadMedia: async (file: File): Promise<string> => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase}/media/upload`, { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Upload failed");
      return (json.data as { url: string }).url;
    },
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
