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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target, CalendarDays, ChevronRight, ChevronDown, Loader2, Check, MapPin, Building2, Plus, X, CardSim, Router, Share2, RefreshCw, Crown, Medal, TrendingUp, User } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import BottomSheet from "../_shared/BottomSheet";
import { isValidMsisdn } from "../_shared/msisdn";

const SP_FWA = {
  sp: { icon: CardSim, color: "#ED1C24", bg: "rgba(237,28,36,0.08)", label: "SP" },
  fwa: { icon: Router, color: "#C6168D", bg: "rgba(236,0,140,0.08)", label: "FWA" },
};

// Palet warna beda2 per JENIS KEGIATAN (bukan SP/FWA) - biar kartu kegiatan yg
// satu gampang dibedain dari yg lain sekilas (garis aksen kiri + dot kecil di
// nama), tanpa perlu baca teksnya dulu. Di-hash dari category_id biar KONSISTEN
// tiap kali dibuka (bukan random/urutan), dan tetap jalan walau kategori baru
// ditambah di CMS (auto dapat warna dari palet, muter lagi kalau kategori > 8).
const CATEGORY_PALETTE = ["#1565C0", "#C6168D", "#B45309", "#1EA672", "#7C3AED", "#D97706", "#0E7490", "#DB2777"];
function categoryColor(categoryId) {
  let h = 0;
  const str = String(categoryId || "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}
// DISEMBUNYIKAN sementara per permintaan user (bukan dihapus) - input/detail
// MSISDN per nomor di sheet catat-penjualan mobile ini. Tinggal balik ke
// true kalau mau dimunculkan ulang; semua logic (tambah/hapus/list MSISDN)
// tetap jalan di baliknya, cuma UI-nya yg disembunyikan.
const SHOW_MSISDN_INPUT = false;

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
function fmtMonthLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }).toUpperCase();
}
function fmtShortDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function fmtTinyDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }).toUpperCase();
}
function fmtChipDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
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

const selStyle = { width: "100%", padding: "10px 30px 10px 12px", borderRadius: 12, border: "1.5px solid #E7E8ED", background: "#FAFAFB", fontSize: 13, fontWeight: 700, color: "#17181C", appearance: "none", WebkitAppearance: "none", MozAppearance: "none" };
// Tampilan "statis" kalau pilihannya cuma SATU (mis. region/branch DMO yg
// memang terkunci ke satu-satunya opsi) - sama persis gaya selStyle TAPI
// tanpa elemen <select> & tanpa panah dropdown, krn tidak ada apa2 yg bisa
// dipilih (bukan select yg disable, tapi memang bukan pilihan sama sekali).
const staticSelStyle = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E7E8ED", background: "#FAFAFB", fontSize: 13, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export default function DtuPage() {
  const router = useRouter();
  const { loading: sessionLoading, email } = useMartaSession();
  const [date, setDate] = useState(todayStr());
  const [summary, setSummary] = useState(null);
  // Ringkasan level REGION (SEMUA branch di region yg dipilih digabung) -
  // diisi hanya kalau user UNSCOPED (head/tmv/spm_sumatera/admin) DAN belum
  // pilih branch spesifik ("Semua Branch" di dropdown) - lihat load() &
  // showAllBranches di bawah. null kalau lagi lihat satu branch spesifik.
  const [regionSummary, setRegionSummary] = useState(null);
  const [categoryScope, setCategoryScope] = useState("today"); // "month" | "today" - tab gabungan ACH. TODAY / ACH. MTD, default TODAY
  const [summaryOpen, setSummaryOpen] = useState(false); // default TERTUTUP - sekali user buka, diingat terbuka terus per device via localStorage
  useEffect(() => {
    try { const v = localStorage.getItem("mh_dtu_summary_open"); if (v != null) setSummaryOpen(v !== "0"); } catch {}
  }, []);
  function toggleSummaryOpen() {
    setSummaryOpen((p) => { const next = !p; try { localStorage.setItem("mh_dtu_summary_open", next ? "1" : "0"); } catch {} return next; });
  }
  const [loading, setLoading] = useState(true);
  const [mcSheet, setMcSheet] = useState(null);
  const [sharing, setSharing] = useState(false);

  const [rbList, setRbList] = useState([]);
  const [region, setRegion] = useState(() => {
    try { return localStorage.getItem("mh_dtu_region_filter") || ""; } catch { return ""; }
  });
  const [branchId, setBranchId] = useState(() => {
    try { return localStorage.getItem("mh_dtu_branch_filter") || ""; } catch { return ""; }
  });

  // "Semua Branch" (branchId kosong) UNTUK USER UNSCOPED - skrg BUKAN lagi
  // berarti "belum pilih apa-apa, tampilan diblok" (dulu munculin pesan
  // "Pilih Region dan Branch dulu"), TAPI berarti "tampilkan SEMUA branch di
  // region yg dipilih sekaligus" - panggil RPC region (mh_dtu_summary_region)
  // yg ngasih ringkasan gabungan + daftar pencapaian PER BRANCH hari itu
  // (ganti daftar per-MC). User tetap bisa "turun" ke satu branch spesifik
  // via dropdown Branch ATAU klik salah satu baris branch di daftar.
  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_dtu_summary", { p_caller_email: email, p_date: date, p_branch_id: branchId || null });
    if (!error) setSummary(data || null);
    if (!error && data?.unscoped && !branchId) {
      const { data: rdata, error: rerr } = await supabaseMarta.rpc("mh_dtu_summary_region", { p_caller_email: email, p_date: date, p_region: region || null });
      setRegionSummary(!rerr ? rdata || null : null);
    } else {
      setRegionSummary(null);
    }
    setLoading(false);
  }, [email, date, branchId, region]);
  useEffect(() => { load(); }, [load]);

  async function shareBranchLink() {
    setSharing(true);
    try {
      const { data, error } = await supabaseMarta.rpc("mh_dtu_share_link_branch_get_or_create", {
        p_caller_email: email, p_branch_id: branchId || null,
      });
      if (error) throw new Error(error.message);
      const url = `${window.location.origin}/martahub/public/dtu/${data.token}`;
      if (navigator.share) {
        await navigator.share({ title: "Link Catat Penjualan DTU", text: url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Link disalin ke clipboard:\n" + url);
      }
    } catch (e) {
      if (e?.name !== "AbortError") alert(e.message || "Gagal membuat link");
    } finally { setSharing(false); }
  }

  useEffect(() => {
    if (!summary?.unscoped || rbList.length) return;
    supabaseMarta.rpc("mh_dtu_region_branch_list", { p_month: currentYYYYMM() }).then(({ data }) => setRbList(data || []));
  }, [summary?.unscoped, rbList.length]);

  const regions = useMemo(() => [...new Set(rbList.map((r) => r.region).filter(Boolean))].sort(), [rbList]);
  const branchesInRegion = useMemo(() => rbList.filter((r) => !region || r.region === region).sort((a, b) => a.branch_name.localeCompare(b.branch_name)), [rbList, region]);

  if (sessionLoading) return <MobileShell active="dtu"><ShellSpinner /></MobileShell>;

  const isUnscoped = !!summary?.unscoped;
  // Mode "Semua Branch" - unscoped & belum narrow ke satu branch spesifik.
  // Dipakai utk nentuin sumber ringkasan (regionSummary vs summary) & isi
  // daftar di bawah "Pilih MC" (daftar BRANCH, bukan MC).
  const showAllBranches = isUnscoped && !branchId;
  const cardTarget = showAllBranches ? regionSummary : summary;

  return (
    <MobileShell active="dtu">
      <div style={{ fontFamily: FF, padding: "calc(env(safe-area-inset-top,0px) + 22px) 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid #ECEDF0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ArrowLeft size={17} color="#17181C" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>Report DTU</div>
        </div>

        {/* Kartu filter: tanggal + (kalau unscoped) region/branch, disatukan jadi satu blok */}
        <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "4px 14px", marginBottom: 18 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 0", borderBottom: isUnscoped ? "1px solid #F0F0F3" : "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CalendarDays size={14} color="#5A5A68" />
            </div>
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#17181C" }}>{fmtDateLabel(date)}</div>
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} id="dtu-date-input" />
            <span onClick={() => document.getElementById("dtu-date-input")?.showPicker?.()} style={{ fontSize: 11.5, fontWeight: 800, color: "#ED1C24", padding: "4px 2px" }}>Ganti</span>
          </label>

          {isUnscoped && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 0" }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.3 }}><MapPin size={10.5} /> Region</div>
                {regions.length <= 1 ? (
                  <div style={staticSelStyle}>{regions[0] || "Semua Region"}</div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <select value={region} onChange={(e) => {
                      const v = e.target.value;
                      setRegion(v); setBranchId("");
                      try { localStorage.setItem("mh_dtu_region_filter", v); localStorage.removeItem("mh_dtu_branch_filter"); } catch {}
                    }} style={selStyle}>
                      <option value="">Semua Region</option>
                      {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ChevronDown size={14} color="#9A9AA6" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  </div>
                )}
              </label>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: 0.3 }}><Building2 size={10.5} /> Branch</div>
                {branchesInRegion.length <= 1 ? (
                  <div style={staticSelStyle}>{branchesInRegion[0]?.branch_name || "Semua Branch"}</div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <select value={branchId} onChange={(e) => {
                      const v = e.target.value;
                      setBranchId(v);
                      try { localStorage.setItem("mh_dtu_branch_filter", v); } catch {}
                    }} style={selStyle}>
                      {/* Opsi kosong SKRG "Semua Branch" (gabungan SEMUA branch di
                          region yg dipilih), BUKAN lagi placeholder kosong yg
                          bikin tampilan diblok - lihat load()/showAllBranches. */}
                      <option value="">Semua Branch</option>
                      {branchesInRegion.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                    </select>
                    <ChevronDown size={14} color="#9A9AA6" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  </div>
                )}
              </label>
            </div>
          )}
        </div>

        <button type="button" onClick={toggleSummaryOpen}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: summaryOpen ? 10 : 14, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 13, padding: "11px 12px", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: "rgba(237,28,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={14} color="#ED1C24" strokeWidth={2.25} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Ringkasan Penjualan{showAllBranches && <span style={{ fontWeight: 600, color: "#9A9AA6" }}> · {region || "Semua Region"}</span>}
            </span>
          </div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", borderRadius: 9, padding: "5px 6px 5px 10px" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#6B6B78", whiteSpace: "nowrap" }}>{summaryOpen ? "Tutup Detail" : "Lihat Detail"}</span>
            <ChevronDown size={13} color="#6B6B78" style={{ transform: summaryOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
          </div>
        </button>
        {/* SummaryCard SKRG ikut mode: "Semua Branch" pakai regionSummary
            (gabungan seluruh branch di region yg dipilih), branch spesifik
            tetap pakai `summary` spt semula. Digabung jadi SATU card dgn tab
            ACH. MTD / ACH. TODAY (categoryScope dipakai bareng utk ganti
            SP/FWA/Total Aktivasi DAN breakdown per-kegiatan sekaligus), dan
            bisa disembunyikan (summaryOpen, diingat per device). */}
        {summaryOpen && (
          <SummaryCard
            tabs={[
              { k: "today", l: "ACH. TODAY", sub: fmtShortDateLabel(date) },
              { k: "month", l: "ACH. MTD", sub: fmtMonthLabel(date) },
            ]}
            activeTab={categoryScope}
            onTabChange={setCategoryScope}
            target={categoryScope === "month" ? cardTarget?.target_month : cardTarget?.target_today}
            sp={categoryScope === "month" ? cardTarget?.total_month_sp : cardTarget?.total_today_sp}
            fwa={categoryScope === "month" ? cardTarget?.total_month_fwa : cardTarget?.total_today_fwa}
            loading={loading}
            categories={cardTarget?.categories}
            categoryScope={categoryScope}
          />
        )}
        <div style={{ marginBottom: 22 }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", minWidth: 0 }}>
            {showAllBranches ? "Pilih Branch" : "Pilih MC"} {summary?.branch_name ? <span style={{ fontWeight: 500, color: "#9A9AA6" }}>· {summary.branch_name}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {summary?.branch_id && (
              <button onClick={shareBranchLink} disabled={sharing}
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "#F4F5F7", borderRadius: 10, padding: "5px 10px", color: "#17181C", fontSize: 11.5, fontWeight: 700, opacity: sharing ? 0.6 : 1 }}>
                {sharing ? <Loader2 size={13} className="mh-spin" /> : <Share2 size={13} />} Bagikan Link
              </button>
            )}
            <button onClick={load} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #ECEDF0", background: "#fff", borderRadius: 10, padding: "5px 10px", color: "#5A5A68", fontSize: 11.5, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
              <RefreshCw size={13} className={loading ? "mh-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <ShellSpinner minHeight="160px" />
        ) : showAllBranches ? (
          // Mode "Semua Branch" - tampilkan daftar PENCAPAIAN PER BRANCH hari
          // itu (bukan per-MC), sumbernya regionSummary.branches. Klik satu
          // branch "turun" ke scope branch itu (setBranchId) biar bisa lanjut
          // isi per-MC - BUKAN langsung buka sheet catat penjualan (itu cuma
          // valid di level MC, bukan branch).
          !regionSummary?.branches?.length ? (
            <EmptyBox text="Belum ada data branch utk region ini di Master Data Site bulan ini." />
          ) : (
            // Daftar branch gaya LEADERBOARD (m/leaderboard/page.jsx) per
            // permintaan user: badge rank (mahkota #1, medali #2/#3, angka
            // bulat sisanya) - RPC SUDAH mengurutkan `branches` dr actual_today
            // terbesar (lihat migration mh_dtu_summary_region_add_dmo_name),
            // jadi index array = rank tampilan. Nama BRANCH tetap judul utama
            // (bukan nama orang spt leaderboard asli), nama DMO branch itu
            // jadi subtitle kecil dgn ikon profil, nilai Actual hari ini di
            // kanan dgn ikon tren naik + label kecil di bawahnya.
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {regionSummary.branches.map((b, i) => (
                <BranchRankRow key={b.branch_id} b={b} rank={i + 1}
                  onClick={() => { setBranchId(b.branch_id); try { localStorage.setItem("mh_dtu_branch_filter", b.branch_id); } catch {} }} />
              ))}
            </div>
          )
        ) : isUnscoped && !summary?.branch_id ? (
          <EmptyBox text="Pilih Region dan Branch dulu di atas untuk lihat/isi MC-nya." />
        ) : !summary?.mcs?.length ? (
          <EmptyBox text="Belum ada data MC untuk branch ini di Master Data Site bulan ini." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...summary.mcs].sort((a, b) => (Number(b.actual_today) || 0) - (Number(a.actual_today) || 0)).map((mc) => {
              const tgt = Number(mc.target_today) || 0;
              const act = Number(mc.actual_today) || 0;
              const pct = tgt > 0 ? Math.min(999, Math.round((act / tgt) * 100)) : 0;
              const pctColor = pct >= 100 ? "#1EA672" : pct >= 50 ? "#1565C0" : "#E0512B";
              return (
                <button key={mc.mc} onClick={() => setMcSheet(mc.mc)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, padding: "13px 14px", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Target size={16} color="#9A9AA6" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{mc.mc}</div>
                    <div style={{ fontSize: 11.5, color: "#9A9AA6", marginTop: 2 }}>
                      Actual <b style={{ color: "#17181C" }}>{fmtNum(mc.actual_today)}</b><span style={{ color: "#C4C4CC" }}> / </span>Target <b style={{ color: "#17181C" }}>{fmtNum(mc.target_today)}</b>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: pctColor, background: `${pctColor}18`, borderRadius: 999, padding: "3px 9px" }}>{pct}%</span>
                    <ChevronRight size={16} color="#C6C7CE" />
                  </div>
                </button>
              );
            })}
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

// Visual badge rank - SAMA PERSIS pola & warnanya dgn m/leaderboard/page.jsx
// (rankVisual) - mahkota utk #1, medali abu utk #2, medali coklat utk #3,
// sisanya angka bulat polos.
function rankVisual(rank) {
  if (rank === 1) return { icon: <Crown size={16} color="#B45309" />, bg: "rgba(180,83,9,0.08)" };
  if (rank === 2) return { icon: <Medal size={16} color="#6B7280" />, bg: "rgba(107,114,128,0.08)" };
  if (rank === 3) return { icon: <Medal size={16} color="#B45309" />, bg: "rgba(180,83,9,0.06)" };
  return { icon: null, bg: null };
}

// Baris branch gaya leaderboard - badge rank kiri, nama BRANCH sbg judul
// (bukan nama orang), subtitle kecil nama DMO branch itu dgn ikon profil,
// kanan nilai Actual hari ini + ikon tren naik + label kecil di bawahnya.
function BranchRankRow({ b, rank, onClick }) {
  const rv = rankVisual(rank);
  const tgt = Number(b.target_today) || 0;
  const act = Number(b.actual_today) || 0;
  const pct = tgt > 0 ? Math.min(999, Math.round((act / tgt) * 100)) : 0;
  const pctColor = pct >= 100 ? "#15803D" : pct >= 50 ? "#1565C0" : tgt > 0 ? "#E0512B" : "#B0B0BA";
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", width: "100%", border: "1px solid #ECEDF0", borderRadius: 14, padding: "11px 13px", textAlign: "left", cursor: "pointer" }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: rv.bg || "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>
        {rv.icon || rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {b.branch_name}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden" }}>
          <User size={10} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.dmo_name || "Belum ada DMO"}</span>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>
          {fmtNum(act)}<span style={{ fontSize: 11, fontWeight: 700, color: "#B0B0BA" }}>/{fmtNum(tgt)}</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 800, color: pctColor, background: `${pctColor}18`, borderRadius: 999, padding: "2px 8px", marginTop: 4 }}>
          <TrendingUp size={10} color={pctColor} /> {pct}%
        </div>
      </div>
    </button>
  );
}

function EmptyBox({ text }) {
  return (
    <div style={{ padding: "26px 16px", textAlign: "center", color: "#9A9AA6", fontSize: 12.5, background: "#fff", border: "1px solid #ECEDF0", borderRadius: 16, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function SummaryCard({ tabs, activeTab, onTabChange, target, sp, fwa, loading, categories, categoryScope }) {
  const total = (Number(sp) || 0) + (Number(fwa) || 0);
  const tgt = Number(target) || 0;
  const pct = tgt > 0 ? Math.min(999, Math.round((total / tgt) * 100)) : 0;
  const barPct = Math.min(100, pct);
  const color = pct >= 100 ? "#1EA672" : pct >= 50 ? "#1565C0" : "#E0512B";
  const activeMeta = (tabs || []).find((t) => t.k === activeTab);
  return (
    <div style={{ background: "#fff", border: "1px solid #ECEDF0", borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 2px rgba(13,17,23,0.03), 0 8px 20px rgba(13,17,23,0.04)" }}>
      <div style={{ display: "flex", background: "#F4F5F7", padding: 3, gap: 3, margin: "12px 12px 0" }}>
        {(tabs || []).map((t) => (
          <button key={t.k} onClick={() => onTabChange?.(t.k)} style={{
            flex: 1, border: "none", cursor: "pointer", padding: "8px 6px", borderRadius: 10, fontSize: 11, fontWeight: 800,
            letterSpacing: 0.2,
            background: activeTab === t.k ? "#fff" : "transparent",
            color: activeTab === t.k ? "#17181C" : "#9A9AA6",
            boxShadow: activeTab === t.k ? "0 1px 3px rgba(13,17,23,0.1)" : "none",
            transition: "background .15s ease, color .15s ease",
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{ padding: "14px 14px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 11 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.3 }}>Pencapaian ACH.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarDays size={10.5} color="#C4C4CC" />
            <span style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{activeMeta?.sub}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <AchCard label="Total Aktivasi" value={total} target={tgt} loading={loading} isTotal />
          {(categories || []).map((c) => (
            <AchCard key={c.category_id} label={c.category_name}
              value={categoryScope === "month" ? c.actual_month : c.actual_today}
              target={categoryScope === "month" ? c.target_month : c.target_today}
              loading={loading} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Kartu kecil ACH. per metrik - PERSIS pola SummaryCard/KegiatanRatio/
// KegiatanProgress di desktop daily-targets/page.jsx (grid kolom 2, label
// uppercase + dot, angka "tercapai / target" besar, divider putus2, progress
// bar tipis + "X% tercapai"), dipakai bareng utk "Total Aktivasi" DAN tiap
// jenis kegiatan - total 1 + N kartu (tipikal 6 utk 5 kegiatan aktif).
function AchCard({ label, value, target, loading, isTotal }) {
  const val = Number(value) || 0;
  const tgt = Number(target) || 0;
  const pct = tgt > 0 ? Math.min(999, Math.round((val / tgt) * 100)) : 0;
  const barPct = Math.min(100, pct);
  const color = pct >= 100 ? "#1EA672" : pct >= 50 ? "#1565C0" : tgt > 0 ? "#E0512B" : "#B0B0BA";

  // Kartu "Total Aktivasi" SENGAJA dibedakan jauh dari kartu per-kegiatan -
  // span 2 kolom penuh + background SOLID warna pencapaian (bukan tint tipis)
  // + teks putih, jadi langsung kelihatan beda/lebih "berat" dari kartu lain
  // tanpa perlu baca labelnya dulu.
  if (isTotal) {
    return (
      <div style={{ gridColumn: "1 / -1", position: "relative", borderRadius: 14, overflow: "hidden", background: color, padding: "13px 15px 12px", boxShadow: `0 6px 16px ${color}40` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={12} color="#fff" />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>{label}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color, background: "#fff", borderRadius: 999, padding: "3px 10px" }}>{loading ? "…" : `${pct}%`}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 9 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{loading ? "…" : fmtNum(val)}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)", lineHeight: 1 }}>/ {loading ? "…" : fmtNum(tgt)}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.28)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: loading ? "0%" : `${barPct}%`, borderRadius: 3, background: "#fff", transition: "width .3s ease" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", background: "#fff", border: `1.5px solid ${color}3d`, padding: "11px 10px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, color: "#6B6B78", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginBottom: 7 }}>
        <span style={{ fontSize: 16.5, fontWeight: 800, color: "#17181C", lineHeight: 1 }}>{loading ? "…" : fmtNum(val)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9A9AA6", lineHeight: 1 }}>/ {loading ? "…" : fmtNum(tgt)}</span>
      </div>
      <div style={{ paddingTop: 7, borderTop: "1px dashed #ECEDF0" }}>
        <div style={{ height: 5, borderRadius: 3, background: "#F0F1F4", overflow: "hidden", marginBottom: 5 }}>
          <div style={{ height: "100%", width: loading ? "0%" : `${barPct}%`, borderRadius: 3, background: color, transition: "width .3s ease" }} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color }}>{loading ? "…" : `${pct}% tercapai`}</div>
      </div>
    </div>
  );
}


function StatRow({ icon: Icon, iconBg, iconColor, label, value, loading }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 22, height: 22, borderRadius: 7, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={11} color={iconColor} />
      </div>
      <div style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: "#5A5A68" }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C" }}>{loading ? "…" : fmtNum(value)}</div>
    </div>
  );
}

function McActualSheet({ email, mc, date: initialDate, branchId, onClose, onSaved }) {
  const [date, setDate] = useState(initialDate);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vals, setVals] = useState({});
  const [msisdns, setMsisdns] = useState({});
  const [msisdnDraft, setMsisdnDraft] = useState({});
  const [msisdnOpen, setMsisdnOpen] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const sheetRef = useRef(null);

  // Ada perubahan yg belum disimpan? Dibandingkan LANGSUNG dari vals vs angka
  // actual_sp_today/actual_fwa_today yg baru dimuat/disimpan dari DB - selalu
  // akurat tiap render, tidak perlu flag manual yg bisa lupa di-reset.
  const dirty = useMemo(() => {
    for (const c of detail?.categories || []) {
      const v = vals[c.category_id] || {};
      const nSp = v.sp === "" || v.sp == null ? 0 : Number(v.sp);
      const nFwa = v.fwa === "" || v.fwa == null ? 0 : Number(v.fwa);
      if (nSp !== (c.actual_sp_today || 0) || nFwa !== (c.actual_fwa_today || 0)) return true;
    }
    return false;
  }, [detail, vals]);

  function requestClose() {
    if (dirty) { setConfirmClose(true); return; }
    sheetRef.current ? sheetRef.current.close(onClose) : onClose();
  }

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_dtu_mc_detail", { p_caller_email: email, p_mc: mc, p_date: date, p_branch_id: branchId || null });
    if (!error && data) {
      // Kalau ada kategori yg belum ada input manual (SP & FWA masih 0) TAPI
      // ada data "backdoor" (import CMS) di hari itu - langsung link-kan OTOMATIS
      // di background (tanpa nunggu user tekan Simpan): panggil mh_dtu_actual_upsert
      // dgn SP = angka backdoor (semua dianggap SP), yg sekalian nge-nolkan
      // sumber backdoor-nya di mh_daily_actuals biar tidak dobel hitung.
      const toLink = (data.categories || []).filter((c) => {
        const hasManual = (Number(c.actual_sp_today) || 0) > 0 || (Number(c.actual_fwa_today) || 0) > 0;
        return !hasManual && Number(c.backdoor_today) > 0;
      });
      if (toLink.length) {
        await Promise.all(toLink.map((c) =>
          supabaseMarta.rpc("mh_dtu_actual_upsert", {
            p_caller_email: email, p_date: date, p_mc: mc, p_category_id: c.category_id,
            p_actual_sp: Number(c.backdoor_today) || 0, p_actual_fwa: 0, p_branch_id: branchId || null,
          })
        ));
        // re-fetch biar actual_sp_today/backdoor_today kebaca dari DB yg sudah ke-link.
        const refetched = await supabaseMarta.rpc("mh_dtu_mc_detail", { p_caller_email: email, p_mc: mc, p_date: date, p_branch_id: branchId || null });
        if (!refetched.error && refetched.data) data.categories = refetched.data.categories;
      }

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

  async function save(closeAfter) {
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
      if (closeAfter) { setConfirmClose(false); sheetRef.current ? sheetRef.current.close(onSaved) : onSaved(); }
      else onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan pencatatan penjualan"); }
    finally { setSaving(false); }
  }

  function discardAndClose() {
    setConfirmClose(false);
    sheetRef.current ? sheetRef.current.close(onClose) : onClose();
  }

  const saveBtn = (
    <button onClick={() => save(false)} disabled={saving || loading || !detail?.categories?.length}
      style={{ width: "100%", padding: "13px", borderRadius: 14, border: "none", background: BRAND, color: "#fff", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: saving || loading ? 0.7 : 1 }}>
      {saving ? <Loader2 size={15} className="mh-spin" /> : <Check size={15} />} {saving ? "Menyimpan…" : "Simpan Pencatatan Penjualan"}
    </button>
  );

  return (
    <>
    <BottomSheet ref={sheetRef} onClose={requestClose} zIndex={200} borderRadius="24px 24px 0 0"
      disableBackdropClose={dirty} disableSwipeClose={dirty}
      footer={!loading && !!detail?.categories?.length ? saveBtn : null}>
      <div style={{ padding: "4px 0 4px", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0, fontSize: 16, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mc}</div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, background: "#F4F5F7", border: "1px solid #ECEDF0", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>
              <CalendarDays size={12} color="#5A5A68" />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#17181C", whiteSpace: "nowrap" }}>{fmtChipDateLabel(date)}</span>
              <ChevronDown size={12} color="#9A9AA6" />
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
            </label>
            <button type="button" onClick={requestClose}
              style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {err && <div style={{ background: "#FFF1F0", border: "1px solid #FFCCC7", color: "#C62828", borderRadius: 10, padding: "8px 11px", fontSize: 12, marginBottom: 10 }}>{err}</div>}

        {loading ? (
          <ShellSpinner minHeight="120px" />
        ) : !detail?.categories?.length ? (
          <div style={{ padding: "18px 10px", textAlign: "center", color: "#9A9AA6", fontSize: 12.5 }}>
            Belum ada kegiatan aktif - tambahkan dulu di CMS Target Harian.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <McTotalBar categories={detail.categories} vals={vals} />
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
      </div>
    </BottomSheet>

    {confirmClose && (
      <div onClick={() => setConfirmClose(false)}
        style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(23,24,28,0.35)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 340, background: "#fff", borderRadius: 20, padding: "22px 20px 18px", fontFamily: FF, boxShadow: "0 20px 60px rgba(23,24,28,0.3)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", marginBottom: 6 }}>Ada perubahan belum disimpan</div>
          <div style={{ fontSize: 12.5, color: "#6B6B78", lineHeight: 1.5, marginBottom: 18 }}>
            Simpan dulu pencatatan penjualan {mc} sebelum menutup, atau buang perubahannya?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => save(true)} disabled={saving}
              style={{ width: "100%", padding: "12px", borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={14} className="mh-spin" /> : <Check size={14} />} {saving ? "Menyimpan…" : "Simpan & Tutup"}
            </button>
            <button onClick={discardAndClose} disabled={saving}
              style={{ width: "100%", padding: "12px", borderRadius: 13, border: "1px solid #FFCCC7", background: "#FFF1F0", color: "#C62828", fontSize: 13.5, fontWeight: 800 }}>
              Buang Perubahan
            </button>
            <button onClick={() => setConfirmClose(false)} disabled={saving}
              style={{ width: "100%", padding: "12px", borderRadius: 13, border: "none", background: "none", color: "#9A9AA6", fontSize: 13.5, fontWeight: 700 }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function McTotalBar({ categories, vals }) {
  const tgt = (categories || []).reduce((sum, c) => sum + (Number(c.target_today) || 0), 0);
  const act = (categories || []).reduce((sum, c) => {
    const v = vals[c.category_id] || {};
    return sum + (Number(v.sp) || 0) + (Number(v.fwa) || 0);
  }, 0);
  const pct = tgt > 0 ? Math.min(999, Math.round((act / tgt) * 100)) : 0;
  const barPct = Math.min(100, pct);
  const color = pct >= 100 ? "#1EA672" : pct >= 50 ? "#1565C0" : "#E0512B";
  return (
    <div style={{ border: "1px solid #ECEDF0", borderRadius: 16, padding: "12px 14px", background: "#FAFAFB" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <Check size={12} color={color} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#9A9AA6", textTransform: "uppercase", letterSpacing: 0.3 }}>Total</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 19, fontWeight: 800, color: "#17181C", lineHeight: 1 }}>{fmtNum(act)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#9A9AA6", lineHeight: 1 }}>/ {fmtNum(tgt)}</span>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#F0F1F4", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barPct}%`, borderRadius: 3, background: color, transition: "width .3s ease" }} />
      </div>
    </div>
  );
}

function CategoryCard({ c, email, mc, date, branchId, vals, onChangeVal, msisdns, msisdnOpen, setMsisdnOpen, msisdnDraft, setMsisdnDraft, onAddMsisdn, onRemoveMsisdn }) {
  const totalToday = (Number(vals.sp) || 0) + (Number(vals.fwa) || 0);
  const tgtToday = Number(c.target_today) || 0;
  const pct = tgtToday > 0 ? Math.min(999, Math.round((totalToday / tgtToday) * 100)) : 0;
  const pctColor = pct >= 100 ? "#1EA672" : pct >= 50 ? "#1565C0" : tgtToday > 0 ? "#E0512B" : "#B0B0BA";
  const catColor = categoryColor(c.category_id);
  return (
    <div style={{ border: "1px solid #ECEDF0", borderLeft: `3px solid ${catColor}`, borderRadius: 16, background: "#fff", padding: "13px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: catColor, flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.category_name}</div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#9A9AA6", fontWeight: 600, whiteSpace: "nowrap" }}>Target {fmtNum(c.target_today)}</span>
          {tgtToday > 0 ? (
            <div style={{ fontSize: 11.5, fontWeight: 800, color: pctColor, background: `${pctColor}16`, borderRadius: 999, padding: "3px 10px" }}>
              {pct}% ACH.
            </div>
          ) : totalToday > 0 ? (
            <div style={{ fontSize: 11.5, fontWeight: 800, color: BRAND, background: "rgba(237,28,36,0.08)", borderRadius: 999, padding: "3px 10px" }}>
              {totalToday} input
            </div>
          ) : null}
        </div>
      </div>

      {SHOW_MSISDN_INPUT && c.needs_msisdn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {["sp", "fwa"].map((kind, i) => (
            <QtyRow key={kind} kind={kind} categoryId={c.category_id} needsMsisdn={c.needs_msisdn} isLast={i === 1}
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
      ) : (
        <QtyRowCombined vals={vals} onChangeVal={onChangeVal} />
      )}
    </div>
  );
}

function QtyRowCombined({ vals, onChangeVal }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {["sp", "fwa"].map((kind) => {
        const meta = SP_FWA[kind];
        const Icon = meta.icon;
        const value = vals[kind];
        return (
          <div key={kind} style={{ display: "flex", alignItems: "center", gap: 9, background: "#FAFAFB", border: "1px solid #F0F0F3", borderRadius: 13, padding: "7px 8px 7px 10px" }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={12} color={meta.color} />
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", marginRight: "auto" }}>{meta.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button type="button" onClick={() => onChangeVal(kind, String(Math.max(0, (Number(value) || 0) - 1)))}
                style={{ width: 28, height: 28, borderRadius: 9, border: "none", background: meta.bg, color: meta.color, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                −
              </button>
              <input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChangeVal(kind, e.target.value)}
                placeholder="0"
                style={{ width: 40, padding: "6px 2px", borderRadius: 9, border: "1px solid #E3E4E9", background: "#fff", fontSize: 13.5, fontWeight: 800, textAlign: "center", color: "#17181C" }} />
              <button type="button" onClick={() => onChangeVal(kind, String((Number(value) || 0) + 1))}
                style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: meta.bg, color: meta.color, fontSize: 19, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QtyRow({ kind, value, onChangeVal, needsMsisdn, isLast, msisdnList, isOpen, onToggleOpen, draft, onDraftChange, onAdd, onRemove }) {
  const meta = SP_FWA[kind];
  const Icon = meta.icon;
  // Input detail nomor MSISDN disembunyikan sementara (lihat SHOW_MSISDN_INPUT
  // di atas) - kolom qty SP/FWA tetap jalan seperti biasa, cuma panel
  // "Detail nomor yang disubmit" + tambah-nomornya yg disembunyikan dulu.
  const showMsisdn = SHOW_MSISDN_INPUT && needsMsisdn;
  return (
    <div style={{ padding: "10px 14px", borderBottom: isLast ? "none" : "1px solid #F3F3F6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={13} color={meta.color} />
        </div>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{meta.label}</div>
        {showMsisdn && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: meta.bg, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: meta.color }}>
            Total MSISDN {msisdnList.length}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" onClick={() => onChangeVal(String(Math.max(0, (Number(value) || 0) - 1)))}
            style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #ECEDF0", background: "#fff", color: "#5A5A68", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            −
          </button>
          <input type="number" inputMode="numeric" value={value ?? ""} onChange={(e) => onChangeVal(e.target.value)}
            placeholder="0"
            style={{ width: 46, padding: "6px 4px", borderRadius: 9, border: "1px solid #ECEDF0", background: "#FAFAFB", fontSize: 13.5, fontWeight: 800, textAlign: "center", color: meta.color }} />
          <button type="button" onClick={() => onChangeVal(String((Number(value) || 0) + 1))}
            style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #ECEDF0", background: "#fff", color: "#5A5A68", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            +
          </button>
        </div>
      </div>

      {showMsisdn && (
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
