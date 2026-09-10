"use client";
/**
 * /martahub/m/leaderboard - Peringkat BME/RGE (web mobile).
 * Baca langsung dari view `mh_leaderboard_summary` (agregat approved-activity
 * bulan ini, dihitung server-side - lihat migrasi
 * rebuild_leaderboard_summary_multi_metric_v2).
 *
 * Design catatan (permintaan user, jgn diringkas balik jadi 1 skor gabungan):
 * - TIDAK ADA skor gabungan/blended (final_score versi lama BUG: rasio
 *   revenue/cost tanpa batas atas bisa meledak ratusan ribu persen kalau ada
 *   1 activity dgn cost_actual kecil/salah input, otomatis nyangkut rank #1
 *   padahal bukan performa terbaik).
 * - Ranking MULTI-METRIK, user pilih sendiri mode-nya lewat chip: Revenue
 *   Actual, Revenue Plan, Jumlah Plan (mode ACH_* dihapus - lihat MODES).
 * - Setiap baris juga menampilkan Branch & Brand orangnya, bukan cuma nama,
 *   supaya jelas asal/scope tiap peserta leaderboard.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Crown, Medal, TrendingUp, MapPin } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt, fmtRp } from "../_shared/activityUi";
import { BRAND_DISPLAY } from "../_shared/planData";

const COLS =
  "id,user_id,user_name,branch_id,branch_name,region,brand,total_activities," +
  "target_rev_3m,actual_rev_3m,target_sp,actual_sp,target_fwa,actual_fwa," +
  "ach_revenue_pct,ach_sp_pct,ach_fwa_pct,geo_compliance";

// Mode ranking - HANYA metrik Revenue & Jumlah Plan (mode ACH_* dihapus atas
// permintaan user - ranking berbasis persentase capaian dianggap kurang
// relevan dibanding angka nominal langsung).
const MODES = [
  { key: "actual_rev", label: "Revenue Actual", field: "actual_rev_3m", fmt: fmtRp, desc: "Total realisasi revenue bulan ini (Actual)" },
  { key: "plan_rev", label: "Revenue Plan", field: "target_rev_3m", fmt: fmtRp, desc: "Total target revenue di Plan yang disetujui (Plan)" },
  { key: "jumlah_plan", label: "Jumlah Plan", field: "total_activities", fmt: (v) => `${fmtInt(v)} plan`, desc: "Jumlah Plan/Activity bulan ini" },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const { loading: sessionLoading, userId, scope } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(MODES[0]);

  // Pilihan Branch & Brand - SEKARANG dropdown beneran (bukan cuma toggle
  // "branch saya"/"region saya"/"semua" spt sebelumnya), supaya role yang
  // scope-nya SATU REGION (bukan satu branch tetap) - head, tmv, atau admin/
  // spm_sumatera yang unscoped - tetap bisa mempersempit ke branch/brand
  // TERTENTU, bukan cuma "region saya" vs "semua".
  //
  // BUG LAMA yang diperbaiki: chip "BRANCH" dulu di-disable TOTAL utk role
  // yang tidak punya SATU branch tetap (head/tmv/admin/spm_sumatera -
  // scope.branchName selalu kosong utk mereka) - jadi begitu diklik "Region"
  // atau "Semua" lalu coba klik "Branch" lagi, TIDAK PERNAH bisa aktif sama
  // sekali (bukan reset yang salah, tapi memang tidak pernah bisa dipakai).
  // Sekarang branch dipilih lewat dropdown berisi daftar branch yang
  // BENAR-BENAR ada dlm cakupan role-nya (region-nya kalau head/tmv, semua
  // branch kalau unscoped, HANYA branch-nya sendiri kalau bme_rge/tm biasa),
  // jadi tidak ada lagi tombol yang permanen tidak bisa diklik.
  const [branchList, setBranchList] = useState([]); // {id,name,region}[] - dari mh_branches, difilter cakupan role di bawah
  const [branchPick, setBranchPick] = useState(""); // "" = semua branch dlm cakupan
  const [brandPick, setBrandPick] = useState(""); // "" = semua brand dlm cakupan (cuma relevan kalau scope.brand kosong)

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const [{ data, error }, { data: branches, error: be }] = await Promise.all([
          supabaseMarta.from("mh_leaderboard_summary").select(COLS).limit(500),
          supabaseMarta.from("mh_branches").select("id,name,region"),
        ]);
        if (error) throw error;
        if (be) throw be;
        if (alive) { setRows(data || []); setBranchList(branches || []); }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat leaderboard");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading]);

  // Daftar branch yang BOLEH dipilih role ini - bme_rge/tm (punya SATU
  // branch tetap, scope.branchName terisi) cuma lihat branch-nya sendiri
  // (dropdown tidak relevan utk mereka, disembunyikan); head/tmv dibatasi
  // ke branch-branch DALAM region mereka; admin/spm_sumatera (unscoped)
  // lihat semua branch.
  const allowedBranches = useMemo(() => {
    if (scope?.branchName) return [];
    if (scope?.unscoped) return branchList.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (scope?.region) return branchList.filter((b) => b.region === scope.region).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return [];
  }, [branchList, scope]);

  const filtered = useMemo(() => {
    let list = rows || [];
    // Brand: dikunci ke scope.brand kalau role-nya memang terikat 1 brand
    // (bme_rge/tm/tmv-brand-tetap) - selain itu (unscoped, atau head/tmv yg
    // tidak terikat brand tertentu) ikuti pilihan dropdown brandPick.
    if (scope?.brand) list = list.filter((r) => (r.brand || "").toLowerCase() === scope.brand.toLowerCase());
    else if (brandPick) list = list.filter((r) => (r.brand || "").toLowerCase() === brandPick.toLowerCase());
    // Branch/Region: bme_rge/tm (branchName tetap) selalu dibatasi ke branch
    // sendiri. Role region-scope (head/tmv) SELALU dibatasi ke region
    // mereka dulu (tidak bisa lihat region lain), lalu opsional dipersempit
    // lagi ke satu branch lewat branchPick. Unscoped (admin/spm_sumatera)
    // tidak dibatasi region, cuma ikut branchPick kalau dipilih.
    if (scope?.branchName) list = list.filter((r) => r.branch_name === scope.branchName);
    else {
      if (scope?.region && !scope?.unscoped) list = list.filter((r) => r.region === scope.region);
      if (branchPick) list = list.filter((r) => r.branch_id === branchPick);
    }
    return list
      .slice()
      .sort((a, b) => (b[mode.field] || 0) - (a[mode.field] || 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows, scope, branchPick, brandPick, mode]);

  const myRow = filtered.find((r) => r.user_id === userId);

  if (sessionLoading || rows === null) {
    return (
      <MobileShell active="leaderboard">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px" }}><BackBar router={router} /></div>
        <ShellSpinner />
      </MobileShell>
    );
  }

  return (
    <MobileShell active="leaderboard">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Leaderboard</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>
          {mode.desc}
        </div>

        {/* Mode ranking - scrollable horizontal, biar 6 opsi ga bikin sempit */}
        {/* Scrollbar mode-chip DISEMBUNYIKAN (className mh-hide-scrollbar,
            lihat <style jsx> di bawah) - scroll horizontal tetap jalan,
            cuma bar abu2 di bawahnya yg dihilangkan (mengganggu visual). */}
        <div className="mh-hide-scrollbar" style={{ display: "flex", gap: 7, marginTop: 14, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {MODES.map((m) => {
            const active = mode.key === m.key;
            return (
              <button key={m.key} onClick={() => setMode(m)}
                style={{
                  flexShrink: 0, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#ED1C24" : "#FFFFFF", border: `1px solid ${active ? "#ED1C24" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                {m.label}
              </button>
            );
          })}
        </div>

        <style jsx>{`
          .mh-hide-scrollbar::-webkit-scrollbar { display: none; height: 0; }
        `}</style>

        {/* Cakupan: branch tetap (bme_rge/tm) ditampilkan sbg badge info saja
            (tidak bisa diganti - memang scope akunnya). Role region-scope
            (head/tmv) & unscoped (admin/spm_sumatera) dapat DROPDOWN Branch
            beneran (bukan lagi chip yg permanen ke-disable) + dropdown Brand
            kalau brand mereka memang tidak terkunci ke satu brand - jadi
            SETIAP role bisa mempersempit ke branch/brand yg dia mau, tapi
            tetap dibatasi ke cakupan role-nya (lihat allowedBranches/scope
            di atas - region head/tmv tidak pernah bisa "bocor" lihat region
            lain lewat dropdown ini). */}
        {scope?.branchName ? (
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "#F5F5F7", border: "1px solid #E9EAEE" }}>
            <MapPin size={12} color="#5A5A68" />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68", fontFamily: FF }}>{scope.branchName}{scope?.brand ? ` · ${BRAND_DISPLAY[scope.brand.toLowerCase()] || scope.brand.toUpperCase()}` : ""}</span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {scope?.region && !scope?.unscoped && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, background: "#F5F5F7", border: "1px solid #E9EAEE" }}>
                <MapPin size={12} color="#5A5A68" />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68", fontFamily: FF }}>{scope.region}</span>
              </div>
            )}
            {allowedBranches.length > 0 && (
              <select value={branchPick} onChange={(e) => setBranchPick(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 999, background: branchPick ? "#17181C" : "#F5F5F7", border: `1px solid ${branchPick ? "#17181C" : "#E9EAEE"}`, color: branchPick ? "#FFFFFF" : "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                <option value="">Semua Branch</option>
                {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {scope?.brand ? (
              <div style={{ display: "inline-flex", alignItems: "center", padding: "7px 12px", borderRadius: 999, background: "#F5F5F7", border: "1px solid #E9EAEE" }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68", fontFamily: FF }}>{BRAND_DISPLAY[scope.brand.toLowerCase()] || scope.brand.toUpperCase()}</span>
              </div>
            ) : (
              <select value={brandPick} onChange={(e) => setBrandPick(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 999, background: brandPick ? "#17181C" : "#F5F5F7", border: `1px solid ${brandPick ? "#17181C" : "#E9EAEE"}`, color: brandPick ? "#FFFFFF" : "#5A5A68", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                <option value="">Semua Brand</option>
                <option value="im3">IM3</option>
                <option value="tri">3ID</option>
              </select>
            )}
          </div>
        )}
      </div>

      {myRow && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ borderRadius: 18, background: BRAND, padding: "16px 18px", color: "#fff", boxShadow: "0 6px 16px rgba(17,17,20,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>Peringkat Anda</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 3 }}>#{myRow.rank}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>{mode.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{mode.fmt(myRow[mode.field])}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px 40px" }}>
        {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada data</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Leaderboard akan muncul setelah ada Plan tervalidasi.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((r) => <LeaderRow key={r.id} r={r} mode={mode} isMe={r.user_id === userId} />)}
          </div>
        )}
      </div>
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

function rankVisual(rank) {
  if (rank === 1) return { icon: <Crown size={16} color="#B45309" />, bg: "rgba(180,83,9,0.08)" };
  if (rank === 2) return { icon: <Medal size={16} color="#6B7280" />, bg: "rgba(107,114,128,0.08)" };
  if (rank === 3) return { icon: <Medal size={16} color="#B45309" />, bg: "rgba(180,83,9,0.06)" };
  return { icon: null, bg: null };
}

function LeaderRow({ r, mode, isMe }) {
  const rv = rankVisual(r.rank);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, background: isMe ? "#FFF5F6" : "#FFFFFF",
      border: `1px solid ${isMe ? "#F7C6C9" : "#E9EAEE"}`, borderRadius: 14, padding: "11px 13px", fontFamily: FF,
    }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: rv.bg || "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>
        {rv.icon || r.rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.user_name || "-"} {isMe && <span style={{ color: "#ED1C24" }}>(Anda)</span>}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden" }}>
          <MapPin size={10} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.branch_name || "-"}
            {r.brand && <> · <span style={{ color: "#5A5A68", fontWeight: 800 }}>{BRAND_DISPLAY[r.brand] || String(r.brand).toUpperCase()}</span></>}
            {" "}· {fmtInt(r.total_activities)} plan
          </span>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>
          <TrendingUp size={12} color="#15803D" /> {mode.fmt(r[mode.field])}
        </div>
        <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 600 }}>{mode.label}</div>
      </div>
    </div>
  );
}
