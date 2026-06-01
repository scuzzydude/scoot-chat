import { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

// ─── DATA — loaded from tracker API ─────────────────────────────────────────
// DB fields mapped to short names: baidx→n, idf→i, title→t, series→s,
// authors→a, project→p, status→st, law_firm→f, attorney→at, priority→pr
const API_BASE = "http://10.238.64.17:9200";

function mapRow(r) {
  return {
    n:   r.baidx,
    i:   r.idf,
    ri:  r.related_idfs || [],
    t:   r.title,
    s:   r.series,
    a:   r.authors,
    p:   r.project,
    st:  r.status,
    f:   r.law_firm,
    at:  r.attorney,
    pr:  r.priority,
    lt:  r.legal_tranche ?? 0,
  };
}

// Legal-tranche integer → "LT001" / "LT042". LT000 = unassigned.
const ltLabel = (lt) => "LT" + String(lt ?? 0).padStart(3, "0");

// Placeholder — replaced by live data once API loads
let D = [];

// ─── LOOKUP TABLES ────────────────────────────────────────────────────────────
const SL = {
  "Core":{t:"Fabric / PCIe / Bridges",c:"#4fc3f7"},
  "A":{t:"Pipe-Fittings",c:"#81c784"},
  "B":{t:"NAND-Bridge",c:"#ffb74d"},
  "D":{t:"Legacy RAID / Governors",c:"#ce93d8"},
  "E":{t:"Mechanical Media Units",c:"#f48fb1"},
  "F":{t:"Geometry-Controlled NAND",c:"#80cbc4"},
  "G":{t:"Bridge-in-Package",c:"#fff176"},
  "H":{t:"Chimney / Passive Thermal",c:"#ff8a65"},
  "I":{t:"In-Band Control / Identity",c:"#80deea"},
  "J":{t:"Robotic Service Layer",c:"#a5d6a7"},
  "K":{t:"Security / ECC",c:"#ef9a9a"},
  "L":{t:"Physical Tiering",c:"#b39ddb"},
  "M":{t:"Wear-State / Solar Archive",c:"#ffe082"},
  "N":{t:"Stripe Elasticity",c:"#f0f4c3"},
  "O":{t:"Concurrency / Latency",c:"#b2dfdb"},
  "V":{t:"Immersion Fabric",c:"#90caf9"},
  "W":{t:"Liquid Cooling Economics",c:"#80d8ff"},
  "X":{t:"PCIe Fabric QoS",c:"#ff80ab"},
  "Y":{t:"PCIe Fabric Egress",c:"#f9a8d4"},
  "AA":{t:"GTC — Awbrey In-Person",c:"#67e8f9"},
  "AB":{t:"GTC — Awbrey Online",c:"#a7f3d0"},
  "AC":{t:"GTC — Rodriguez Online",c:"#fca5a5"},
  "P":{t:"Write Economics",c:"#fed7aa"},
  "Q":{t:"Checkpoint Architecture",c:"#fde68a"},
  "R":{t:"Predictive Topology",c:"#bbf7d0"},
  "S":{t:"Small Object Storage",c:"#e9d5ff"},
  "T":{t:"Small Object Container",c:"#fecdd3"},
  "U":{t:"Object-Class Fabric Economics",c:"#d1fae5"},
};

const STATUS_CFG = {
  "Filed":       {bg:"#0d3d1f",bd:"#22c55e",tx:"#4ade80",d:"#22c55e"},
  "To Be Filed": {bg:"#2d1b00",bd:"#f59e0b",tx:"#fbbf24",d:"#f59e0b"},
  "Pre-Ranking": {bg:"#1c1c1c",bd:"#6b7280",tx:"#9ca3af",d:"#6b7280"},
  "Draft":       {bg:"#1a0d00",bd:"#b45309",tx:"#d97706",d:"#b45309"},
  "Submitted":   {bg:"#0d1a2e",bd:"#3b82f6",tx:"#93c5fd",d:"#3b82f6"},
  "Pending":     {bg:"#1a1a2e",bd:"#8b5cf6",tx:"#c4b5fd",d:"#8b5cf6"},
  "Closed":      {bg:"#2d0d0d",bd:"#ef4444",tx:"#fca5a5",d:"#ef4444"},
  "Deleted":     {bg:"#1a1a1a",bd:"#525252",tx:"#737373",d:"#525252"},
};
const gsc = (s) => STATUS_CFG[s] || {bg:"#111",bd:"#374151",tx:"#6b7280",d:"#374151"};

const PROJECT_COLOR = {
  "Bregman":"#f59e0b","Baker":"#67e8f9","Altuve":"#a7f3d0","AISSD":"#f9a8d4",
  "Verlander":"#c4b5fd","Springer":"#86efac","Correa":"#fca5a5","Gurriel":"#fde68a",
  "McCullers":"#f0abfc","Keuchel":"#7dd3fc","Morton":"#d4d4d8","Peacock":"#5eead4",
  "Reddick":"#fb923c","Pressly":"#f87171","Javier":"#a3e635","Valdez":"#94a3b8",
};
const PROJECT_LABEL = {
  "Bregman":"Fairchild Grid NAND Storage","Baker":"AI Factory Infrastructure",
  "Altuve":"Hyperscale Storage Follow-On","AISSD":"SSD / PMR Specific",
  "Verlander":"Bespoke Engineering","Springer":"MCU — PIC/AVR/SAM",
  "Correa":"MPU","Gurriel":"Analog & Power","McCullers":"Security & Crypto",
  "Keuchel":"FPGA / PLD","Morton":"Aerospace & Defense","Peacock":"Timing & Comms",
  "Reddick":"Connectivity & Networking","Pressly":"SiC / High-Voltage",
  "Javier":"Medical & Sensors","Valdez":"Memory / Legacy Flash",
};
const AUTHOR_COLOR = {"BA":"#fbbf24","ARS":"#a5b4fc","AR":"#86efac","AS":"#fca5a5"};
const AUTHOR_NAME  = {"BA":"Awbrey","ARS":"Awbrey / Shukla / Rodriguez","AR":"Awbrey / Rodriguez","AS":"Awbrey / Shukla"};
const PRIO_CFG = {
  "1-Critical":{c:"#f87171",l:"P1"},
  "2-High":    {c:"#fb923c",l:"P2"},
  "3-Medium":  {c:"#facc15",l:"P3"},
  "4-Low":     {c:"#6b7280",l:"P4"},
};

const STATUSES = ["Filed","To Be Filed","Pre-Ranking","Draft","Submitted","Pending","Closed","Deleted","—"];
const PROJ_ORDER = ["Bregman","Baker","Altuve","AISSD","Verlander",
  "Springer","Correa","Gurriel","McCullers","Keuchel",
  "Morton","Peacock","Reddick","Pressly","Javier","Valdez",""];

function calcPrio(inv) {
  const { s, st } = inv;
  if (!st || st === "DELETED" || st === "Deleted" || st === "Closed") return "4-Low";
  if (st === "Filed")          return "1-Critical";
  if (s  === "F")              return "1-Critical";
  if (st === "To Be Filed")   return "2-High";
  if (s  === "AA" || s === "AB" || s === "AC") return "2-High";
  if (st === "Pre-Ranking")
    return ["Core","A","B","D","I","K","X","Y"].includes(s) ? "2-High" : "3-Medium";
  if (st === "Draft")          return "3-Medium";
  return "4-Low";
}

// active is now React state — see useEffect in BregmanTracker()

// ─── BADGES ──────────────────────────────────────────────────────────────────
const mono = "'IBM Plex Mono', monospace";

function StatusBadge({ s }) {
  const c = gsc(s);
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,background:c.bg,
      border:`1px solid ${c.bd}`,color:c.tx,borderRadius:3,padding:"2px 8px",
      fontSize:11,fontFamily:mono,whiteSpace:"nowrap"}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:c.d,flexShrink:0}}/>
      {s || "—"}
    </span>
  );
}
function SeriesBadge({ s }) {
  const c = SL[s] || {};
  return (
    <span style={{background:"#111",border:`1px solid ${c.c||"#374151"}`,
      color:c.c||"#9ca3af",borderRadius:2,padding:"1px 7px",fontSize:11,
      fontFamily:mono,fontWeight:700}}>{s}</span>
  );
}
function ProjectBadge({ p }) {
  const c = PROJECT_COLOR[p] || "#374151";
  return p ? (
    <span style={{background:"#111",border:`1px solid ${c}`,color:c,borderRadius:2,
      padding:"1px 7px",fontSize:10,fontFamily:mono,fontWeight:600,whiteSpace:"nowrap"}}>{p}</span>
  ) : null;
}
function AuthorBadge({ a }) {
  const c = AUTHOR_COLOR[a] || "#374151";
  return a ? (
    <span title={AUTHOR_NAME[a]||a} style={{background:"#111",border:`1px solid ${c}`,
      color:c,borderRadius:2,padding:"1px 7px",fontSize:10,fontFamily:mono,fontWeight:600}}>{a}</span>
  ) : null;
}
function PrioBadge({ inv }) {
  if (!inv || !inv.st) return null;
  const p = calcPrio(inv);
  const c = PRIO_CFG[p] || {c:"#374151",l:"—"};
  return (
    <span title={p} style={{background:"#111",border:`1px solid ${c.c}`,color:c.c,
      borderRadius:2,padding:"1px 6px",fontSize:10,fontFamily:mono,fontWeight:700,
      minWidth:24,textAlign:"center",display:"inline-block"}}>{c.l}</span>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function BregmanTracker() {
  const [D,       setD]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiErr,  setApiErr]  = useState(null);
  const [lastSync,setLastSync]= useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/inventions`)
      .then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); })
      .then(data => {
        setD(data.map(mapRow));
        setLastSync(new Date());
        setLoading(false);
      })
      .catch(e => {
        setApiErr(e.message);
        setLoading(false);
      });
    fetchQuotes();
  }, []);

  const active = D.filter(i => i.st !== "DELETED");

  const [q,   setQ]   = useState("");
  const [sf,  setSf]  = useState("All");
  const [stf, setStf] = useState("All");
  const [pf,  setPf]  = useState("All");
  const [af,  setAf]  = useState("All");
  const [rf,  setRf]  = useState("All");
  const [sc,  setSc]  = useState("n");
  const [sd,  setSd]  = useState("asc");
  const [view,setView]= useState("table");
  const [log,      setLog]      = useState([]);
  const [logLoad,  setLogLoad]  = useState(false);
  const [logBaidx, setLogBaidx] = useState("");
  const [logActor, setLogActor] = useState("");
  const [quotes,     setQuotes]     = useState([]);
  const [quotesLoad, setQuotesLoad] = useState(false);
  const [quotesDone, setQuotesDone] = useState(false);
  const [cardState, setCardState] = useState({ baidx: null, html: null, error: null });

  const openCard = async (baidx) => {
    setCardState({ baidx, html: null, error: null });
    try {
      const r = await fetch(`${API_BASE}/inventions/${baidx}/card`);
      if (r.status === 404) {
        setCardState({ baidx, html: null,
          error: `No infographic card available for BA-${String(baidx).padStart(4,'0')}.` });
        return;
      }
      if (!r.ok) throw new Error(`API ${r.status}`);
      const html = await r.text();
      setCardState({ baidx, html, error: null });
    } catch (e) {
      setCardState({ baidx, html: null, error: `Failed to load card: ${e.message}` });
    }
  };
  const closeCard = () => setCardState({ baidx: null, html: null, error: null });

  const [toast, setToast] = useState(null);  // {msg, kind} or null
  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2400);
  };

  // Helper to build the folder URL — the anchor's href does the actual
  // navigation so the browser can honor target="_blank" natively.
  const folderUrl = (baidx) => `${API_BASE}/patents/${baidx}`;

  useEffect(() => {
    if (cardState.baidx === null) return;
    const handler = (ev) => { if (ev.key === "Escape") closeCard(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cardState.baidx]);

  const fetchQuotes = () => {
    setQuotesLoad(true);
    fetch(API_BASE + "/quotes/pending")
      .then(r => r.json())
      .then(data => { setQuotes(data); setQuotesLoad(false); setQuotesDone(true); })
      .catch(() => setQuotesLoad(false));
  };

  const approveQuote = (id) => {
    fetch(`${API_BASE}/quotes/${id}/approve`, { method: "POST" })
      .then(r => r.json())
      .then(() => setQuotes(q => q.filter(x => x.id !== id)));
  };

  const deleteQuote = (id) => {
    fetch(`${API_BASE}/quotes/${id}`, { method: "DELETE" })
      .then(r => r.json())
      .then(() => setQuotes(q => q.filter(x => x.id !== id)));
  };

  const fetchLog = (baidx, actor) => {
    setLogLoad(true);
    const lp = new URLSearchParams({ limit: "200" });
    if (baidx) lp.append("baidx", baidx);
    if (actor)  lp.append("actor",  actor);
    fetch(API_BASE + "/audit?" + lp.toString())
      .then(r => r.json())
      .then(data => { setLog(data); setLogLoad(false); })
      .catch(() => setLogLoad(false));
  };

  const rows = useMemo(() => {
    let d = active;
    if (sf  !== "All") d = d.filter(i => i.s === sf);
    if (stf !== "All") { if (stf === "—") d = d.filter(i => !i.st); else d = d.filter(i => i.st === stf); }
    if (pf  !== "All") d = d.filter(i => i.p === pf);
    if (af  !== "All") d = d.filter(i => i.a === af);
    if (rf  !== "All") d = d.filter(i => calcPrio(i) === rf);
    if (q) {
      const ql = q.toLowerCase();
      d = d.filter(i => (i.t||"").toLowerCase().includes(ql)
        || String(i.n).includes(ql)
        || (i.i && String(i.i).includes(ql))
        || (i.at && i.at.toLowerCase().includes(ql)));
    }
    return [...d].sort((a, b) => {
      let av = a[sc], bv = b[sc];
      if (av == null) av = sd === "asc" ? 1e9 : -1e9;
      if (bv == null) bv = sd === "asc" ? 1e9 : -1e9;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      return av < bv ? (sd === "asc" ? -1 : 1) : av > bv ? (sd === "asc" ? 1 : -1) : 0;
    });
  }, [q, sf, stf, pf, af, rf, sc, sd, D]);

  const stats = useMemo(() => ({
    total:  active.length,
    filed:  active.filter(i => i.st === "Filed").length,
    tbf:    active.filter(i => i.st === "To Be Filed").length,
    pre:    active.filter(i => i.st === "Pre-Ranking").length,
    draft:  active.filter(i => i.st === "Draft").length,
    sub:    active.filter(i => i.st === "Submitted").length,
    pend:   active.filter(i => i.st === "Pending").length,
  }), [D]);

  const buildMatrix = useCallback((getKey, getItems) =>
    getKey().map(k => {
      const items = getItems(k);
      if (!items.length) return null;
      const row = { key: k };
      STATUSES.forEach(st => {
        row[st] = st === "—" ? items.filter(i => !i.st).length : items.filter(i => i.st === st).length;
      });
      row.total = items.length;
      return row;
    }).filter(Boolean), []);

  const mxData = useMemo(() =>
    buildMatrix(() => Object.keys(SL), k => active.filter(i => i.s === k)), [buildMatrix, D]);

  const pjData = useMemo(() =>
    buildMatrix(() => PROJ_ORDER, k => active.filter(i => (i.p||"") === (k||""))), [buildMatrix, D]);

  // Legal-tranche rollup — one row per assigned LT number, sorted ascending.
  // LT000 (unassigned) is excluded from the summary.
  const legalData = useMemo(() => {
    const tranches = Array.from(new Set(active.map(i => i.lt ?? 0)))
      .filter(lt => lt > 0)
      .sort((a,b) => a - b);
    return buildMatrix(() => tranches, lt => active.filter(i => (i.lt ?? 0) === lt));
  }, [buildMatrix, D]);

  const doSort = (col) => {
    if (sc === col) setSd(d => d === "asc" ? "desc" : "asc");
    else { setSc(col); setSd("asc"); }
  };

  const exportXLSX = () => {
    const data = rows.map(i => ({
      "BAIDX": i.n, "IDF #": i.i ?? "", "Project": i.p ?? "",
      "Series": i.s, "Author": i.a ?? "", "Priority": calcPrio(i),
      "Title": i.t, "Status": i.st ?? "—",
      "Law Firm": i.f ?? "", "Attorney": i.at ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:8},{wch:12},{wch:10},{wch:6},{wch:6},{wch:12},{wch:60},{wch:16},{wch:14},{wch:18}];
    XLSX.utils.book_append_sheet(wb, ws, "Inventions");
    XLSX.writeFile(wb, `Bregman_IP_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const anyFilter = q || sf!=="All" || stf!=="All" || pf!=="All" || af!=="All" || rf!=="All";

  const SortIcon = ({ col }) => sc !== col
    ? <span style={{color:"#374151",marginLeft:3}}>⇅</span>
    : <span style={{color:"#f59e0b",marginLeft:3}}>{sd === "asc" ? "↑" : "↓"}</span>;

  // Matrix/Project/Legal shared table row
  const MatrixRow = ({ row, labelEl, theme, onClick }) => (
    <tr style={{borderBottom:"1px solid #111",cursor:onClick?"pointer":"default"}} onClick={onClick}
      onMouseEnter={e => e.currentTarget.style.background="#141414"}
      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
      <td style={{padding:"9px 16px 9px 0"}}>{labelEl}</td>
      <td style={{padding:"9px 8px",color:"#6b7280",fontSize:11,maxWidth:220,
        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{theme}</td>
      {[...STATUSES, "total"].map(s => {
        const v = row[s === "total" ? "total" : s] || 0;
        const c = gsc(s === "—" ? "null" : s === "total" ? "null" : s);
        return (
          <td key={s} style={{padding:"9px 14px",textAlign:"center",
            color: v > 0 ? (s === "total" ? "#e5e7eb" : c.tx) : "#1f2937",
            fontWeight: s === "total" ? 700 : 400,
            fontSize: s === "total" ? 13 : 11}}>
            {v > 0 ? v : "·"}
          </td>
        );
      })}
    </tr>
  );

  const MatrixTotalsRow = () => (
    <tr style={{borderTop:"2px solid #1f2937"}}>
      <td colSpan={2} style={{padding:"10px 0",color:"#f59e0b",fontWeight:700,fontSize:11,letterSpacing:"0.08em"}}>TOTAL</td>
      {STATUSES.map(s => {
        const count = active.filter(i => s === "—" ? !i.st : i.st === s).length;
        const c = gsc(s === "—" ? "null" : s);
        return <td key={s} style={{padding:"10px 14px",textAlign:"center",color:count>0?c.tx:"#1f2937",fontWeight:600}}>{count||"·"}</td>;
      })}
      <td style={{padding:"10px 14px",textAlign:"center",color:"#f59e0b",fontWeight:700,fontSize:13}}>{stats.total}</td>
    </tr>
  );

  const MatrixHead = ({ firstCol }) => (
    <thead>
      <tr style={{borderBottom:"1px solid #1f2937"}}>
        <th style={{padding:"8px 16px 8px 0",textAlign:"left",color:"#4b5563",fontSize:10,letterSpacing:"0.1em",minWidth:80}}>{firstCol}</th>
        <th style={{padding:"8px 8px",textAlign:"left",color:"#4b5563",fontSize:10,letterSpacing:"0.08em",minWidth:200}}>THEME / SCOPE</th>
        {[...STATUSES, "TOTAL"].map(s => (
          <th key={s} style={{padding:"8px 14px",textAlign:"center",
            color: gsc(s==="—"?"null":s==="TOTAL"?"null":s).d,
            fontSize:10,letterSpacing:"0.08em",minWidth:80}}>
            {s.toUpperCase()}
          </th>
        ))}
      </tr>
    </thead>
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{background:"#0a0a0a",color:"#e5e7eb",height:"100vh",fontFamily:mono,display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
        input::placeholder { color: #4b5563; }
        select option { background: #1a1a1a; }
        tr.inv-row:hover td { background: #141414 !important; cursor: pointer; }
        tr.inv-row.active-row td { background: #1a1a0a !important; }
        .col-hdr:hover { color: #f59e0b !important; cursor: pointer; }
      `}</style>

      {/* API status banner */}
      {loading && (
        <div style={{background:"#1a1a00",borderBottom:"1px solid #b45309",padding:"8px 28px",
          fontSize:11,color:"#f59e0b",fontFamily:mono,letterSpacing:"0.08em"}}>
          ⟳ LOADING INVENTORY FROM DATABASE…
        </div>
      )}
      {apiErr && (
        <div style={{background:"#1a0000",borderBottom:"1px solid #ef4444",padding:"8px 28px",
          fontSize:11,color:"#f87171",fontFamily:mono,letterSpacing:"0.08em"}}>
          ✕ API ERROR: {apiErr} — showing cached data if available
        </div>
      )}

      {/* Header */}
      <div style={{borderBottom:"1px solid #1f2937",padding:"14px 28px",display:"flex",
        alignItems:"center",justifyContent:"space-between",background:"#0d0d0d",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:16}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:"0.12em",color:"#f59e0b"}}>
            BREGMAN / YORDAN
          </span>
          <span style={{color:"#4b5563",fontSize:11,letterSpacing:"0.1em"}}>
            IP TRACKER · {stats.total} ACTIVE · 28 SERIES{lastSync ? ` · LIVE ${lastSync.toLocaleTimeString()}` : ''}
          </span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={exportXLSX}
            style={{background:"#1a1a00",border:"1px solid #b45309",color:"#f59e0b",borderRadius:3,
              padding:"5px 14px",fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",
              cursor:"pointer",fontFamily:mono}}>
            ↓ EXPORT XLSX
          </button>
          {["table","matrix","project","legal","log","quotes"].map(v => (
            <button key={v} onClick={() => { setView(v); if (v==="quotes" && !quotesDone) fetchQuotes(); }}
              style={{background:view===v?"#1f2937":"transparent",
                border:`1px solid ${view===v?"#4b5563":"#1f2937"}`,
                color:view===v?"#e5e7eb":"#4b5563",borderRadius:3,padding:"5px 14px",
                fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",
                cursor:"pointer",fontFamily:mono}}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{display:"flex",gap:1,background:"#111",borderBottom:"1px solid #1f2937",
        overflowX:"auto",flexShrink:0}}>
        {[
          {label:"FILED",       val:stats.filed, color:"#22c55e"},
          {label:"TO BE FILED", val:stats.tbf,   color:"#f59e0b"},
          {label:"PRE-RANKING", val:stats.pre,   color:"#6b7280"},
          {label:"DRAFT",       val:stats.draft, color:"#b45309"},
          {label:"SUBMITTED",   val:stats.sub,   color:"#3b82f6"},
          {label:"PENDING",     val:stats.pend,  color:"#8b5cf6"},
          {label:"STEVE QUOTES",val:quotesDone ? quotes.length : "…", color:"#a78bfa",
           onClick:() => { setView("quotes"); if (!quotesDone) fetchQuotes(); }},
        ].map(s => (
          <div key={s.label} onClick={s.onClick||undefined}
            style={{flex:"1 1 auto",padding:"12px 20px",borderRight:"1px solid #1a1a1a",minWidth:110,
              cursor:s.onClick?"pointer":undefined}}>
            <div style={{fontSize:22,fontWeight:700,color:s.color,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:"0.05em"}}>{s.val}</div>
            <div style={{fontSize:10,color:"#4b5563",letterSpacing:"0.1em",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{padding:"12px 28px",borderBottom:"1px solid #1a1a1a",display:"flex",
        gap:12,flexWrap:"wrap",alignItems:"center",background:"#0d0d0d",flexShrink:0}}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search title, IDF, BAIDX, attorney..."
          style={{background:"#111",border:"1px solid #1f2937",color:"#e5e7eb",borderRadius:3,
            padding:"7px 12px",fontSize:12,fontFamily:mono,width:280,outline:"none"}}/>
        {[
          {label:"SERIES",   val:sf,  set:setSf,  opts:["All",...Object.keys(SL)]},
          {label:"STATUS",   val:stf, set:setStf, opts:["All","Filed","To Be Filed","Pre-Ranking","Draft","Submitted","Pending","Closed","Deleted","—"]},
          {label:"PROJECT",  val:pf,  set:setPf,  opts:["All","Bregman","Baker","Altuve","AISSD","Verlander","Springer","Correa","Gurriel","McCullers","Keuchel","Morton","Peacock","Reddick","Pressly","Javier","Valdez"]},
          {label:"AUTHOR",   val:af,  set:setAf,  opts:["All","BA","ARS","AR","AS"]},
          {label:"PRIORITY", val:rf,  set:setRf,  opts:["All","1-Critical","2-High","3-Medium","4-Low"]},
        ].map(f => (
          <div key={f.label} style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:10,color:"#4b5563",letterSpacing:"0.1em"}}>{f.label}</span>
            <select value={f.val} onChange={e => f.set(e.target.value)}
              style={{background:"#111",border:"1px solid #1f2937",color:"#e5e7eb",borderRadius:3,
                padding:"6px 10px",fontSize:12,fontFamily:mono,outline:"none",cursor:"pointer"}}>
              {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {anyFilter && (
          <button onClick={() => { setQ(""); setSf("All"); setStf("All"); setPf("All"); setAf("All"); setRf("All"); }}
            style={{background:"transparent",border:"1px solid #374151",color:"#6b7280",
              borderRadius:3,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:mono}}>
            ✕ CLEAR
          </button>
        )}
        <span style={{marginLeft:"auto",fontSize:11,color:"#4b5563"}}>{rows.length} results</span>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* TABLE VIEW */}
        {view === "table" && (
          <>
            <div style={{flex:1,overflowY:"auto",overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#0d0d0d",borderBottom:"1px solid #1f2937",
                    position:"sticky",top:0,zIndex:10}}>
                    {[
                      {col:"n",  label:"BAIDX",    w:70},
                      {col:"i",  label:"IDF #",     w:110},
                      {col:"s",  label:"SER",       w:60},
                      {col:"p",  label:"PROJECT",   w:90},
                      {col:"a",  label:"AUTHOR",    w:70},
                      {col:"_p", label:"PRI",       w:48},
                      {col:"lt", label:"LT",        w:60},
                      {col:"t",  label:"TITLE",     w:null},
                      {col:"st", label:"STATUS",    w:140},
                      {col:"f",  label:"FIRM",      w:120},
                      {col:"at", label:"ATTORNEY",  w:140},
                    ].map(h => (
                      <th key={h.col} className="col-hdr" onClick={() => doSort(h.col)}
                        style={{padding:"9px 12px",textAlign:"left",color:"#4b5563",fontSize:10,
                          letterSpacing:"0.1em",fontWeight:600,width:h.w||undefined,
                          borderRight:"1px solid #111",userSelect:"none",whiteSpace:"nowrap"}}>
                        {h.label}<SortIcon col={h.col}/>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(inv => (
                    <tr key={inv.n} className="inv-row">
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111",color:"#f59e0b",fontWeight:600,fontSize:11}}>
                        <a href={folderUrl(inv.n)} target="_blank" rel="noopener noreferrer"
                           title={`Open patent folder for BA-${String(inv.n).padStart(4,'0')} in a new tab`}
                           style={{color:"#f59e0b",textDecoration:"none",borderBottom:"1px dotted #f59e0b55"}}>
                          {inv.n}
                        </a>
                      </td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111",color:"#6b7280",fontSize:11}}>
                        {inv.i || <span style={{color:"#1f2937"}}>—</span>}
                        {inv.ri.length > 0 && (
                          <span title={`Also: ${inv.ri.join(", ")}`}
                            style={{color:"#4b5563",fontSize:10,marginLeft:6}}>
                            +{inv.ri.length}
                          </span>
                        )}
                      </td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111"}}><SeriesBadge s={inv.s}/></td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111"}}><ProjectBadge p={inv.p}/></td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111"}}><AuthorBadge a={inv.a}/></td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111",textAlign:"center"}}><PrioBadge inv={inv}/></td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111",color: inv.lt ? "#a78bfa" : "#1f2937",fontSize:11,whiteSpace:"nowrap",textAlign:"center"}}>
                        {inv.lt ? ltLabel(inv.lt) : "—"}
                      </td>
                      <td onClick={() => openCard(inv.n)}
                        title="Click to view infographic card"
                        style={{padding:"8px 12px",borderRight:"1px solid #111",color:"#e5e7eb",maxWidth:420,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>
                        {inv.t}
                      </td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111"}}><StatusBadge s={inv.st}/></td>
                      <td style={{padding:"8px 12px",borderRight:"1px solid #111",color:"#9ca3af",fontSize:11}}>{inv.f || <span style={{color:"#1f2937"}}>—</span>}</td>
                      <td style={{padding:"8px 12px",color:"#9ca3af",fontSize:11}}>{inv.at || <span style={{color:"#1f2937"}}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div style={{padding:"48px",textAlign:"center",color:"#374151",letterSpacing:"0.1em",fontSize:12}}>
                  NO RECORDS MATCH CURRENT FILTERS
                </div>
              )}
            </div>
          </>
        )}

        {/* MATRIX VIEW */}
        {view === "matrix" && (
          <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:28}}>
            <div style={{marginBottom:16,fontSize:11,color:"#4b5563",letterSpacing:"0.1em"}}>SERIES × STATUS DISTRIBUTION</div>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"auto"}}>
              <MatrixHead firstCol="SERIES"/>
              <tbody>
                {mxData.map(row => (
                  <MatrixRow key={row.key} row={row}
                    labelEl={<SeriesBadge s={row.key}/>}
                    theme={SL[row.key]?.t || ""}
                    onClick={() => { setSf(row.key); setView("table"); }}/>
                ))}
                <MatrixTotalsRow/>
              </tbody>
            </table>
            <div style={{marginTop:20,fontSize:10,color:"#374151",letterSpacing:"0.06em"}}>↩ CLICK ANY ROW TO FILTER TABLE BY SERIES</div>
          </div>
        )}

        {/* PROJECT VIEW */}
        {view === "project" && (
          <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:28}}>
            <div style={{marginBottom:16,fontSize:11,color:"#4b5563",letterSpacing:"0.1em"}}>PROJECT × STATUS DISTRIBUTION</div>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"auto"}}>
              <MatrixHead firstCol="PROJECT"/>
              <tbody>
                {pjData.map(row => {
                  const pc = PROJECT_COLOR[row.key] || "#374151";
                  return (
                    <MatrixRow key={row.key} row={row}
                      labelEl={
                        <span style={{background:"#111",border:`1px solid ${pc}`,color:pc,
                          borderRadius:2,padding:"1px 8px",fontSize:10,fontFamily:mono,
                          fontWeight:700,whiteSpace:"nowrap"}}>
                          {row.key || "—"}
                        </span>
                      }
                      theme={PROJECT_LABEL[row.key] || "—"}
                      onClick={() => { setPf(row.key || "All"); setView("table"); }}/>
                  );
                })}
                <MatrixTotalsRow/>
              </tbody>
            </table>
            <div style={{marginTop:20,fontSize:10,color:"#374151",letterSpacing:"0.06em"}}>↩ CLICK ANY ROW TO FILTER TABLE BY PROJECT</div>
          </div>
        )}

        {/* LEGAL VIEW */}
        {view === "legal" && (
          <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:28}}>
            <div style={{marginBottom:16,fontSize:11,color:"#4b5563",letterSpacing:"0.1em"}}>LEGAL TRANCHE × STATUS DISTRIBUTION</div>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"auto"}}>
              <MatrixHead firstCol="TRANCHE"/>
              <tbody>
                {legalData.map(row => (
                  <MatrixRow key={row.key} row={row}
                    labelEl={
                      <span style={{background:"#111",border:"1px solid #8b5cf6",color:"#c4b5fd",
                        borderRadius:2,padding:"1px 8px",fontSize:10,fontFamily:mono,
                        fontWeight:700,whiteSpace:"nowrap"}}>
                        {ltLabel(row.key)}
                      </span>
                    }
                    theme={row.key === 0 ? "unassigned" : ""}/>
                ))}
                <MatrixTotalsRow/>
              </tbody>
            </table>
            <div style={{marginTop:20,fontSize:10,color:"#374151",letterSpacing:"0.06em"}}>LEGAL TRANCHE IS ASSIGNED VIA PATCH (legal_tranche) · UNASSIGNED (LT000) EXCLUDED FROM SUMMARY</div>
          </div>
        )}

        {/* LOG VIEW */}
        {view === "log" && (
          <div style={{flex:1,overflowY:"auto",padding:28}}>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#4b5563",letterSpacing:"0.1em"}}>TRANSACTION LOG</span>
              <input value={logBaidx} onChange={e => setLogBaidx(e.target.value)}
                placeholder="Filter BAIDX..."
                style={{background:"#111",border:"1px solid #1f2937",color:"#e5e7eb",
                  borderRadius:3,padding:"6px 10px",fontSize:12,fontFamily:mono,
                  width:140,outline:"none"}}/>
              <input value={logActor} onChange={e => setLogActor(e.target.value)}
                placeholder="Filter actor..."
                style={{background:"#111",border:"1px solid #1f2937",color:"#e5e7eb",
                  borderRadius:3,padding:"6px 10px",fontSize:12,fontFamily:mono,
                  width:160,outline:"none"}}/>
              <button onClick={() => fetchLog(logBaidx, logActor)}
                style={{background:"#1a1a00",border:"1px solid #b45309",color:"#f59e0b",
                  borderRadius:3,padding:"6px 14px",fontSize:11,cursor:"pointer",
                  fontFamily:mono,letterSpacing:"0.08em"}}>
                {logLoad ? "LOADING…" : "REFRESH"}
              </button>
              <span style={{fontSize:11,color:"#4b5563"}}>{log.length} entries</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"#0d0d0d",borderBottom:"1px solid #1f2937",
                  position:"sticky",top:0,zIndex:10}}>
                  {["WHEN","BAIDX","ACTOR","FIELD","FROM","TO"].map(h => (
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#4b5563",
                      fontSize:10,letterSpacing:"0.1em",fontWeight:600,
                      borderRight:"1px solid #111"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map(r => (
                  <tr key={r.id} style={{borderBottom:"1px solid #0d0d0d"}}
                    onMouseEnter={e => e.currentTarget.style.background="#141414"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#6b7280",fontSize:11,whiteSpace:"nowrap"}}>
                      {String(r.changed_at).replace("T"," ").slice(0,19)}
                    </td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#f59e0b",fontWeight:600,fontSize:11,cursor:"pointer"}}
                      onClick={() => openCard(r.baidx)}
                      title="Click to view infographic card">
                      {r.baidx}
                    </td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#818cf8",fontSize:11}}>{r.changed_by}</td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#fbbf24",fontSize:11}}>{r.field_name}</td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#9ca3af",fontSize:11,maxWidth:180,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.old_value !== null && r.old_value !== undefined ? String(r.old_value) : "—"}
                    </td>
                    <td style={{padding:"7px 12px",color:"#4ade80",fontSize:11,
                      maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {r.new_value !== null && r.new_value !== undefined ? String(r.new_value) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && !logLoad && (
              <div style={{padding:"48px",textAlign:"center",color:"#374151",
                letterSpacing:"0.1em",fontSize:12}}>
                NO LOG ENTRIES — run a sync from Steve to populate
              </div>
            )}
          </div>
        )}

        {/* ─── QUOTES VIEW ────────────────────────────────────────────────── */}
        {view === "quotes" && (
          <div style={{flex:1,overflowY:"auto",padding:28}}>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#4b5563",letterSpacing:"0.1em"}}>STEVE QUOTES — PENDING VERIFICATION</span>
              <button onClick={fetchQuotes}
                style={{background:"#1a1a00",border:"1px solid #b45309",color:"#f59e0b",
                  borderRadius:3,padding:"6px 14px",fontSize:11,cursor:"pointer",
                  fontFamily:mono,letterSpacing:"0.08em"}}>
                {quotesLoad ? "LOADING…" : "REFRESH"}
              </button>
              <span style={{fontSize:11,color:"#4b5563"}}>{quotes.length} pending</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"#0d0d0d",borderBottom:"1px solid #1f2937",
                  position:"sticky",top:0,zIndex:10}}>
                  {["PERSON","TYPE","QUOTE","ACTIONS"].map(h => (
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#4b5563",
                      fontSize:10,letterSpacing:"0.1em",fontWeight:600,
                      borderRight:"1px solid #111"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} style={{borderBottom:"1px solid #0d0d0d"}}
                    onMouseEnter={e => e.currentTarget.style.background="#141414"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#f59e0b",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>
                      {q.name}
                    </td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#818cf8",fontSize:11,whiteSpace:"nowrap",fontStyle:"italic"}}>
                      {q.type}
                    </td>
                    <td style={{padding:"7px 12px",borderRight:"1px solid #111",
                      color:"#e5e7eb",fontSize:11,maxWidth:540,lineHeight:1.5}}>
                      {q.quote_text}
                    </td>
                    <td style={{padding:"7px 12px",whiteSpace:"nowrap"}}>
                      <button onClick={() => approveQuote(q.id)}
                        style={{background:"#0d1a0d",border:"1px solid #22c55e",color:"#4ade80",
                          borderRadius:3,padding:"4px 12px",fontSize:10,cursor:"pointer",
                          fontFamily:mono,letterSpacing:"0.08em",marginRight:6}}>
                        APPROVE
                      </button>
                      <button onClick={() => deleteQuote(q.id)}
                        style={{background:"#1a0d0d",border:"1px solid #ef4444",color:"#fca5a5",
                          borderRadius:3,padding:"4px 12px",fontSize:10,cursor:"pointer",
                          fontFamily:mono,letterSpacing:"0.08em"}}>
                        DELETE
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {quotes.length === 0 && !quotesLoad && (
              <div style={{padding:"48px",textAlign:"center",color:"#374151",
                letterSpacing:"0.1em",fontSize:12}}>
                ALL QUOTES VERIFIED — nothing pending
              </div>
            )}
          </div>
        )}

      </div>

      {/* ─── TOAST ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          zIndex:2000,padding:"10px 18px",borderRadius:4,
          background: toast.kind === "err" ? "#2d0d0d" : "#0d1a2e",
          border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#3b82f6"}`,
          color:  toast.kind === "err" ? "#fca5a5" : "#93c5fd",
          fontFamily:mono,fontSize:12,letterSpacing:"0.03em",
          boxShadow:"0 4px 14px rgba(0,0,0,0.5)",maxWidth:"90vw",
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {toast.msg}
        </div>
      )}

      {/* ─── INFOGRAPHIC CARD MODAL ─────────────────────────────────────── */}
      {cardState.baidx !== null && (
        <div onClick={closeCard}
          style={{position:"fixed",top:0,left:0,right:0,bottom:0,
            background:"rgba(0,0,0,0.78)",zIndex:1000,
            display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={(e) => e.stopPropagation()}
            style={{width:"100%",maxWidth:920,height:"92vh",
              background:"#0d0d0d",border:"1px solid #1f2937",borderRadius:6,
              position:"relative",overflow:"hidden",
              display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",padding:"8px 14px",
              borderBottom:"1px solid #1f2937",background:"#08080e",flexShrink:0}}>
              <span style={{color:"#4b5563",fontSize:10,letterSpacing:"0.12em",fontFamily:mono}}>
                BA-{String(cardState.baidx).padStart(4,'0')} INFOGRAPHIC CARD
              </span>
              <button onClick={closeCard}
                style={{background:"transparent",border:"none",color:"#9ca3af",
                  fontSize:18,cursor:"pointer",padding:"2px 8px"}}>✕</button>
            </div>
            <div style={{flex:1,overflow:"hidden",background:"#0d0d0d"}}>
              {cardState.error ? (
                <div style={{padding:40,textAlign:"center",color:"#6b7280",
                  fontSize:13,letterSpacing:"0.05em",lineHeight:1.6}}>
                  {cardState.error}
                </div>
              ) : cardState.html === null ? (
                <div style={{padding:40,textAlign:"center",color:"#4b5563",
                  fontFamily:mono,fontSize:11,letterSpacing:"0.1em"}}>
                  LOADING…
                </div>
              ) : (
                <iframe srcDoc={cardState.html} title="IDF card"
                  style={{width:"100%",height:"100%",border:"none",background:"#0d0d0d"}}/>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
