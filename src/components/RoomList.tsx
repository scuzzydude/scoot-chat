import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, User, ChevronRight, ChevronDown,
  FolderOpen, Folder, PenSquare,
} from "lucide-react";
import { useChatContext, isPrivileged } from "../context.js";
import { roomTitle, type Room } from "../types.js";
import { Button, Input } from "./ui.js";

interface Props {
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
}

// ─── Tree helpers ───────────────────────────────────────────────────────────────

function buildTree(rooms: Room[]): Map<number | null, Room[]> {
  const map = new Map<number | null, Room[]>();
  for (const r of rooms) {
    const key = r.parentId ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

function hasConversationDescendant(id: number, tree: Map<number | null, Room[]>): boolean {
  for (const child of tree.get(id) ?? []) {
    if (child.roomType !== "folder") return true;
    if (hasConversationDescendant(child.id, tree)) return true;
  }
  return false;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function roomActivity(room: Room): number {
  return room.lastMessage ? new Date(room.lastMessage.createdAt).getTime() : new Date(room.createdAt).getTime();
}

// ─── Folder tree node ───────────────────────────────────────────────────────────

interface NodeProps {
  room: Room;
  tree: Map<number | null, Room[]>;
  depth: number;
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
  collapsed: Set<number>;
  toggleCollapse: (id: number) => void;
}

function RoomNode({ room, tree, depth, selectedRoomId, onSelectRoom, collapsed, toggleCollapse }: NodeProps) {
  const children = tree.get(room.id) ?? [];
  const active = selectedRoomId === room.id;
  const hasUnread = room.unreadCount > 0;
  const isFolder = room.roomType === "folder";
  const isCollapsed = collapsed.has(room.id);
  const indent = depth * 12;

  if (isFolder) {
    return (
      <>
        <button
          className="w-full text-left py-1.5 border-b border-black/5 dark:border-white/5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1"
          style={{ paddingLeft: `${indent + 8}px`, paddingRight: "8px" }}
          onClick={() => toggleCollapse(room.id)}
        >
          {isCollapsed
            ? <ChevronRight className="h-3 w-3 text-black/40 dark:text-white/40 shrink-0" />
            : <ChevronDown className="h-3 w-3 text-black/40 dark:text-white/40 shrink-0" />}
          {isCollapsed
            ? <Folder className="h-3.5 w-3.5 text-black/40 dark:text-white/40 shrink-0" />
            : <FolderOpen className="h-3.5 w-3.5 text-black/50 dark:text-white/50 shrink-0" />}
          <span className="text-xs font-semibold text-black/60 dark:text-white/60 uppercase tracking-wide truncate ml-0.5">
            {room.name}
          </span>
        </button>
        {!isCollapsed && children.map((child) => (
          <RoomNode key={child.id} room={child} tree={tree} depth={depth + 1}
            selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom}
            collapsed={collapsed} toggleCollapse={toggleCollapse} />
        ))}
      </>
    );
  }

  return (
    <button
      className={`w-full text-left py-2 border-b border-black/5 dark:border-white/5 transition-colors ${active ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
      style={{ paddingLeft: `${indent + 8}px`, paddingRight: "8px" }}
      onClick={() => onSelectRoom(room)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {room.roomType === "dm"
            ? <User className="h-3.5 w-3.5 text-black/30 dark:text-white/30 shrink-0" />
            : <MessageSquare className="h-3.5 w-3.5 text-black/30 dark:text-white/30 shrink-0" />}
          <span className={`text-sm truncate ${active ? "text-black dark:text-white font-medium" : hasUnread ? "text-black dark:text-white font-semibold" : "text-black/70 dark:text-white/70"}`}>
            {roomTitle(room)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasUnread && !active && (
            <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center">
              {room.unreadCount > 99 ? "99+" : room.unreadCount}
            </span>
          )}
          {room.lastMessage && (
            <span className="text-xs text-black/30 dark:text-white/30">{formatTime(room.lastMessage.createdAt)}</span>
          )}
        </div>
      </div>
      {room.lastMessage && (
        <p className={`text-xs mt-0.5 pl-[22px] truncate ${hasUnread && !active ? "text-black/60 dark:text-white/60" : "text-black/35 dark:text-white/35"}`}>
          {room.lastMessage.content}
        </p>
      )}
    </button>
  );
}

// ─── Conversation group (subheading + conversation list) ────────────────────────

interface GroupProps {
  label: string;
  rooms: Room[];
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
}

function ConversationGroup({ label, rooms, selectedRoomId, onSelectRoom }: GroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const totalUnread = rooms.reduce((n, r) => n + r.unreadCount, 0);
  const sorted = [...rooms].sort((a, b) => roomActivity(b) - roomActivity(a));

  return (
    <>
      <button
        className="w-full flex items-center gap-1.5 px-3 pt-2.5 pb-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-black/30 dark:text-white/30 shrink-0" />
          : <ChevronDown className="h-3 w-3 text-black/30 dark:text-white/30 shrink-0" />}
        <span className="text-xs font-semibold text-black/50 dark:text-white/50 truncate flex-1 text-left">{label}</span>
        {totalUnread > 0 && (
          <span className="min-w-[1.25rem] h-4 px-1 rounded-full bg-black/20 dark:bg-white/20 text-black dark:text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>
      {!collapsed && sorted.map((room) => (
        <button
          key={room.id}
          className={`w-full text-left py-1.5 border-b border-black/5 dark:border-white/5 transition-colors ${selectedRoomId === room.id ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
          style={{ paddingLeft: "28px", paddingRight: "8px" }}
          onClick={() => onSelectRoom(room)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquare className="h-3 w-3 text-black/25 dark:text-white/25 shrink-0" />
              <span className={`text-sm truncate ${selectedRoomId === room.id ? "text-black dark:text-white font-medium" : room.unreadCount > 0 ? "text-black dark:text-white font-semibold" : "text-black/65 dark:text-white/65"}`}>
                {roomTitle(room)}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {room.unreadCount > 0 && selectedRoomId !== room.id && (
                <span className="min-w-[1.25rem] h-4 px-1 rounded-full bg-black dark:bg-white text-white dark:text-black text-[9px] font-bold flex items-center justify-center">
                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                </span>
              )}
              {room.lastMessage && (
                <span className="text-[10px] text-black/25 dark:text-white/25">{formatTime(room.lastMessage.createdAt)}</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-5 pb-1">
      <span className="text-[10px] font-bold text-black/25 dark:text-white/25 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// ─── New conversation form ──────────────────────────────────────────────────────

function NewConvoForm({ participants, onSubmit, onCancel, pending }: {
  participants: { id: number; username: string; displayName: string | null; isBot: boolean }[];
  onSubmit: (peerId: number | null, name: string, withBots: boolean) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const bots = participants.filter((p) => p.isBot);
  const humans = participants.filter((p) => !p.isBot);
  // null = user hasn't picked yet; derive from current participants so it tracks async load
  const [peerId, setPeerId] = useState<number | "solo" | null>(null);
  const [withBots, setWithBots] = useState(false);
  const [name, setName] = useState("");

  const effectivePeerId: number | "solo" = peerId !== null ? peerId : (humans[0]?.id ?? bots[0]?.id ?? "solo");
  const selectedIsHuman = effectivePeerId !== "solo" && humans.some((h) => h.id === Number(effectivePeerId));

  return (
    <form
      className="flex flex-col gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10 shrink-0"
      onSubmit={(e) => {
        e.preventDefault();
        const t = name.trim();
        if (t) onSubmit(effectivePeerId === "solo" ? null : Number(effectivePeerId), t, !selectedIsHuman || withBots);
      }}
    >
      <Input
        autoFocus
        className="h-8 text-sm bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30"
        placeholder="Conversation title…"
        value={name}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        maxLength={80}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Escape" && onCancel()}
      />
      <select
        className="h-8 text-sm bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white rounded px-2"
        value={String(effectivePeerId)}
        onChange={(e) => setPeerId(e.target.value === "solo" ? "solo" : Number(e.target.value))}
      >
        {humans.map((h) => (
          <option key={h.id} value={h.id}>{h.displayName ?? h.username}</option>
        ))}
        {bots.map((b) => (
          <option key={b.id} value={b.id}>{b.displayName ?? b.username} (bot)</option>
        ))}
        {humans.length > 1 && <option value="solo">Group — all engineers</option>}
      </select>
      {selectedIsHuman && bots.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={withBots}
            onChange={(e) => setWithBots(e.target.checked)}
            className="rounded"
          />
          Include {bots.map((b) => b.displayName ?? b.username).join(", ")} (bot)
        </label>
      )}
      <Button size="sm" type="submit" disabled={!name.trim() || pending}>Start</Button>
    </form>
  );
}

// ─── RoomList ────────────────────────────────────────────────────────────────────

export function RoomList({ selectedRoomId, onSelectRoom }: Props) {
  const { api, userFlags } = useChatContext();
  const qc = useQueryClient();
  const privileged = isPrivileged(userFlags);

  const [showNew, setShowNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: () => api.getRooms(),
    refetchInterval: 10_000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["chat", "participants"],
    queryFn: () => api.getParticipants(),
    enabled: showNew,
  });

  // Auto-collapse folders that are empty (no conversation descendants)
  useEffect(() => {
    if (rooms.length === 0 || autoCollapsed) return;
    const tree = buildTree(rooms);
    const toCollapse = new Set<number>();
    for (const room of rooms) {
      if (room.roomType !== "folder") continue;
      const children = tree.get(room.id) ?? [];
      if (children.length > 10 || !hasConversationDescendant(room.id, tree)) {
        toCollapse.add(room.id);
      }
    }
    if (toCollapse.size > 0) setCollapsed(toCollapse);
    setAutoCollapsed(true);
  }, [rooms, autoCollapsed]);

  const createConvo = useMutation({
    mutationFn: ({ peerId, name, withBots }: { peerId: number | null; name: string; withBots: boolean }) => {
      const participant = peerId !== null ? allUsers.find((u) => u.id === peerId) : null;
      const inviteIds = participant && !participant.isBot ? [peerId!] : undefined;
      const skipBots = !withBots;
      return api.createRoom({ name, inviteIds, skipBots });
    },
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ["chat", "rooms"] });
      setShowNew(false);
      onSelectRoom(room);
    },
  });

  function toggleCollapse(id: number) {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function handleSelect(room: Room) {
    qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
      prev?.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
    );
    api.markRead(room.id).catch(() => {});
    onSelectRoom(room);
  }

  const tree = buildTree(rooms);

  // Inbox conversations (parentId=null, not a folder)
  const inboxRooms = rooms.filter((r) => r.parentId === null && r.roomType !== "folder");

  // Group by peerLabel, sort groups by most-recent unread then most-recent any
  const groupMap = new Map<string, Room[]>();
  for (const r of inboxRooms) {
    const key = r.peerLabel ?? "Unknown";
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(r);
  }

  const groups = [...groupMap.entries()].sort(([, aRooms], [, bRooms]) => {
    const latestUnread = (rs: Room[]) =>
      rs.filter((r) => r.unreadCount > 0).reduce((t, r) => Math.max(t, roomActivity(r)), 0);
    const latestAny = (rs: Room[]) => rs.reduce((t, r) => Math.max(t, roomActivity(r)), 0);
    const aUnread = latestUnread(aRooms);
    const bUnread = latestUnread(bRooms);
    if (aUnread !== bUnread) return bUnread - aUnread;
    return latestAny(bRooms) - latestAny(aRooms);
  });

  // Top-level folders become named sections
  const folderSections = (tree.get(null) ?? []).filter((r) => r.roomType === "folder");

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10 shrink-0">
        <span className="text-sm font-semibold text-black dark:text-white">Steve</span>
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
          onClick={() => setShowNew((v) => !v)}
          title="New conversation"
        >
          <PenSquare className="h-4 w-4" />
        </Button>
      </div>

      {showNew && (
        <NewConvoForm
          participants={allUsers}
          onSubmit={(peerId, name, withBots) => createConvo.mutate({ peerId, name, withBots })}
          onCancel={() => setShowNew(false)}
          pending={createConvo.isPending}
        />
      )}

      <div className="flex-1 overflow-y-auto">

        {/* ── Conversations ── */}
        {(groups.length > 0 || privileged) && (
          <SectionHeader label="Conversations" />
        )}
        {groups.map(([label, convos]) => (
          <ConversationGroup
            key={label}
            label={label}
            rooms={convos}
            selectedRoomId={selectedRoomId}
            onSelectRoom={handleSelect}
          />
        ))}
        {groups.length === 0 && (
          <p className="px-4 py-3 text-xs text-black/25 dark:text-white/25 italic">
            No conversations yet — tap the pencil to start one.
          </p>
        )}

        {/* ── Top-level folder sections (Research, Intelligence, …) ── */}
        {folderSections.map((section) => (
          <div key={section.id}>
            <SectionHeader label={section.name ?? ""} />
            {(tree.get(section.id) ?? []).map((child) => (
              <RoomNode
                key={child.id} room={child} tree={tree} depth={0}
                selectedRoomId={selectedRoomId} onSelectRoom={handleSelect}
                collapsed={collapsed} toggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        ))}

      </div>
    </div>
  );
}
