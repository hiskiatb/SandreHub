"use client";
/**
 * /martahub/m/posm/stock — Kelola stok POSM (khusus approver: Head/Brand
 * TMV/SPM Sumatera/Admin). Padanan `posm_stock_screen.dart` Flutter: 3 tab
 * (Ringkasan stok per cabang×brand×jenis, Kelola Jenis Material, Target
 * instalasi bulanan). Server-side role gate ditegakkan oleh RPC-nya sendiri
 * (mh_posmat_set_monthly_stock dkk) — halaman ini cuma UI, otorisasi asli
 * tetap di database.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck, Plus, X, Loader2, Layers, Target as TargetIcon, PackagePlus, ClipboardCheck } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import {
  fetchStockOverview, listTypes, listTargets, setMonthlyStock, setTarget, upsertType,
  fetchBranchOptions, STOCK_MODE_LABEL, currentMonthKey,
} from "../../_shared/posmData";

const TABS = [{ key: "stock", label: "Stok" }, { key: "types", label: "Jenis" }, { key: "target", label: "Target" }];

export default function PosmStockPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const [tab, setTab] = useState("stock");
  const [overview, setOverview] = useState(null);
  const [types, setTypes] = useState(null);
  const [targets, setTargets] = useState(null);
  const [branches, setBranches] = useState([]);
  const [err, setErr] = useState("");
  const [topUpSheet, setTopUpSheet] = useState(false);
  const [typeSheet, setTypeSheet] = useState(null); // null closed, {} new, {...} edit
  const [targetSheet, setTargetSheet] = useState(false);

  async function loadAll() {
    try {
      const [o, t, tg, b] = await Promise.all([fetchStockOverview(), listTypes(), listTargets(), fetchBranchOptions()]);
      setOverview(o || []); setTypes(t || []); setTargets(tg || []); setBranches(b || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat data POSM");
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading]);

  if (sessionLoading || overview === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PackageCheck size={19} color="#ED1C24" />
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Stok POSM</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/martahub/m/posm/reconcile")}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, padding: "8px 12px", cursor: "pointer", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF }}>
              <ClipboardCheck size={14} /> Rekonsiliasi
            </button>
            <button onClick={() => router.push("/martahub/m/posm/claims")}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, padding: "8px 12px", cursor: "pointer", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF }}>
              <PackagePlus size={14} /> Klaim
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", borderRadius: 999, background: tab === t.key ? "#17181C" : "#FFFFFF", border: `1px solid ${tab === t.key ? "#17181C" : "#E9EAEE"}`, color: tab === t.key ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: "16px 20px 100px" }}>
        {tab === "stock" && (
          <>
            <ActionButton icon={Plus} label="Top Up Stok" onClick={() => setTopUpSheet(true)} />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {overview.length === 0 ? <EmptyNote text="Belum ada data stok." /> : overview.map((r, i) => (
                <div key={i} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{r.type_name}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{r.branch_name} · {(r.brand || "").toUpperCase()} · {STOCK_MODE_LABEL[r.stock_mode] || r.stock_mode}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#ED1C24" }}>{fmtInt(r.balance)}</div>
                      <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>{r.unit}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>
                    <span>Masuk: {fmtInt(r.total_topup)}</span>
                    <span>Terpakai: {fmtInt(r.total_consumed)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "types" && (
          <>
            <ActionButton icon={Plus} label="Tambah Jenis Material" onClick={() => setTypeSheet({})} />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {types.length === 0 ? <EmptyNote text="Belum ada jenis material." /> : types.map((t) => (
                <button key={t.id} onClick={() => setTypeSheet(t)}
                  style={{ textAlign: "left", width: "100%", display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px", cursor: "pointer", fontFamily: FF }}>
                  <Layers size={16} color="#8A8A96" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{t.name}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{t.category || "—"} · {t.unit} · {STOCK_MODE_LABEL[t.stock_mode] || t.stock_mode}</div>
                  </div>
                  {!t.active && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: "#8A8A96", background: "#F0F0F3" }}>NONAKTIF</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "target" && (
          <>
            <ActionButton icon={TargetIcon} label="Set Target Bulanan" onClick={() => setTargetSheet(true)} />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {targets.length === 0 ? <EmptyNote text="Belum ada target diset." /> : targets.map((t) => {
                const pct = t.target_qty > 0 ? Math.round((t.achieved_qty / t.target_qty) * 100) : 0;
                return (
                  <div key={t.id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{t.branch_name} · {(t.brand || "").toUpperCase()}</div>
                      <div style={{ fontSize: 11, color: "#8A8A96", fontWeight: 700 }}>{t.month}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>{fmtInt(t.achieved_qty)} / {fmtInt(t.target_qty)} ({pct}%)</div>
                    <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: BRAND }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {topUpSheet && <TopUpSheet branches={branches} types={types} onClose={() => setTopUpSheet(false)} onSaved={() => { setTopUpSheet(false); loadAll(); }} />}
      {typeSheet && <TypeSheet type={typeSheet} onClose={() => setTypeSheet(null)} onSaved={() => { setTypeSheet(null); loadAll(); }} />}
      {targetSheet && <TargetSheet branches={branches} onClose={() => setTargetSheet(false)} onSaved={() => { setTargetSheet(false); loadAll(); }} />}
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: "100%", height: 46, borderRadius: 13, border: "1.5px dashed #D8D9E0", background: "#F6F7F9", color: "#ED1C24", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Icon size={15} /> {label}
    </button>
  );
}

function EmptyNote({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16, fontSize: 12, color: "#8A8A96" }}>{text}</div>
  );
}

const selectBase = { width: "100%", height: 46, padding: "0 12px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 13, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };
function Label({ text }) { return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#8A8A96", marginBottom: 6, marginTop: 12 }}>{text}</div>; }

function SheetShell({ title, onClose, children, onSubmit, busy, submitLabel }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 0" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96" }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 20px" }}>{children}</div>
        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", borderTop: "1px solid #F0F0F3" }}>
          <button onClick={onSubmit} disabled={busy}
            style={{ width: "100%", height: 48, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: busy ? "#F0A8A8" : BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {busy && <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} />}
            {busy ? "Menyimpan…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopUpSheet({ branches, types, onClose, onSaved }) {
  const [branchId, setBranchId] = useState(branches[0]?.branch_id || "");
  const [brand, setBrand] = useState("im3");
  const [posmatTypeId, setPosmatTypeId] = useState(types[0]?.id || "");
  const [month, setMonth] = useState(currentMonthKey());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!branchId || !posmatTypeId || !amount) { setErr("Lengkapi semua field wajib."); return; }
    setBusy(true); setErr("");
    try {
      await setMonthlyStock({ branchId, brand, posmatTypeId, month, amount, note: note.trim() });
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan stok"); setBusy(false);
    }
  }

  return (
    <SheetShell title="Top Up Stok Bulanan" onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Simpan Stok">
      {err && <div style={{ padding: "9px 11px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{err}</div>}
      <Label text="Cabang" />
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={selectBase}>
        {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
      </select>
      <Label text="Brand" />
      <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectBase}>
        <option value="im3">IM3</option>
        <option value="tri">Tri</option>
      </select>
      <Label text="Jenis Material" />
      <select value={posmatTypeId} onChange={(e) => setPosmatTypeId(e.target.value)} style={selectBase}>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <Label text="Bulan (yyyymm)" />
      <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="202608" style={selectBase} />
      <Label text="Jumlah Top Up" />
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={selectBase} />
      <Label text="Catatan (opsional)" />
      <input value={note} onChange={(e) => setNote(e.target.value)} style={selectBase} />
    </SheetShell>
  );
}

function TypeSheet({ type, onClose, onSaved }) {
  const isEdit = !!type.id;
  const [name, setName] = useState(type.name || "");
  const [category, setCategory] = useState(type.category || "");
  const [stockMode, setStockMode] = useState(type.stock_mode || "consumable");
  const [unit, setUnit] = useState(type.unit || "pcs");
  const [active, setActive] = useState(type.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!name.trim() || !unit.trim()) { setErr("Nama & satuan wajib diisi."); return; }
    setBusy(true); setErr("");
    try {
      await upsertType({ id: type.id, name: name.trim(), category: category.trim() || null, stockMode, unit: unit.trim(), active });
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan jenis material"); setBusy(false);
    }
  }

  return (
    <SheetShell title={isEdit ? "Edit Jenis Material" : "Tambah Jenis Material"} onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Simpan">
      {err && <div style={{ padding: "9px 11px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{err}</div>}
      <Label text="Nama Material" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Banner 3x1" style={selectBase} />
      <Label text="Kategori (opsional)" />
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Outdoor" style={selectBase} />
      <Label text="Satuan" />
      <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" style={selectBase} />
      <Label text="Mode Stok" />
      <div style={{ display: "flex", background: "#F6F7F9", borderRadius: 12, padding: 3 }}>
        {["consumable", "reusable"].map((m) => (
          <button key={m} onClick={() => setStockMode(m)}
            style={{ flex: 1, height: 38, borderRadius: 9, border: "none", background: stockMode === m ? "#17181C" : "transparent", color: stockMode === m ? "#fff" : "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            {STOCK_MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {isEdit && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, fontWeight: 700, color: "#3A3A44", cursor: "pointer" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif
        </label>
      )}
    </SheetShell>
  );
}

function TargetSheet({ branches, onClose, onSaved }) {
  const [branchId, setBranchId] = useState(branches[0]?.branch_id || "");
  const [brand, setBrand] = useState("im3");
  const [month, setMonth] = useState(currentMonthKey());
  const [targetQty, setTargetQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!branchId || !targetQty) { setErr("Lengkapi semua field wajib."); return; }
    setBusy(true); setErr("");
    try {
      const branchName = branches.find((b) => b.branch_id === branchId)?.branch_name || branchId;
      await setTarget({ branchId, branchName, brand, month, targetQty, note: note.trim() });
      onSaved();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan target"); setBusy(false);
    }
  }

  return (
    <SheetShell title="Set Target Instalasi Bulanan" onClose={onClose} onSubmit={submit} busy={busy} submitLabel="Simpan Target">
      {err && <div style={{ padding: "9px 11px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{err}</div>}
      <Label text="Cabang" />
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={selectBase}>
        {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
      </select>
      <Label text="Brand" />
      <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectBase}>
        <option value="im3">IM3</option>
        <option value="tri">Tri</option>
      </select>
      <Label text="Bulan (yyyymm)" />
      <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="202608" style={selectBase} />
      <Label text="Target (qty instalasi)" />
      <input type="number" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} style={selectBase} />
      <Label text="Catatan (opsional)" />
      <input value={note} onChange={(e) => setNote(e.target.value)} style={selectBase} />
    </SheetShell>
  );
}
