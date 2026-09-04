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
import { ArrowLeft, PackageCheck, Navigation, Layers, ChevronRight, ImageOff, Image as ImageIcon, History, Store, Users } from "lucide-react";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";
import { APPROVER_ROLES, BRAND_DISPLAY } from "../_shared/planData";
import {
  fetchMyBranchProgress, fetchMyTypeSummary, fetchMyInstallations,
  fetchStockEntries, posmatStockPhotoUrl, posmPlanVisualUrl, STOCK_MODE_LABEL,
  fetchPlansForBranch, PLAN_CATEGORIES,
} from "../_shared/posmData";

// Ringkas alokasi Plan POSM (dari desktop "Plan POSM") milik satu branch+brand
// jadi satu baris per jenis material - dipakai TopUpMyStockSheet &
// ClaimRequestSheet supaya BME langsung lihat materi yang MEMANG sudah
// dialokasikan ke Branch-nya (qty alokasi, sudah terpasang, sisa), bukan
// daftar generik semua jenis material yang ada di katalog.
async function fetchAllocatedMaterialsForBranch(branchId, brand) {
  if (!branchId || !brand) return [];
  const plans = await fetchPlansForBranch(branchId, brand);
  const map = new Map();
  for (const pl of plans || []) {
    for (const m of pl.materials || []) {
      const qty = Number(m.qty) || 0;
      if (qty <= 0) continue;
      const cur = map.get(m.posmat_type_id) || {
        posmat_type_id: m.posmat_type_id, name: m.name, unit: m.unit, stock_mode: m.stock_mode,
        qty: 0, installed_qty: 0, plan_names: [],
        // Plan pertama yang menyumbang materi ini - dipakai utk thumbnail visual
        // & langsung mengarahkan ketukan kartu ke halaman pemasangan Plan itu
        // (kalau materi berasal dari >1 Plan, sisanya tetap terhitung ke total
        // tapi navigasi ikut Plan pertama yang ditemukan).
        plan_id: pl.id, category: pl.category, visual_path: pl.visual_path,
      };
      cur.qty += qty;
      cur.installed_qty += Number(m.installed_qty) || 0;
      if (!cur.plan_names.includes(pl.name)) cur.plan_names.push(pl.name);
      map.set(m.posmat_type_id, cur);
    }
  }
  return Array.from(map.values()).map((m) => ({ ...m, remaining: Math.max(0, m.qty - m.installed_qty) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

const fmtRupiah = (v) => v == null ? null : `Rp${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

const CATEGORY_ICON = { retailer_installment: Store, outdoor_installment: Navigation, customer_activation: Users };
const CATEGORY_COLOR = {
  retailer_installment: { color: "#ED1C24", bg: "rgba(237,28,36,0.10)" },
  outdoor_installment: { color: "#1D6FE0", bg: "rgba(29,111,224,0.10)" },
  customer_activation: { color: "#B8860B", bg: "rgba(184,134,11,0.10)" },
};

export default function PosmHubPage() {
  const router = useRouter();
  const { loading: sessionLoading, scope, email } = useMartaSession();
  const [progress, setProgress] = useState(null);
  const [types, setTypes] = useState([]);
  const [installs, setInstalls] = useState(null);
  const [allocated, setAllocated] = useState(null); // materi POSM yang teralokasi ke Branch ini (dari Plan POSM)
  const [categoryCounts, setCategoryCounts] = useState({}); // { [category]: jumlah Plan aktif } - buat titik hijau di menu POSM Category
  const [err, setErr] = useState("");
  const [historyType, setHistoryType] = useState(null); // null closed, else {posmat_type_id, name}

  const isApprover = APPROVER_ROLES.includes(scope?.role);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const [p, t, i, a, plans] = await Promise.all([
          fetchMyBranchProgress(), fetchMyTypeSummary(), fetchMyInstallations(),
          fetchAllocatedMaterialsForBranch(scope?.branchId, scope?.brand),
          fetchPlansForBranch(scope?.branchId, scope?.brand),
        ]);
        if (!alive) return;
        setProgress(p); setTypes(t || []); setInstalls(i || []); setAllocated(a || []);
        const counts = {};
        for (const pl of plans || []) counts[pl.category] = (counts[pl.category] || 0) + 1;
        setCategoryCounts(counts);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat data POSM");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, scope?.branchId, scope?.brand]);

  if (sessionLoading || installs === null) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  const pct = progress?.target_qty > 0 ? Math.min(100, Math.round((progress.achieved_qty / progress.target_qty) * 100)) : null;
  const needsRevisionCount = installs.filter((ins) => ins.retailer_outlet_code && ins.review_status === "revision_needed").length;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <PackageCheck size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>POSM</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Instalasi materi POSM lapangan &amp; stok Branch</div>
      </div>

      {err && <div style={{ margin: "14px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {/* Kelola Stok - approver (Head/Brand TMV/SPM Sumatera/Admin) tidak
          punya branch tetap sendiri jadi kartu Progress/Stok Cabang di bawah
          biasanya kosong utk mereka; quick-link ini gantikan akses yang dulu
          didapat lewat menu Beranda langsung ke /posm/stock. */}
      {isApprover && (
        <div style={{ padding: "16px 20px 0" }}>
          <button onClick={() => router.push("/martahub/m/posm/plans")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 14, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(179,46,133,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={16} color="#B32E85" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Kelola Plan POSM</div>
              <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>Register Installment Plan, visual, periode &amp; alokasi per branch</div>
            </div>
            <ChevronRight size={16} color="#B0B0BA" />
          </button>
        </div>
      )}

      {/* Progress cabang bulan ini */}
      {progress && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ borderRadius: 18, background: BRAND, padding: 18, color: "#fff", boxShadow: "0 6px 16px rgba(17,17,20,0.1)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.4 }}>Target Instalasi Bulan Ini · {progress.branch_name}{scope?.brand ? ` · ${BRAND_DISPLAY[scope.brand] || scope.brand.toUpperCase()}` : ""}</div>
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

      {/* POSM Category - 3 submenu (Retailer/Outdoor Installment, Customer
          Activation), tiap kategori masuk ke daftar Plan POSM yang sudah
          dialokasikan ke Branch ini, lalu (khusus Retailer Installment) cari
          outlet dari mapping DSE sebelum mencatat pemasangan. */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>POSM CATEGORY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PLAN_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICON[cat.key] || Layers;
            const clr = CATEGORY_COLOR[cat.key] || { color: "#5A5A68", bg: "#F0F0F3" };
            const count = categoryCounts[cat.key] || 0;
            return (
              <button key={cat.key} onClick={() => router.push(`/martahub/m/posm/kategori/${cat.key}`)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 14, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: clr.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} color={clr.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{cat.label}</div>
                    {count > 0 && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#15803D", flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>{count > 0 ? `${count} Plan POSM aktif` : "Belum ada Plan aktif"}</div>
                </div>
                <ChevronRight size={16} color="#B0B0BA" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Materi POSM yang dialokasikan ke Branch ini lewat Plan POSM (desktop) -
          langsung tampil di halaman utama, tidak perlu buka sheet Tambah
          Stok/Ajukan Klaim dulu utk tahu apa yang harus dikerjakan. Ketuk
          kartu -> langsung ke halaman Plan (bisa langsung "Cari Outlet &
          Pasang" dari sana), thumbnail pakai visual Plan yang sama. */}
      {allocated && allocated.length > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>POSM YANG DITUGASKAN KE BRANCH</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allocated.map((m) => <AssignedMaterialCard key={m.posmat_type_id} m={m} router={router} />)}
          </div>
        </div>
      )}
      {allocated && allocated.length === 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: "#F6F7F9", color: "#8A8A96", fontSize: 11.5, fontWeight: 600 }}>
            Belum ada materi POSM yang dialokasikan ke Branch Anda lewat Plan POSM.
          </div>
        </div>
      )}

      {/* Stok per jenis - ketuk kartu utk lihat riwayat top-up (biaya & foto
          dokumentasi tiap entri). */}
      {types.length > 0 && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>STOK BRANCH</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {types.map((t) => (
              <button key={t.posmat_type_id} onClick={() => setHistoryType({ posmat_type_id: t.posmat_type_id, name: t.name })}
                style={{ flexShrink: 0, minWidth: 118, textAlign: "left", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "11px 12px", cursor: "pointer", fontFamily: FF }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ marginTop: 5, fontSize: 17, fontWeight: 800, color: "#ED1C24" }}>{fmtInt(t.balance)}</div>
                <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>{t.unit} · {STOCK_MODE_LABEL[t.stock_mode] || t.stock_mode}</div>
                {t.avg_unit_cost != null && (
                  <div style={{ marginTop: 4, fontSize: 9.5, color: "#5A5A68", fontWeight: 700 }}>~{fmtRupiah(t.avg_unit_cost)}/{t.unit}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Riwayat instalasi - dipisah jadi menu tersendiri (bukan daftar penuh
          di Beranda POSM), supaya halaman utama tetap ringkas. Kartu ini
          cuma ringkasan (jumlah + status revisi terbaru kalau ada). */}
      <div style={{ padding: "20px 20px 100px" }}>
        <button onClick={() => router.push("/martahub/m/posm/riwayat")}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 14, border: "1px solid #E9EAEE", background: "#FFFFFF", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <History size={16} color="#5A5A68" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Riwayat Instalasi</div>
              {needsRevisionCount > 0 && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />}
            </div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>
              {installs.length === 0 ? "Belum ada instalasi tercatat" : needsRevisionCount > 0 ? `${needsRevisionCount} perlu revisi · ${installs.length} total` : `${installs.length} pemasangan tercatat`}
            </div>
          </div>
          <ChevronRight size={16} color="#B0B0BA" />
        </button>
      </div>

      {historyType && (
        <StockHistorySheet
          type={historyType} scope={scope} callerEmail={email}
          onClose={() => setHistoryType(null)}
        />
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

function AssignedMaterialCard({ m, router }) {
  const pct = m.qty > 0 ? Math.min(100, Math.round((m.installed_qty / m.qty) * 100)) : 0;
  const done = m.remaining <= 0;
  const url = m.visual_path ? posmPlanVisualUrl(m.visual_path) : null;
  const goToPlan = () => {
    if (m.category && m.plan_id) router.push(`/martahub/m/posm/kategori/${m.category}/${m.plan_id}`);
  };
  return (
    <button onClick={goToPlan} style={{ width: "100%", display: "flex", gap: 12, textAlign: "left", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: 12, cursor: "pointer", fontFamily: FF, boxSizing: "border-box" }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: "#F0F0F3", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={18} color="#C4C4CE" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{m.name}</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.plan_names.join(", ")}</div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "4px 8px", borderRadius: 999, color: done ? "#15803D" : "#B45309", background: done ? "rgba(21,128,61,0.10)" : "rgba(180,83,9,0.10)" }}>
            {done ? "Selesai" : `Sisa ${fmtInt(m.remaining)}`}
          </span>
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#5A5A68", fontWeight: 700 }}>
          <span>{fmtInt(m.installed_qty)} / {fmtInt(m.qty)} {m.unit}</span>
        </div>
        <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: "#F0F0F3", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: done ? "#15803D" : "#ED1C24", borderRadius: 999 }} />
        </div>
      </div>
    </button>
  );
}

function StockHistorySheet({ type, scope, callerEmail, onClose }) {
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchStockEntries({ branchId: scope?.branchId, brand: scope?.brand, posmatTypeId: type.posmat_type_id, callerEmail })
      .then((d) => { if (alive) setEntries(d || []); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [type.posmat_type_id, scope?.branchId, scope?.brand, callerEmail]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: "22px 22px 0 0", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ padding: "8px 20px 0", display: "flex", alignItems: "center", gap: 7 }}>
          <History size={16} color="#5A5A68" />
          <div style={{ fontSize: 15, fontWeight: 800 }}>Riwayat Stok · {type.name}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 24px" }}>
          {err && <div style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600 }}>{err}</div>}
          {entries === null ? (
            <ShellSpinner />
          ) : entries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 20px", color: "#8A8A96", fontSize: 12 }}>Belum ada transaksi stok.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entries.map((e) => (
                <div key={e.id} style={{ display: "flex", gap: 10, padding: "11px 12px", borderRadius: 14, border: "1px solid #E9EAEE" }}>
                  {e.photo_path ? (
                    <img src={posmatStockPhotoUrl(e.photo_path)} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "#F0F0F3" }} />
                  ) : (
                    <div style={{ width: 52, height: 52, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ImageOff size={16} color="#C4C4CE" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: Number(e.amount) < 0 ? "#DC2626" : "#15803D" }}>
                        {Number(e.amount) > 0 ? "+" : ""}{fmtInt(e.amount)}
                      </span>
                      <span style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 600, flexShrink: 0 }}>{new Date(e.created_at).toLocaleDateString("id-ID")}</span>
                    </div>
                    {e.unit_cost != null && <div style={{ marginTop: 2, fontSize: 11, color: "#5A5A68", fontWeight: 600 }}>Biaya: {fmtRupiah(e.unit_cost)}/satuan</div>}
                    {e.note && <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96" }}>{e.note}</div>}
                    <div style={{ marginTop: 2, fontSize: 10, color: "#B0B0BA" }}>oleh {e.created_by_name || "-"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
