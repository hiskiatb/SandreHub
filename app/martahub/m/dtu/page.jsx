"use client";
/**
 * /martahub/m/dtu - "Report DTU" (mobile). Tanggal di atas, ringkasan Total
 * SP/FWA bulan ini + hari ini, daftar MC dengan target per MC. Tap satu MC
 * -> sheet catat penjualan per kegiatan, qty DIPECAH SP & FWA (ikon/warna
 * SAMA PERSIS dgn CardSim/Router di submit Activity Plan - "ambil ikon yg
 * sudah ada" permintaan user), masing2 bisa ditambah daftar MSISDN sendiri
 * (SP terpisah dari FWA).
 *
 * Scope branch:
 *  - Role lapangan (branch_id terkunci di profil) -> langsung branch sendiri.
 *  - Role unscoped (head/tmv/spm_sumatera/admin) -> picker Region -> Branch.
 *
 * Data terpisah total dari Activity Plan/MSISDN existing - tabel sendiri
 * (mh_dtu_actuals qty SP/FWA, mh_dtu_actual_msisdn tagged per sp_fwa),
 * kategori+target tetap baca dari mh_daily_target_categories/mh_daily_targets
 * (CMS Target Harian) supaya satu sumber kebenaran target.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target, CalendarDays, ChevronRight, ChevronDown, Loader2, Check, MapPin, Building2, Plus, X, CardSim, Router, Share2, RefreshCw } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import BottomSheet from "../_shared/BottomSheet";
import { isValidMsisdn } from "../_shared/msisdn";

const SP_FWA = {
  sp: { icon: CardSim, color: "#ED1C24", bg: "rgba(237,28,36,0.08)", label: "SP" },
  fwa: { icon: Router, color: "#C6168D", bg: "rgba(236,0,140,0.08)", label: "FWA" },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtNum(n) {
  return Number(n || 0).toLocaleString("id-ID");
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function toMsisdn62(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

const selStyle = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #ECEDF0", background: "#fff", fontSize: 13, fontWeight: 700, color: "#17181C", appearance: "none" };

export default function DtuPage() {
  const router = useRouter();
  const { loading: sessionLoading, email } = useMartaSession();
  const [date, setDate] = useState(todayStr());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mcSheet, setMcSheet] = useState(null);

  const [rbList, setRbList] = useState([]);
  const [region, setRegion] = useState(() => {
    try { return localStorage.getItem("mh_dtu_region_filter") || ""; } catch { return ""; }
  });
  const [branchId, setBranchId] = useState(() => {
    try { return localStorage.getItem("mh_dtu_branch_filter") || ""; } catch { return ""; }
  });

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_dtu_summary", { p_caller_email: email, p_date: date, p_branch_id: branchId || null });
    if (!error) setSummary(data || null);
    setLoading(false);
  }, [email, date, branchId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!summary?.unscoped || rbList.length) return;
    supabaseMarta.rpc("mh_dtu_region_branch_list", { p_month: currentYYYYMM() }).then(({ data }) => setRbList(data || []));
  }, [summary?.unscoped, rbList.length]);

  const regions = useMemo(() => [...new Set(rbList.map((r) => r.region).filter(Boolean))].sort(), [rbList]);
  const branchesInRegion = useMemo(() => rbList.filter((r) => !region || r.region === region).sort((a, b) => a.branch_name.localeCompare(b.branch_name)), [rbList, region]);

  if (sessionLoading) return <MobileShell active="dtu"><ShellSpinner /></MobileShell>;

  const isUnscoped = !!summary?.unscoped;

  return (
    <MobileShell active="dtu">
      <div style={{ fontFamily: FF, padding: "calc(env(safe-area-inset-top,0px) + 22px) 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid #ECEDF0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ArrowLeft size={17} color="#17181C" />
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#17181C" }}>Report DTU</div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 14, padding: "11px 14px", marginBottom: 12 }}>
          <CalendarDays size={16} color="#9A9AA6" />
          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{fmtDateLabel(date)}</div>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} id="dtu-date-input" />
          <span onClick={() => document.getElementById("dtu-date-input")?.showPicker?.()} style={{ fontSize: 11.5, fontWeight: 700, color: "#ED1C24" }}>Ganti</span>
        </label>

        {isUnscoped && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> Region</div>
              <select value={region} onChange={(e) => {
                const v = e.target.value;
                setRegion(v); setBranchId("");
                try { localStorage.setItem("mh_dtu_region_filter", v); localStorage.removeItem("mh_dtu_branch_filter"); } catch {}
              }} style={selStyle}>
                <option value="">Semua Region</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}><Building2 size={11} /> Branch</div>
              <select value={branchId} onChange={(e) => {
                const v = e.target.value;
                setBranchId(v);
                try { localStorage.setItem("mh_dtu_branch_filter", v); } catch {}
              }} style={selStyle}>
                <option value="">Pilih branch…</option>
                {branchesInRegion.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
              </select>
            </label>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <SummaryCard label="Bulan Ini" target={summary?.target_month} sp={summary?.total_month_sp} fwa={summary?.total_month_fwa} loading={loading} />
          <SummaryCard label="Hari Ini" target={summary?.target_today} sp={summary?.total_today_sp} fwa={summary?.total_today_fwa} loading={loading} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>
            Pilih MC {summary?.branch_name ? <span style={{ fontWeight: 500, color: "#9A9AA6" }}>· {summary.branch_name}</span> : null}
          </div>
          <button onClick={load} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #ECEDF0", background: "#fff", borderRadius: 10, padding: "5px 10px", color: "#5A5A68", fontSize: 11.5, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={13} className={loading ? "mh-spin" : ""} /> Refresh
          </button>
        </div>

        {loading ? (
          <ShellSpinner minHeight="160px" />
        ) : isUnscoped && !summary?.branch_id ? (
          <EmptyBox text="Pilih Region dan Branch dulu di atas untuk lihat/isi MC-nya." />
        ) : !summary?.mcs?.length ? (
          <EmptyBox text="Belum ada data MC untuk branch ini di Master Data Site bulan ini." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.mcs.map((mc) => (
              <button key={mc.mc} onClick={() => setMcSheet(mc.mc)}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "13px 14px", textAlign: "left" }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Target size={16} color="#9A9AA6" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{mc.mc}</div>
                  <div style={{ fontSize: 11.5, color: "#9A9AA6", marginTop: 2 }}>
                    Target hari ini <b style={{ color: "#17181C" }}>{fmtNum(mc.target_today)}</b> · Actual <b style={{ color: "#17181C" }}>{fmtNum(mc.actual_today)}</b>
                  </div>
                </div>
                <ChevronRight size={16} color="#C6C7CE" />
              </button>
            ))}
          </div>
        )}
      </div>

      {mcSheet && (
        <McActualSheet email={email} mc={mcSheet} date={date} branchId={isUnscoped ? summary?.branch_id : null}
          onClose={() => setMcSheet(null)} onSaved={() => { setMcSheet(null); load(); }} />
      )}
    </MobileShell>
  );
}

function EmptyBox({ text }) {
  return (
    <div style={{ padding: "26px 16px", textAlign: "center", color: "#9A9AA6", fontSize: 12.5, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function SummaryCard({ label, target, sp, fwa, loading }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "13px 14px" }}>
      <div style={{ fontSize: 11, color: "#9A9AA6", fontWeight: 700, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px dashed #ECEDF0" }}>
          <div style={{ width: 24, height: 24, borderRadius: 8, background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Target size={12} color="#9A9AA6" />
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", width: 30 }}>Target</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C" }}>{loading ? "…" : fmtNum(target)}</div>
        </div>
        <StatLine kind="sp" value={sp} loading={loading} />
        <StatLine kind="fwa" value={fwa} loading={loading} />
      </div>
    </div>
  );
}

function StatLine({ kind, value, loading }) {
  const meta = SP_FWA[kind];
  const Icon = meta.icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 24, height: 24, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={12} color={meta.color} />
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", width: 30 }}>{meta.label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C" }}>{loading ? "…" : fmtNum(value)}</div>
    </div>
  );
}

function McActualSheet({ email, mc, date, branchId, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vals, setVals] = useState({});
  const [msisdns, setMsisdns] = useState({});
  const [msisdnDraft, setMsisdnDraft] = useState({});
  const [msisdnOpen, setMsisdnOpen] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_dtu_mc_detail", { p_caller_email: email, p_mc: mc, p_date: date, p_branch_id: branchId || null });
    if (!error && data) {
      setDetail(data);
      const nv = {}; const nm = {};
      for (const c of data.categories || []) {
        nv[c.category_id] = { sp: c.actual_sp_today != null ? String(c.actual_sp_today) : "", fwa: c.actual_fwa_today != null ? String(c.actual_fwa_today) : "" };
        nm[c.category_id] = { sp: c.msisdns_sp || [], fwa: c.msisdns_fwa || [] };
      }
      setVals(nv);
      setMsisdns(nm);
      setMsisdnOpen((prev) => {
        const next = { ...prev };
        for (const c of data.categories || []) {
          for (const kind of ["sp", "fwa"]) {
            const key = `${c.category_id}:${kind}`;
            if (!(key in next)) next[key] = true; // default terbuka - detail msisdn langsung kelihatan
          }
        }
        return next;
      });
    }
    setLoading(false);
  }, [email, mc, date, branchId]);
  useEffect(() => { reload(); }, [reload]);

  async function addMsisdns(categoryId, kind) {
    const key = `${categoryId}:${kind}`;
    const raw = msisdnDraft[key] || "";
    const lines = raw.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    const existing = new Set((msisdns[categoryId]?.[kind] || []).map((m) => m.msisdn));
    const toAdd = [...new Set(lines.map(toMsisdn62).filter((m) => isValidMsisdn(m) && !existing.has(m)))];
    if (!toAdd.length) { setMsisdnDraft((p) => ({ ...p, [key]: "" })); return; }
    const { error } = await supabaseMarta.rpc("mh_dtu_actual_msisdn_add_batch", {
      p_caller_email: email, p_date: date, p_mc: mc, p_category_id: categoryId, p_msisdns: toAdd, p_sp_fwa: kind, p_branch_id: branchId || null,
    });
    if (error) { setErr(error.message); return; }
    const added = toAdd.map((m) => ({ msisdn: m, name: null, role: null, source: "app", at: new Date().toISOString() }));
    setMsisdns((p) => ({ ...p, [categoryId]: { ...p[categoryId], [kind]: [...(p[categoryId]?.[kind] || []), ...added] } }));
    setMsisdnDraft((p) => ({ ...p, [key]: "" }));
  }

  async function removeMsisdn(categoryId, kind, msisdn) {
    setMsisdns((p) => ({ ...p, [categoryId]: { ...p[categoryId], [kind]: (p[categoryId]?.[kind] || []).filter((m) => m.msisdn !== msisdn) } }));
    const { error } = await supabaseMarta.rpc("mh_dtu_actual_msisdn_remove", {
      p_caller_email: email, p_date: date, p_mc: mc, p_category_id: categoryId, p_msisdn: msisdn, p_sp_fwa: kind, p_branch_id: branchId || null,
    });
    if (error) setErr(error.message);
  }

  async function save() {
    setSaving(true); setErr("");
    try {
      for (const c of detail?.categories || []) {
        const v = vals[c.category_id] || {};
        const nSp = v.sp === "" || v.sp == null ? 0 : Number(v.sp);
        const nFwa = v.fwa === "" || v.fwa == null ? 0 : Number(v.fwa);
        if (nSp === (c.actual_sp_today || 0) && nFwa === (c.actual_fwa_today || 0)) continue;
        const { error } = await supabaseMarta.rpc("mh_dtu_actual_upsert", {
          p_caller_email: email, p_date: date, p_mc: mc, p_category_id: c.category_id,
          p_actual_sp: nSp, p_actual_fwa: nFwa, p_branch_id: branchId || null,
        });
        if (error) throw new Error(error.message);
      }
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan pencatatan penjualan"); }
    finally { setSaving(false); }
  }

  return (
    <BottomSheet onClose={onClose} zIndex={200} borderRadius="24px 24px 0 0">
      <div style={{ padding: "4px 20px 28px", fontFamily: FF, maxHeight: "82vh", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", marginBottom: 2 }}>{mc}</div>
        <div style={{ fontSize: 11.5, color: "#9A9AA6", marginBottom: 14 }}>Catat penjualan per kegiatan - {fmtDateLabel(date)}</div>

        {err && <div style={{ background: "#FFF1F0", border: "1px solid #FFCCC7", color: "#C62828", borderRadius: 10, padding: "8px 11px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

        {loading ? (
          <ShellSpinner minHeight="120px" />
        ) : !detail?.categories?.length ? (
          <div style={{ padding: "18px 10px", textAlign: "center", color: "#9A9AA6", fontSize: 12.5 }}>
            Belum ada kegiatan aktif - tambahkan dulu di CMS Target Harian.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
            {detail.categories.map((c) => (
              <CategoryCard key={c.category_id} c={c} email={email} mc={mc} date={date} branchId={branchId}
                vals={vals[c.category_id] || { sp: "", fwa: "" }}
                onChangeVal={(kind, val) => setVals((p) => ({ ...p, [c.category_id]: { ...p[c.category_id], [kind]: val } }))}
                msisdns={msisdns[c.category_id] || { sp: [], fwa: [] }}
                msisdnOpen={msisdnOpen} setMsisdnOpen={setMsisdnOpen}
                msisdnDraft={msisdnDraft} setMsisdnDraft={setMsisdnDraft}
                onAddMsisdn={addMsisdns} onRemoveMsisdn={removeMsisdn} />
            ))}
          </div>
        )}

        <button onClick={save} disabled={saving || loading || !detail?.categories?.length}
          style={{ width: "100%", padding: "13px", borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: saving || loading ? 0.7 : 1 }}>
          {saving ? <Loader2 size={15} className="mh-spin" /> : <Check size={15} />} {saving ? "Menyimpan…" : "Simpan Pencatatan Penjualan"}
        </button>
      </div>
    </BottomSheet>
  );
}

function CategoryCard({ c, email, mc, date, branchId, vals, onChangeVal, msisdns, msisdnOpen, setMsisdnOpen, msisdnDraft, setMsisdnDraft, onAddMsisdn, onRemoveMsisdn }) {
  const [sharing, setSharing] = useState(false);

  async function share() {
    if (!c.needs_msisdn) return;
    setSharing(true);
    try {
      const { data, error } = await supabaseMarta.rpc("mh_dtu_share_link_get_or_create", {
        p_caller_email: email, p_date: date, p_mc: mc, p_category_id: c.category_id, p_branch_id: branchId || null,
      });
      if (error) throw new Error(error.message);
      const url = `${window.location.origin}/martahub/public/dtu/${data.token}`;
      const text = `Isi MSISDN penjualan ${c.category_name} - ${mc} - ${date}\n${url}`;
      if (navigator.share) {
        await navigator.share({ title: `MSISDN ${c.category_name} · ${mc}`, text: url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Link disalin ke clipboard:\n" + url);
      }
    } catch (e) {
      if (e?.name !== "AbortError") alert(e.message || "Gagal membuat link");
    } finally { setSharing(false); }
  }

  return (
    <div style={{ border: "1px solid #ECEDF0", borderRadius: 16, padding: "13px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{c.category_name}</div>
        {c.needs_msisdn && (
          <button onClick={share} disabled={sharing}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "#F4F5F7", border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#17181C", flexShrink: 0 }}>
            {sharing ? <Loader2 size={11} className="mh-spin" /> : <Share2 size={11} />} Bagikan
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#9A9AA6", marginBottom: 11 }}>Target hari ini {fmtNum(c.target_today)} · Target bulan {fmtNum(c.target_month)}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {["sp", "fwa"].map((kind) => (
          <QtyRow key={kind} kind={kind} categoryId={c.category_id} needsMsisdn={c.needs_msisdn}
            value={vals[kind]} onChangeVal={(val) => onChangeVal(kind, val)}
            msisdnList={msisdns[kind] || []}
            isOpen={!!msisdnOpen[`${c.category_id}:${kind}`]}
            onToggleOpen={() => setMsisdnOpen((p) => ({ ...p, [`${c.category_id}:${kind}`]: !p[`${c.category_id}:${kind}`] }))}
            draft={msisdnDraft[`${c.category_id}:${kind}`] || ""}
            onDraftChange={(t) => setMsisdnDraft((p) => ({ ...p, [`${c.category_id}:${kind}`]: t }))}
            onAdd={() => onAddMsisdn(c.category_id, kind)}
            onRemove={(m) => onRemoveMsisdn(c.category_id, kind, m)} />
        ))}
      </div>
    </div>
  );
}

function QtyRow({ kind, value, onChangeVal, needsMsisdn, msisdnList, isOpen, onToggleOpen, draft, onDraftChange, onAdd, onRemove }) {
  const meta = SP_FWA[kind];
  const Icon = meta.icon;
  return (
    <div style={{ background: "#FAFAFB", borderRadius: 12, padding: "9px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={14} color={meta.color} />
        </div>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{meta.label}</div>
        {needsMsisdn && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: meta.bg, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: meta.color }}>
            Total MSISDN {msisdnList.length}
          </div>
        )}
        <input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChangeVal(e.target.value)}
          placeholder="0"
          style={{ width: 58, padding: "7px 9px", borderRadius: 9, border: "1px solid #ECEDF0", background: "#fff", fontSize: 13.5, fontWeight: 800, textAlign: "center", color: meta.color }} />
      </div>

      {needsMsisdn && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed #E3E4E9" }}>
          <button onClick={onToggleOpen} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, marginBottom: isOpen ? 8 : 0, color: "#9A9AA6", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2 }}>
            Detail nomor {meta.label.toLowerCase()} yang disubmit <ChevronDown size={11} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
          </button>

          {isOpen && (
            <>
              {msisdnList.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {msisdnList.map((m) => (
                    <div key={m.msisdn} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 12, padding: "7px 10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#17181C" }}>{m.msisdn}</div>
                        <div style={{ fontSize: 10, color: "#9A9AA6", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.name || "-"}{m.role ? ` · ${m.role}` : ""}{m.at ? ` · ${fmtTime(m.at)}` : ""}
                          {m.source === "public" && <span style={{ color: "#C6168D", fontWeight: 700 }}> · link publik</span>}
                        </div>
                      </div>
                      <X size={13} color="#9A9AA6" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => onRemove(m.msisdn)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#C6C7CE", marginBottom: 8 }}>Belum ada nomor masuk.</div>
              )}
              <textarea rows={2} value={draft} onChange={(e) => onDraftChange(e.target.value)}
                placeholder={`Tempel nomor ${meta.label} - pisah per baris/koma`}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #ECEDF0", background: "#fff", fontSize: 12.5, boxSizing: "border-box", resize: "vertical", marginBottom: 6 }} />
              <button onClick={onAdd}
                style={{ display: "flex", alignItems: "center", gap: 5, background: meta.bg, border: "none", borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: meta.color }}>
                <Plus size={12} /> Tambah MSISDN {meta.label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
