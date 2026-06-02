/**
 * TerminalPanel — resizable right-side drawer for Steve Chat.
 *
 * Files tab:
 *   .md         → react-markdown with GFM (tables, code blocks, etc.)
 *   .docx       → mammoth → HTML (full formatting)
 *   .pptx       → jszip slide text extraction
 *   .png/jpg/etc → inline image (base64 via execute)
 *   .txt/code   → syntax-highlighted preformatted text
 *   binary      → file info
 *
 * Shell tab: full xterm.js terminal (same container as Open WebUI)
 *
 * Resize: drag the left edge. Maximize button for full-panel.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Folder, File as FileIcon, RefreshCw, Home, Terminal,
  X, ArrowLeft, Maximize2, Minimize2,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Entry { name: string; type: "file" | "directory"; size?: number }

export interface TerminalPanelProps {
  base: string;
  width: number;
  onResize: (w: number) => void;
  onClose: () => void;
}

const TEXT_EXT  = new Set([".txt",".md",".py",".js",".ts",".tsx",".jsx",".json",".yaml",".yml",".sh",".bash",".c",".h",".cpp",".css",".html",".xml",".sql",".csv",".log",".conf",".toml",".ini",".env"]);
const IMAGE_EXT = new Set([".png",".jpg",".jpeg",".gif",".webp",".svg"]);
const DOCX_EXT  = new Set([".docx"]);
const PPTX_EXT  = new Set([".pptx"]);
const PDF_EXT   = new Set([".pdf"]);

function extOf(name: string) { return name.slice(name.lastIndexOf(".")).toLowerCase() || ""; }
function fmt(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(0)}K`;
  return `${(b/1048576).toFixed(1)}M`;
}

// Poll /execute until done and return concatenated stdout
async function execRun(base: string, cmd: string, timeoutSecs = 15): Promise<string> {
  const r = await fetch(`${base}/execute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: cmd, timeout: timeoutSecs }),
  });
  const { id } = await r.json();
  for (let i = 0; i < 50; i++) {
    await new Promise(res => setTimeout(res, 300));
    const s = await fetch(`${base}/execute/${id}/status`).then(r => r.json());
    if (s.status === "done") return s.output.map((o: {data:string}) => o.data).join("");
  }
  throw new Error("execute timed out");
}

// base64 a binary file from the container and return ArrayBuffer
async function fetchBinary(base: string, path: string): Promise<ArrayBuffer> {
  const b64 = (await execRun(base, `base64 -w 0 ${JSON.stringify(path)}`)).trim();
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─── Content views ──────────────────────────────────────────────────────────

type View =
  | { kind: "list" }
  | { kind: "loading"; name: string }
  | { kind: "text";    name: string; content: string; isMarkdown: boolean }
  | { kind: "html";    name: string; html: string }
  | { kind: "image";   name: string; b64: string; mime: string }
  | { kind: "slides";  name: string; slides: string[] }
  | { kind: "binary";  name: string; size: number }
  | { kind: "error";   name: string; message: string };

function BackBar({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-black/10 dark:border-white/10 shrink-0">
      <button onClick={onBack} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/50 dark:text-white/50">
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-mono text-black/60 dark:text-white/60 truncate">{name}</span>
    </div>
  );
}

// ─── File Browser ────────────────────────────────────────────────────────────

function FileBrowser({ base }: { base: string }) {
  const [dir, setDir] = useState("/home/user");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });

  const loadDir = useCallback(async (d: string) => {
    setListLoading(true); setListError(null); setView({ kind: "list" });
    try {
      const r = await fetch(`${base}/files/list?directory=${encodeURIComponent(d)}`);
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      const all: Entry[] = (j.entries ?? []).filter((e: Entry) => !e.name.startsWith("."));
      all.sort((a, b) => a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name));
      setEntries(all); setDir(d);
    } catch (e) { setListError((e as Error).message); }
    finally { setListLoading(false); }
  }, [base]);

  useEffect(() => { loadDir("/home/user"); }, []); // eslint-disable-line

  async function open(e: Entry) {
    if (e.type === "directory") { loadDir(`${dir}/${e.name}`); return; }
    const path = `${dir}/${e.name}`;
    const x = extOf(e.name);
    setView({ kind: "loading", name: e.name });
    try {
      if (x === ".md") {
        const r = await fetch(`${base}/files/read?path=${encodeURIComponent(path)}`);
        if (!r.ok) throw new Error(`read ${r.status}`);
        const j = await r.json();
        setView({ kind: "text", name: e.name, content: j.content ?? "", isMarkdown: true });
      } else if (TEXT_EXT.has(x)) {
        const r = await fetch(`${base}/files/read?path=${encodeURIComponent(path)}`);
        const j = await r.json();
        setView({ kind: "text", name: e.name, content: j.content ?? "", isMarkdown: false });
      } else if (IMAGE_EXT.has(x)) {
        const raw = await execRun(base, `base64 -w 0 ${JSON.stringify(path)}`);
        const mime = { ".svg":"image/svg+xml",".gif":"image/gif",".webp":"image/webp",".png":"image/png" }[x] ?? "image/jpeg";
        setView({ kind: "image", name: e.name, b64: raw.trim(), mime });
      } else if (DOCX_EXT.has(x)) {
        const buf = await fetchBinary(base, path);
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        setView({ kind: "html", name: e.name, html: result.value });
      } else if (PPTX_EXT.has(x)) {
        const buf = await fetchBinary(base, path);
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buf);
        const slideKeys = Object.keys(zip.files)
          .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
        const slides: string[] = [];
        for (const k of slideKeys) {
          const xml = await zip.files[k].async("string");
          const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).filter(Boolean);
          if (texts.length) slides.push(texts.join(" "));
        }
        setView({ kind: "slides", name: e.name, slides });
      } else if (PDF_EXT.has(x)) {
        // pdf-parse is server-only; show best effort text via pdftotext if available, else file info
        try {
          const out = await execRun(base, `pdftotext ${JSON.stringify(path)} - 2>/dev/null || echo "[PDF — pdftotext not available in this container]"`, 20);
          setView({ kind: "text", name: e.name, content: out, isMarkdown: false });
        } catch {
          setView({ kind: "binary", name: e.name, size: e.size ?? 0 });
        }
      } else {
        setView({ kind: "binary", name: e.name, size: e.size ?? 0 });
      }
    } catch (err) {
      setView({ kind: "error", name: e.name, message: (err as Error).message });
    }
  }

  function back() { setView({ kind: "list" }); }

  if (view.kind === "loading") return (
    <div className="flex items-center justify-center h-full text-black/30 dark:text-white/30 text-xs gap-2">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading {view.name}…
    </div>
  );

  if (view.kind === "text") return (
    <div className="flex flex-col h-full overflow-hidden">
      <BackBar name={view.name} onBack={back} />
      <div className="flex-1 overflow-auto px-4 py-3">
        {view.isMarkdown ? (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-black/10 dark:prose-pre:bg-white/10 prose-code:text-[11px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{view.content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="text-[11px] leading-relaxed font-mono text-black/80 dark:text-white/80 whitespace-pre-wrap break-words">{view.content}</pre>
        )}
      </div>
    </div>
  );

  if (view.kind === "html") return (
    <div className="flex flex-col h-full overflow-hidden">
      <BackBar name={view.name} onBack={back} />
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="prose prose-sm dark:prose-invert max-w-none prose-table:text-[11px]"
          dangerouslySetInnerHTML={{ __html: view.html }} />
      </div>
    </div>
  );

  if (view.kind === "image") return (
    <div className="flex flex-col h-full overflow-hidden">
      <BackBar name={view.name} onBack={back} />
      <div className="flex-1 overflow-auto flex items-start justify-center p-3">
        <img src={`data:${view.mime};base64,${view.b64}`} alt={view.name} className="max-w-full rounded border border-black/10 dark:border-white/10" />
      </div>
    </div>
  );

  if (view.kind === "slides") return (
    <div className="flex flex-col h-full overflow-hidden">
      <BackBar name={view.name} onBack={back} />
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {view.slides.map((s, i) => (
          <div key={i} className="border border-black/10 dark:border-white/10 rounded-lg p-3">
            <p className="text-[10px] text-black/30 dark:text-white/30 mb-1 font-mono uppercase tracking-wide">Slide {i+1}</p>
            <p className="text-sm text-black/80 dark:text-white/80 leading-relaxed">{s}</p>
          </div>
        ))}
        {view.slides.length === 0 && <p className="text-xs text-black/30 dark:text-white/30 text-center py-6">No text content found in slides</p>}
      </div>
    </div>
  );

  if (view.kind === "binary" || view.kind === "error") return (
    <div className="flex flex-col h-full overflow-hidden">
      <BackBar name={view.kind === "binary" ? view.name : view.name} onBack={back} />
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <FileIcon className="h-10 w-10 text-black/20 dark:text-white/20" />
        <div>
          <p className="text-sm font-medium text-black/70 dark:text-white/70">{view.name}</p>
          {view.kind === "binary" && <p className="text-xs text-black/40 dark:text-white/40 mt-1">{fmt(view.size)}</p>}
          {view.kind === "error" && <p className="text-xs text-red-400 mt-1">{view.message}</p>}
        </div>
        <p className="text-xs text-black/30 dark:text-white/30">Open in Shell tab or access via Samba</p>
      </div>
    </div>
  );

  // ── Directory listing ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-black/10 dark:border-white/10 shrink-0">
        <button onClick={() => loadDir("/home/user")} title="Home"
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/50 dark:text-white/50">
          <Home className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { const p=dir.split("/").filter(Boolean); if(p.length>1) loadDir("/"+p.slice(0,-1).join("/")); }}
          title="Up" className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/50 dark:text-white/50 -rotate-90">
          <RefreshCw className="h-3 w-3" />
        </button>
        <span className="flex-1 text-[10px] text-black/40 dark:text-white/40 truncate font-mono">{dir}</span>
        <button onClick={() => loadDir(dir)} title="Refresh"
          className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-black/50 dark:text-white/50 ${listLoading ? "animate-spin" : ""}`}>
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {listError && <p className="text-xs text-red-400 px-3 py-2">{listError}</p>}
        {entries.map(e => (
          <button key={e.name} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-black/5 dark:border-white/5"
            onClick={() => open(e)}>
            {e.type === "directory"
              ? <Folder className="h-3.5 w-3.5 shrink-0 text-black/40 dark:text-white/40" />
              : <FileIcon className="h-3.5 w-3.5 shrink-0 text-black/30 dark:text-white/30" />}
            <span className="text-xs text-black/80 dark:text-white/80 truncate">{e.name}</span>
            {e.type === "file" && e.size !== undefined &&
              <span className="text-[10px] text-black/30 dark:text-white/30 ml-auto shrink-0">{fmt(e.size)}</span>}
          </button>
        ))}
        {!listLoading && entries.length === 0 && !listError &&
          <p className="text-xs text-black/30 dark:text-white/30 text-center py-6">Empty</p>}
      </div>
    </div>
  );
}

// ─── xterm Shell ─────────────────────────────────────────────────────────────

function ShellTab({ base }: { base: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const term = new XTerm({ theme:{background:"#000",foreground:"#f0f0f0",cursor:"#f0f0f0"}, fontFamily:"ui-monospace,'Cascadia Code',Menlo,Consolas,monospace", fontSize:12, cursorBlink:true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    const wsProto = window.location.protocol==="https:"?"wss:":"ws:";
    const wsBase = `${wsProto}//${window.location.host}${base}`;
    fetch(`${base}/api/terminals`, { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" })
      .then(r=>r.json()).then(({id}) => {
        const ws = new WebSocket(`${wsBase}/api/terminals/${id}`);
        ws.binaryType = "arraybuffer";
        ws.onopen = () => fit.fit();
        ws.onmessage = e => term.write(typeof e.data==="string"?e.data:new TextDecoder().decode(e.data));
        ws.onerror = () => term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
        ws.onclose = () => term.write("\r\n\x1b[33m[disconnected]\x1b[0m\r\n");
        term.onData(d => ws.readyState===WebSocket.OPEN && ws.send(d));
        term.onResize(({cols,rows}) => ws.readyState===WebSocket.OPEN && ws.send(JSON.stringify({type:"resize",cols,rows})));
        const ro = new ResizeObserver(() => fit.fit());
        ro.observe(ref.current!);
        return () => { ro.disconnect(); ws.close(); };
      }).catch(()=>term.write("\r\n\x1b[31m[failed to start terminal]\x1b[0m\r\n"));
    return () => { term.dispose(); };
  }, [base]);
  return <div ref={ref} className="h-full w-full bg-black" />;
}

// ─── Panel + drag handle ──────────────────────────────────────────────────────

export function TerminalPanel({ base, width, onResize, onClose }: TerminalPanelProps) {
  const [tab, setTab] = useState<"files"|"shell">("files");
  const [maximized, setMaximized] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      onResize(Math.max(240, Math.min(window.innerWidth - 320, dragRef.current.startW + delta)));
    };
    const up = () => { dragRef.current = null; document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return (
    <div className="flex h-full">
      {/* Drag handle */}
      {!maximized && (
        <div onMouseDown={onDragStart}
          className="w-1 shrink-0 cursor-col-resize hover:bg-black/20 dark:hover:bg-white/20 transition-colors bg-black/10 dark:bg-white/10" />
      )}

      {/* Panel body */}
      <div className={`flex flex-col border-l border-black/10 dark:border-white/10 bg-white dark:bg-black ${maximized ? "flex-1" : ""}`}
        style={maximized ? undefined : { width: width - 4 }}>

        {/* Header */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-black/10 dark:border-white/10 shrink-0">
          {(["files","shell"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors capitalize ${tab===t ? "bg-black/10 dark:bg-white/10 text-black dark:text-white font-medium" : "text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"}`}>
              {t==="files" ? <Folder className="h-3 w-3"/> : <Terminal className="h-3 w-3"/>}
              {t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setMaximized(v=>!v)}
              className="p-1 rounded text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
              title={maximized ? "Restore" : "Maximize"}>
              {maximized ? <Minimize2 className="h-3.5 w-3.5"/> : <Maximize2 className="h-3.5 w-3.5"/>}
            </button>
            <button onClick={onClose}
              className="p-1 rounded text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5">
              <X className="h-3.5 w-3.5"/>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab==="files" ? <FileBrowser base={base}/> : <ShellTab base={base}/>}
        </div>
      </div>
    </div>
  );
}
