export interface Peer {
  id: number;
  username: string;
  displayName: string | null;
}

export interface Room {
  id: number;
  name: string | null;
  parentId: number | null;
  roomType: string;   // "folder" | "conversation" | "dm"
  pinnedModel: string | null;
  peerLabel: string | null;  // "Steve", "Henry · Steve", etc. — null for folders
  createdBy: number;
  createdAt: string;
  lastMessage: { content: string; createdAt: string } | null;
  peer: Peer | null;
  unreadCount: number;
}

export interface Message {
  id: number;
  roomId: number;
  userId: number;
  username: string;
  displayName: string | null;
  isBot: boolean;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
}

export interface Member {
  id: number;
  username: string;
  displayName: string | null;
  isBot: boolean;
}

export interface TypingUser {
  userId: number;
  username: string;
  displayName: string | null;
}

export function roomTitle(room: Room): string {
  if (room.roomType === "dm" && room.peer) return room.peer.displayName ?? room.peer.username;
  return room.name ?? "(untitled)";
}
