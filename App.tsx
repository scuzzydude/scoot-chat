import { useState, useEffect, useRef } from 'react'
import { useRoute, useLocation } from 'wouter'
import { ChatProvider, RoomList, MessageThread, MessageInput, useChatWebSocket, type Room } from 'scoot-chat'
import BregmanTracker from './BregmanTracker.jsx'
import LoginPage from './LoginPage'
import { Sun, Moon, ChevronDown, LogOut } from 'lucide-react'

interface AuthUser {
  id: number
  username: string
  displayName: string | null
  userFlags: string
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('chat-theme') as 'dark' | 'light') ?? 'dark'
  })
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [theme])
  function toggle() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      localStorage.setItem('chat-theme', next)
      return next
    })
  }
  function set(t: 'dark' | 'light') {
    localStorage.setItem('chat-theme', t)
    setTheme(t)
  }
  return { theme, toggle, set }
}

function UserMenu({ user, theme, onSetTheme, onLogout }: {
  user: AuthUser
  theme: 'dark' | 'light'
  onSetTheme: (t: 'dark' | 'light') => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 transition-colors text-xs"
      >
        <span>{user.displayName ?? user.username}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b border-black/5 dark:border-white/5">
            <p className="text-xs font-semibold text-black dark:text-white truncate">{user.displayName ?? user.username}</p>
            <p className="text-[10px] text-black/40 dark:text-white/40 truncate mt-0.5">{user.username}</p>
          </div>

          <div className="px-3 py-2 border-b border-black/5 dark:border-white/5">
            <p className="text-[10px] font-semibold text-black/30 dark:text-white/30 uppercase tracking-wider mb-1.5">Appearance</p>
            <div className="flex gap-1">
              <button
                onClick={() => { onSetTheme('light'); setOpen(false) }}
                className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs transition-colors ${
                  theme === 'light'
                    ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white font-medium'
                    : 'text-black/50 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Sun className="h-3 w-3" />
                Light
              </button>
              <button
                onClick={() => { onSetTheme('dark'); setOpen(false) }}
                className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs transition-colors ${
                  theme === 'dark'
                    ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white font-medium'
                    : 'text-black/50 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Moon className="h-3 w-3" />
                Dark
              </button>
            </div>
          </div>

          <div className="p-1">
            <button
              onClick={() => { setOpen(false); onLogout() }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const { send, typingUsers } = useChatWebSocket(selectedRoom?.id ?? null)
  const { theme, toggle, set } = useTheme()

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white text-black dark:bg-black dark:text-white">
      <header className="h-11 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm tracking-tight">Steve</span>
          <span className="text-black/20 dark:text-white/20 text-xs">|</span>
          <a href="/tracker" className="text-black/40 dark:text-white/40 text-xs hover:text-black/70 dark:hover:text-white/70 transition-colors">
            Tracker
          </a>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <UserMenu user={user} theme={theme} onSetTheme={set} onLogout={onLogout} />
        </div>
      </header>

      <ChatProvider apiBase="/api/v1" botHint="@steve to ask anything" userFlags={user.userFlags}>
        <div className="flex-1 overflow-hidden min-h-0">
          {selectedRoom === null ? (
            <RoomList selectedRoomId={null} onSelectRoom={setSelectedRoom} />
          ) : (
            <div className="flex h-full min-h-0">
              <div className="w-60 border-r border-black/10 dark:border-white/10 shrink-0 hidden md:flex md:flex-col overflow-hidden">
                <RoomList selectedRoomId={selectedRoom.id} onSelectRoom={setSelectedRoom} />
              </div>
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <MessageThread room={selectedRoom} typingUsers={typingUsers} onBack={() => setSelectedRoom(null)} />
                <MessageInput roomId={selectedRoom.id} sendWs={send} />
              </div>
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
