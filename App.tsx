import { useState, useEffect } from 'react'
import { useRoute, useLocation } from 'wouter'
import { ChatProvider, RoomList, MessageThread, MessageInput, useChatWebSocket, type Room } from 'scoot-chat'
import BregmanTracker from './BregmanTracker.jsx'
import LoginPage from './LoginPage'

interface AuthUser {
  id: number
  username: string
  displayName: string | null
  userFlags: string
}

function ChatApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const { send, typingUsers } = useChatWebSocket(selectedRoom?.id ?? null)

  return (
    <div className="bg-black h-screen text-white flex flex-col overflow-hidden">
      <header className="h-11 border-b border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm tracking-tight">Steve</span>
          <span className="text-white/20 text-xs">|</span>
          <a href="/tracker" className="text-white/40 text-xs hover:text-white/70 transition-colors">
            Tracker
          </a>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/40 text-xs">{user.displayName ?? user.username}</span>
          <button
            onClick={onLogout}
            className="text-white/30 text-xs hover:text-white/60 transition-colors"
          >
            sign out
          </button>
        </div>
      </header>

      <ChatProvider apiBase="/api/v1" botHint="@steve to ask anything">
        <div className="flex-1 overflow-hidden min-h-0">
          {selectedRoom === null ? (
            <RoomList selectedRoomId={null} onSelectRoom={setSelectedRoom} />
          ) : (
            <div className="flex h-full min-h-0">
              {/* Sidebar */}
              <div className="w-60 border-r border-white/10 shrink-0 hidden md:flex md:flex-col overflow-hidden">
                <RoomList selectedRoomId={selectedRoom.id} onSelectRoom={setSelectedRoom} />
              </div>

              {/* Main */}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <MessageThread room={selectedRoom} typingUsers={typingUsers} onBack={() => setSelectedRoom(null)} />
                <MessageInput roomId={selectedRoom.id} sendWs={send} />
              </div>

              {/* Right panel stub — tools/canvas surface, wired in later */}
              {/* <div className="w-80 border-l border-white/10 shrink-0 hidden xl:block" /> */}
            </div>
          )}
        </div>
      </ChatProvider>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [isTrackerRoute] = useRoute('/tracker')
  const [, navigate] = useLocation()

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then(r => r.json())
      .then(json => {
        if (json.ok) setUser(json.data as AuthUser)
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  async function handleLogout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    navigate('/')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={() => {
      fetch('/api/v1/auth/me').then(r => r.json()).then(json => {
        if (json.ok) setUser(json.data as AuthUser)
      }).catch(() => {})
    }} />
  }

  if (isTrackerRoute) {
    return (
      <div>
        <div className="h-10 bg-black border-b border-white/10 flex items-center px-4 gap-3">
          <a href="/" className="text-white/50 text-xs hover:text-white transition-colors">← Steve Chat</a>
          <span className="text-white/20 text-xs">|</span>
          <span className="text-white/60 text-xs">Bregman IP Tracker</span>
        </div>
        <BregmanTracker />
      </div>
    )
  }

  return <ChatApp user={user} onLogout={handleLogout} />
}
