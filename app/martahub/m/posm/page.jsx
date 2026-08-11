"use client";
/**
 * /martahub/m/posm - Hub POSM (dulu "POSMAT" di Flutter, nama tampilan
 * disederhanakan jadi "POSM") utk BME/RGE & tim lapangan: progress target
 * cabang bulan ini, ringkasan stok per jenis material, riwayat instalasi
 * yang sudah dicatat, + jalur pengajuan klaim stok (khusus role BME).
 * Padanan `md_activities_screen.dart` (Flutter).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, PackageCheck, MapPin, Navigation, Milestone, CheckCircle2, Clock, XCircle, PackagePlus, Layers, ChevronRight } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";
import { APPROVER_ROLES } from "../_shared/planData";
import {
  fetchMyBranchProgress, fetchMyTypeSummary, fetchMyInstallations, fetchMyAvailableTypes,
  submitClaimRequest, STOCK_MODE_LABEL, INSTALL_MODES,
} from "../_shared/posmData";

const MODE_ICON = { activity: Milestone, outlet: MapPin, street: Navigation };

export default function PosmHubPage() {
  const router = useRouter();
  const { loading: sessionLoading, scope } = useMartaSession();
  const [progress, setProgress] = useState(null);
  const [types, setTypes] = useState([]);
  const [installs, setInstalls] = useState(null);
  const [err, setErr] = useState("");
  const [claimSheet, setClaimSheet] = useState(false);

  const canClaim = scope?.role === "bme"; // server-enforced juga (lihat mh_posmat_bme_submit_claim_request)
  const isApprover = APPROVER_ROLES.includes(scope?.role);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const [p, t, i] = await Promise.all([fetchMyBranchProgress(), fetchMyTypeSummary(), fetchMyInstallations()]);
        if (!alive) return;
        setProgress(p); setTypes(t || []); setInstalls(i || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data POSM");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading]);

  if (sessionLoading || installs === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const pct = progress?.target_qty > 0 ? Math.min(100, Math.round((progress.achieved_qty / progress.target_qty) * 100)) : null;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <PackageCheck size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>POSM</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Instalasi materi POSM lapangan &amp; stok cabang</div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {/* Kelola Stok - approver (Head/Brand TMV/SPM Sumatera/Admin) tidak
          punya branch tetap sendiri jadi kartu Progress/Stok Cabang di bawah
          biasanya kosong utk mereka; quick-link ini gantikan akses yang dulu
          didapat lewat menu Beranda langsung ke /posm/stock. */}
      {isApprover && (
        <div style={{ padding: "16px 20px 0" }}>
          <button onClick={() => router.push("/martahub/m/posm/stock")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 14, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(179,46,133,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={16} color="#B32E85" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Kelola Stok &amp; Target</div>
              <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>Stok tiap branch, jenis material &amp; target bulanan</div>
            </div>
            <ChevronRight size={16} color="#B0B0BA" />
          </button>
        </div>
      )}

      {/* Progress cabang bulan ini */}
      {progress && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ borderRadius: 18, background: BRAND, padding: 18, color: "#fff", boxShadow: "0 6px 16px rgba(17,17,20,0.1)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.4 }}>Target Instalasi Bulan Ini · {progress.branch_name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtInt(progress.achieved_qty)}</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, fontWeight: 600 }}>/ target {progress.target_qty != null ? fmtInt(progress.target_qty) : "-"}</div>
            </div>
            {pct != null && (
              <div style={{ marginTop: 10, height: 7, borderRadius: 999, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 999 }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stok per jenis */}
      {types.length > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Stok Cabang</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {types.map((t) => (
              <div key={t.posmat_type_id} style={{ flexShrink: 0, minWidth: 118, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "11px 12px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ marginTop: 5, fontSize: 17, fontWeight: 800, color: "#ED1C24" }}>{fmtInt(t.balance)}</div>
                <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>{t.unit} · {STOCK_MODE_LABEL[t.stock_mode] || t.stock_mode}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canClaim && (
        <div style={{ padding: "14px 20px 0" }}>
          <button onClick={() => setClaimSheet(true)}
            style={{ width: "100%", height: 46, borderRadius: 13, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <PackagePlus size={15} /> Ajukan Klaim Stok
          </button>
        </div>
      )}

      {/* Riwayat instalasi */}
      <div style={{ padding: "20px 20px 100px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Riwayat Instalasi</div>
        {installs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "36px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada instalasi tercatat</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Ketuk "Catat" untuk mencatat instalasi materi POSM pertama.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {installs.map((ins) => <InstallCard key={ins.id} ins={ins} />)}
          </div>
        )}
      </div>

      {/* FAB Catat */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 96, zIndex: 45, pointerEvents: "none" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "flex-end", padding: "0 20px" }}>
          <button onClick={() => router.push("/martahub/m/posm/new")}
            style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderRadius: 28, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", boxShadow: "0 6px 16px rgba(17,17,20,0.10), 0 2px 4px rgba(17,17,20,0.06)" }}>
            <Plus size={18} /> Catat
          </button>
        </div>
      </div>

      {claimSheet && (
        <ClaimRequestSheet onClose={() => setClaimSheet(false)} onSubmitted={() => setClaimSheet(false)} />
      )}
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

function reviewBadge(status) {
  const map = {
    valid: { label: "Tervalidasi", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: CheckCircle2 },
    approved: { label: "Tervalidasi", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: CheckCircle2 },
    mismatch: { label: "Tidak Cocok", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: XCircle },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: XCircle },
  };
  return map[status] || { label: "Menunggu Validasi", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: Clock };
}

function InstallCard({ ins }) {
  const Icon = MODE_ICON[ins.mode] || Milestone;
  const badge = reviewBadge(ins.location_status);
  const BadgeIcon = badge.icon;
  const label = ins.mode === "activity" ? (ins.activity_name || "Terikat Activity") : ins.mode === "outlet" ? (ins.site_id || "Terikat Outlet") : (ins.street_description || "Street Branding");
  const totalQty = (ins.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
  return (
    <div style={{ textAlign: "left", width: "100%", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "13px 14px", fontFamily: FF, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A68" }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
            {INSTALL_MODES.find((m) => m.key === ins.mode)?.label} · {fmtInt(totalQty)} item · {new Date(ins.created_at).toLocaleDateString("id-ID")}
          </div>
        </div>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, padding: "4px 8px", borderRadius: 999, color: badge.color, background: badge.bg }}>
          <BadgeIcon size={10} /> {badge.label}
        </span>
      </div>
    </div>
  );
}

function ClaimRequestSheet({ onClose, onSubmitted }) {
  const [available, setAvailable] = useState(null);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchMyAvailableTypes().then((d) => { if (alive) setAvailable(d || []); }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  function addItem(t) {
    if (items.some((i) => i.posmat_type_id === t.posmat_type_id)) return;
    setItems((prev) => [...prev, { posmat_type_id: t.posmat_type_id, name: t.name, unit: t.unit, qty: "1" }]);
  }
  function updateQty(id, qty) { setItems((prev) => prev.map((i) => i.posmat_type_id === id ? { ...i, qty } : i)); }
  function removeItem(id) { setItems((prev) => prev.filter((i) => i.posmat_type_id !== id)); }

  async function submit() {
    if (items.length === 0) { setErr("Pilih minimal satu jenis material."); return; }
    if (items.some((i) => !i.qty || Number(i.qty) <= 0)) { setErr("Jumlah tiap item harus lebih dari nol."); return; }
    setBusy(true); setErr("");
    try {
      await submitClaimRequest(items, note.trim() || null);
      onSubmitted();
    } catch (e) {
      setErr(e.message || "Gagal mengajukan klaim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ padding: "8px 20px 0", fontSize: 15, fontWeight: 800 }}>Ajukan Klaim Stok</div>
        <div style={{ padding: "4px 20px 0", fontSize: 11.5, color: "#8A8A96" }}>Pilih jenis materi POSM &amp; jumlah yang dibutuhkan bulan ini.</div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {err && <div style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600 }}>{err}</div>}

          {available === null ? (
            <ShellSpinner />
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {available.filter((t) => !items.some((i) => i.posmat_type_id === t.posmat_type_id)).map((t) => (
                  <button key={t.posmat_type_id} onClick={() => addItem(t)}
                    style={{ padding: "7px 12px", borderRadius: 999, border: "1.5px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                    + {t.name}
                  </button>
                ))}
                {available.length === 0 && <div style={{ fontSize: 11.5, color: "#B0B0BA" }}>Belum ada jenis material terdaftar di cabang Anda.</div>}
              </div>

              {items.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((i) => (
                    <div key={i.posmat_type_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, background: "#F7F7F9" }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{i.name} <span style={{ color: "#B0B0BA", fontWeight: 600 }}>({i.unit})</span></div>
                      <input type="number" min="1" value={i.qty} onChange={(e) => updateQty(i.posmat_type_id, e.target.value)}
                        style={{ width: 60, height: 34, borderRadius: 9, border: "1.5px solid #ECEDF0", textAlign: "center", fontSize: 13, fontFamily: FF, outline: "none" }} />
                      <button onClick={() => removeItem(i.posmat_type_id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B0B0BA" }}>
                        <XCircle size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" rows={2}
                style={{ width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", fontSize: 12.5, fontFamily: FF, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            </>
          )}
        </div>

        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", borderTop: "1px solid #F0F0F3" }}>
          <button onClick={submit} disabled={busy}
            style={{ width: "100%", height: 48, borderRadius: 13, border: "none", cursor: busy ? "default" : "pointer", background: busy ? "#F0A8A8" : BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF }}>
            {busy ? "Mengirim…" : "Kirim Pengajuan"}
          </button>
        </div>
      </div>
    </div>
  );
}
