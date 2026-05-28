import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, User, Plus, ChevronRight, ChevronDown, FolderOpen, Folder } from "lucide-react";
import { useChatContext } from "../context.js";
import { roomTitle, type Room } from "../types.js";
import { Button } from "./ui.js";
import { Input } from "./ui.js";

interface Props {
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
}

function buildTree(rooms: Room[]): Map<number | null, Room[]> {
  const map = new Map<number | null, Room[]>();
  for (const r of rooms) {
    const key = r.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface NodeProps {
  room: Room;
  children: Room[];
  tree: Map<number | null, Room[]>;
  depth: number;
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
  collapsed: Set<number>;
  toggleCollapse: (id: number) => void;
}

function RoomNode({ room, children, tree, depth, selectedRoomId, onSelectRoom, collapsed, toggleCollapse }: NodeProps) {
  const active = selectedRoomId === room.id;
  const hasUnread = room.unreadCount > 0;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(room.id);

  const indent = depth * 12;

  if (hasChildren) {
    // Folder node — clicking toggles expand, doesn't select a room
    return (
      <>
        <button
          className={`w-full text-left py-1.5 border-b border-white/5 transition-colors hover:bg-white/5 flex items-center gap-1`}
          style={{ paddingLeft: `${indent + 8}px`, paddingRight: "8px" }}
          onClick={() => toggleCollapse(room.id)}
        >
          {isCollapsed
            ? <ChevronRight className="h-3 w-3 text-white/40 shrink-0" />
            : <ChevronDown className="h-3 w-3 text-white/40 shrink-0" />
          }
          {isCollapsed
            ? <Folder className="h-3.5 w-3.5 text-white/40 shrink-0" />
            : <FolderOpen className="h-3.5 w-3.5 text-white/50 shrink-0" />
          }
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wide truncate ml-0.5">
            {roomTitle(room)}
          </span>
        </button>
        {!isCollapsed && children.map((child) => {
          const grandchildren = tree.get(child.id) ?? [];
          return (
            <RoomNode
              key={child.id}
              room={child}
              children={grandchildren}
              tree={tree}
              depth={depth + 1}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
            />
          );
        })}
      </>
    );
  }

  // Leaf room node
  return (
    <button
      className={`w-full text-left py-2 border-b border-white/5 transition-colors ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
      style={{ paddingLeft: `${indent + 8}px`, paddingRight: "8px" }}
      onClick={() => onSelectRoom(room)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {room.isDm
            ? <User className="h-3.5 w-3.5 text-white/30 shrink-0" />
            : <MessageSquare className="h-3.5 w-3.5 text-white/30 shrink-0" />
          }
          <span className={`text-sm truncate ${active ? "text-white font-medium" : hasUnread ? "text-white font-semibold" : "text-white/70"}`}>
            {roomTitle(room)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUnread && !active && (
            <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
              {room.unreadCount > 99 ? "99+" : room.unreadCount}
            </span>
          )}
          {room.lastMessage && (
            <span className="text-xs text-white/30">{formatTime(room.lastMessage.createdAt)}</span>
          )}
        </div>
      </div>
      {room.lastMessage && (
        <p className={`text-xs mt-0.5 pl-[22px] truncate ${hasUnread && !active ? "text-white/60" : "text-white/35"}`}>
          {room.lastMessage.content}
        </p>
      )}
    </button>
  );
}

export function RoomList({ selectedRoomId, onSelectRoom }: Props) {
  const { api } = useChatContext();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: () => api.getRooms(),
  });

  // Auto-collapse folders with many children on first load
  useEffect(() => {
    if (rooms.length === 0 || autoCollapsed) return;
    const tree = buildTree(rooms);
    const bigFolders = new Set<number>();
    for (const [parentId, children] of tree.entries()) {
      if (parentId !== null && children.length > 10) bigFolders.add(parentId);
    }
    if (bigFolders.size > 0) setCollapsed(bigFolders);
    setAutoCollapsed(true);
  }, [rooms, autoCollapsed]);

  const createRoom = useMutation({
    mutationFn: (name: string) => api.createRoom({ name }),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ["chat", "rooms"] });
      setShowNew(false);
      setNewName("");
      onSelectRoom(room);
    },
  });

  function toggleCollapse(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name) createRoom.mutate(name);
  }

  function handleSelect(room: Room) {
    qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
      prev?.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
    );
    api.markRead(room.id).catch(() => {});
    onSelectRoom(room);
  }

  const tree = buildTree(rooms);
  const roots = tree.get(null) ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-sm font-semibold text-white">Chat</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white/50 hover:text-white"
          onClick={() => setShowNew((v) => !v)}
          title="New room"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showNew && (
        <form
          className="flex gap-2 px-3 py-2 border-b border-white/10 shrink-0"
          onSubmit={handleCreate}
        >
          <Input
            autoFocus
            className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Room name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={64}
          />
          <Button size="sm" type="submit" disabled={!newName.trim() || createRoom.isPending}>
            Create
          </Button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 && (
          <p className="px-4 py-10 text-center text-white/30 text-sm">
            No rooms yet.<br />Tap + to create one.
          </p>
        )}

        {roots.map((room) => {
          const children = tree.get(room.id) ?? [];
          return (
            <RoomNode
              key={room.id}
              room={room}
              children={children}
              tree={tree}
              depth={0}
              selectedRoomId={selectedRoomId}
              onSelectRoom={handleSelect}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
            />
          );
        })}
      </div>
    </div>
  );
}
