"use client";

import { useState, useEffect, useMemo } from "react";
import { ImageOff, Loader2, RefreshCw, X } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";

const FUNCTIONS_BASE = (process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/gdrive-gallery";

async function fetchGalleryList(email) {
  if (!email) throw new Error("Belum login");
  const res = await fetch(`${FUNCTIONS_BASE}?action=list&caller_email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`Gagal memuat gallery (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.reason === "not_configured" ? "Integrasi Google Drive belum dikonfigurasi." : "Gagal memuat gallery.");
  return data.items || [];
}

async function fetchImageBlobUrl(email, id) {
  if (!email) throw new Error("Belum login");
  const res = await fetch(`${FUNCTIONS_BASE}?action=image&id=${encodeURIComponent(id)}&caller_email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`Gagal memuat foto (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

const UNLINKED_KEY = "__unlinked__";

export default function GalleryPage() {
  return (
    <MartaShell active="gallery" title="Gallery" subtitle="Preview foto dokumentasi POSM langsung dari Google Drive.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState("Semua Region");
  const [preview, setPreview] = useState(null); // { id, name }

  async function load() {
    if (!email) return;
    setLoading(true); setErr("");
    try { setItems(await fetchGalleryList(email)); }
    catch (e) { setErr(e.message || "Gagal memuat gallery"); setItems([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [email]);

  const regions = useMemo(() => {
    const set = new Set((items || []).map((i) => i.region || "Lainnya"));
    return ["Semua Region", ...Array.from(set).sort()];
  }, [items]);

  const groups = useMemo(() => {
    const filtered = (items || []).filter((i) => regionFilter === "Semua Region" || (i.region || "Lainnya") === regionFilter);
    const map = new Map();
    for (const it of filtered) {
      const key = it.plan_name ? `${it.plan_name}` : UNLINKED_KEY;
      if (!map.has(key)) map.set(key, { plan_name: it.plan_name, items: [] });
      map.get(key).items.push(it);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.plan_name === b.plan_name) return 0;
      if (!a.plan_name) return 1;
      if (!b.plan_name) return -1;
      return a.plan_name.localeCompare(b.plan_name);
    });
    return arr;
  }, [items, regionFilter]);

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 12.5, fontWeight: 600, color: T.hi, background: "#fff" }}>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12.5, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
          {loading ? <Loader2 size={14} style={{ animation: "mh-spin .8s linear infinite" }} /> : <RefreshCw size={14} />} Muat ulang
        </button>
      </div>

      {err && (
        <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.error}`, background: T.errorBg, color: T.error, fontSize: 12.5, marginBottom: 16 }}>{err}</div>
      )}

      {items === null && !err && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.lo, fontSize: 13, padding: "40px 0", justifyContent: "center" }}>
          <Loader2 size={16} style={{ animation: "mh-spin .8s linear infinite" }} /> Memuat foto dari Google Drive…
        </div>
      )}

      {items !== null && items.length === 0 && !err && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: T.lo, fontSize: 13, padding: "60px 0" }}>
          <ImageOff size={28} />
          Belum ada foto di folder Google Drive.
        </div>
      )}

      {groups.map((g) => (
        <PlanGroup key={g.plan_name || UNLINKED_KEY} planName={g.plan_name} items={g.items} onPreview={setPreview} email={email} />
      ))}

      {preview && <PreviewModal item={preview} email={email} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PlanGroup({ planName, items, onPreview, email }) {
  const byBranch = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.branch_name || "Belum diketahui";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.hi }}>{planName || "Belum terhubung ke Plan"}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.lo, background: "#F1F2F5", borderRadius: 999, padding: "2px 8px" }}>{items.length} foto</span>
      </div>
      {byBranch.map(([branch, branchItems]) => (
        <div key={branch} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 8 }}>{branch}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {branchItems.map((it) => <Thumb key={it.id} item={it} onPreview={onPreview} email={email} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Thumb({ item, onPreview, email }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    let objUrl = null;
    fetchImageBlobUrl(email, item.id).then((u) => { if (alive) { objUrl = u; setUrl(u); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [item.id, email]);

  return (
    <div onClick={() => url && onPreview(item)}
      style={{ position: "relative", width: "100%", paddingTop: "100%", borderRadius: 10, overflow: "hidden", background: "#F1F2F5", border: `1px solid ${T.line}`, cursor: url ? "pointer" : "default" }}>
      {url ? (
        <img src={url} alt={item.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : failed ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.lo }}><ImageOff size={18} /></div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.lo }}><Loader2 size={16} style={{ animation: "mh-spin .8s linear infinite" }} /></div>
      )}
    </div>
  );
}

function PreviewModal({ item, onClose, email }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    let objUrl = null;
    fetchImageBlobUrl(email, item.id).then((u) => { if (alive) { objUrl = u; setUrl(u); } });
    return () => { alive = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [item.id, email]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "88vh", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -14, right: -14, width: 32, height: 32, borderRadius: 999, border: "none", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }}>
          <X size={16} />
        </button>
        {url ? (
          <img src={url} alt={item.name} style={{ maxWidth: "92vw", maxHeight: "80vh", borderRadius: 10, display: "block" }} />
        ) : (
          <div style={{ width: 300, height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={22} color="#fff" style={{ animation: "mh-spin .8s linear infinite" }} /></div>
        )}
        <div style={{ marginTop: 10, color: "#fff", fontSize: 12, textAlign: "center" }}>
          {item.name} {item.branch_name ? `· ${item.branch_name}` : ""} {item.plan_name ? `· ${item.plan_name}` : ""}
        </div>
      </div>
    </div>
  );
}
