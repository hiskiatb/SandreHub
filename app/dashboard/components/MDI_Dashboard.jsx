"use client";
// MDI Dashboard — menu BARU (permintaan user - "tambahkan satu Menu MDI
// Dashboard, jadi nanti disini isinya per bulannya ada slide semua
// partner yang pada masing-masing slidenya itu, pertama ada kpi score,
// lalu ada Leaderboard PNL per Area dari margin tertinggi ke terendah,
// lalu Piutang AR sisa tunggakan ... dibuat leaderboard kontribusi AR,
// siapa top 5 area yang berkontribusi AR paling besar, lalu ada DSE
// productivity area mana yang paling berkontribusi dse-nya, semuanya per
// masing-masing partner per masing-masing bulannya, buat 1 partner 1
// slide per periode, UI & animasi bagus, pakai chart/grafik, dipakai utk
// analisis").
//
// Sumber data (semua utk 1 Bulan+Tahun terpilih):
//  - pnl_reports_v2: margin per Area (pakai util summarizePendapatan /
//    MARGIN_ROWS yg sudah ada di PNL_FormPendapatanV2.jsx biar angkanya
//    identik dgn modul P&L) + kpi_score per Area -> KPI score partner =
//    rata2 kpi_score semua Area partner itu yg sudah diisi (>0) bulan ybs.
//  - mf_dse_database (is_revoked=false): mapping dse_code -> partner
//    (kolom "mdi") - mf_dse_prod_ar sendiri TIDAK menyimpan nama partner,
//    cuma branch/mc, jadi butuh tabel ini utk tau DSE itu punya Partner
//    mana.
//  - mf_dse_prod_ar (tanggal dlm bulan terpilih): productivity =
//    SUM(nilai_sp+nilai_fwa+nilai_voucher+nilai_saldo) sepanjang bulan
//    itu, dikelompokkan per Area (branch).
//  - AR / sisa piutang (bug ditemukan user - "ar bukannya sudah banyak
//    ya mengapa ini masih 0 semua"): field `mf_dse_prod_ar.ar_piutang`
//    (running-balance harian) TERNYATA bukan sumber utama AR di aplikasi
//    ini - sebagian besar data piutang sebenarnya ada di 3 LEDGER
//    TERPISAH yg sama persis dipakai modul Prod. & AR (lihat
//    computeArAsOf di DSE_ProdAR.jsx):
//      * ar_piutang_items   (level DSE,      key dse_code)
//      * dso_piutang_items  (level DSO/DSP,  key mc/District)
//      * hoa_piutang_items  (level HoA,      key branch/Area langsung)
//    "Sisa piutang" per transaksi = total transaksi (kalau tanggal_
//    transaksi <= akhir bulan terpilih) DIKURANGI pembayaran yg sudah
//    diterima s.d. tanggal yg sama (bukan cuma dijumlah mentah2), lalu
//    hasilnya dikelompokkan per Area - FULL breakdown semua Area (bukan
//    cuma Top 5 lagi, permintaan user: "sajikan semuanya breakdown per
//    area"), diurutkan kontribusi terbesar dulu.
//
// PENTING (bug ditemukan user - "mengapa masih banyak yang null"): kolom
// `branch` di tabel mf_dse_prod_ar TERNYATA SELALU KOSONG di database
// (dicek langsung via SQL), jadi Area/branch WAJIB diambil dari
// mf_dse_database (via dse_code/mc, atau langsung dari branch utk HoA),
// BUKAN dari baris produktivitas/AR itu sendiri - lihat `dseInfo` /
// `mcInfo` / `branchInfo` di bawah.
//
// Partner yg ditampilkan = gabungan partner yg py data PNL/AR/Produktivitas
// bulan ybs (supaya partner yg blm sempat isi salah satu sumber data tetap
// muncul slide-nya, section yg kosong cukup ditandai "Belum ada data").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, ChevronLeft, ChevronRight, Gauge, Maximize2, Minimize2,
  Pause, PieChart as PieChartIcon, Play, TrendingDown, TrendingUp, Trophy, Users, Wallet,
} from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT, GRAD, mk, numOrZero, fmtIDR, MONTHS_ID } from "./PNL_V2Shared";
import { DATA_PROVIDED_ROWS, MARGIN_ROWS, summarizePendapatan } from "./PNL_FormPendapatanV2";
import { summarizePengeluaran } from "./PNL_FormPengeluaranV2";
import { hasRole } from "./DSE_ProdAR";

// FIX (permintaan user - "dashboard mdi juga bisa diakses harusnya", lalu
// scope-nya diklarifikasi: "scoped, admin_partner/region/circle saja, admin_mc
// & admin_area TETAP tidak akses" - sejalan dgn 3 tingkat yg sama dipakai di
// Payout Tracker): partner MULTI-VALUE (dipisah koma) pakai normalizeName
// biar aman dari selisih prefix PT./CV./Tbk. antar sumber data (mf_dse_
// database.mdi vs masterData.partner_name vs profiles.partner_name) - copy
// persis dari PayoutTracker.jsx (helper kecil, sengaja diduplikasi di sini
// drpd di-share lintas file demi kesederhanaan, konsisten dgn pola yg sudah
// ada di codebase ini).
function normalizeName(s) {
  if (!s) return "";
  let n = s.toString().trim().toUpperCase();
  for (const sf of [", PT.", ", CV.", ", TBK.", ", PT", ", CV", ", TBK"]) {
    if (n.endsWith(sf)) { n = n.slice(0, -sf.length).trimEnd().replace(/,\s*$/, "").trim(); break; }
  }
  for (const pf of ["PT. ", "CV. ", "TBK. ", "PT ", "CV ", "TBK "]) {
    if (n.startsWith(pf)) { n = n.slice(pf.length).trim(); break; }
  }
  return n.trim();
}

const START_YEAR = 2026;
const now = new Date();

const COLORS = {
  pnl: { fg: "#2563EB", bg: "rgba(37,99,235,0.12)", grad: "linear-gradient(90deg,#2563EB,#60A5FA)" },
  ar:  { fg: "#ED1C24", bg: "rgba(237,28,36,0.12)",  grad: "linear-gradient(90deg,#ED1C24,#FB7185)" },
  dse: { fg: "#059669", bg: "rgba(5,150,105,0.12)",  grad: "linear-gradient(90deg,#059669,#34D399)" },
  income: { fg: "#2563EB", bg: "rgba(37,99,235,0.12)" },
  cost: { fg: "#ED1C24", bg: "rgba(237,28,36,0.12)" },
};

// Palet kategorikal utk slice pie/donut - dipakai bergantian utk Komposisi
// Pendapatan (max 8 slice: 6 produk margin + Distribution Fee & Rewards +
// Di Luar Template) & Komposisi Cost Structure (5 slice: OPEX, HR Cost
// Sales/Non-Sales, Marketing Cost, Cost of Money).
const PIE_COLORS = ["#2563EB", "#ED1C24", "#059669", "#F59E0B", "#7C3AED", "#0EA5E9", "#DB2777", "#65A30D"];

// BARU (permintaan user - "rapikan menjadi sangat rapi singkat jadi jt"):
// angka Rupiah di leaderboard/donut dipersingkat (Rb/Jt/M/T) biar kartu
// ga penuh digit panjang - angka LENGKAP (fmtIDR biasa) tetap dipakai di
// tempat lain yg butuh presisi penuh (mis. modul PNL asli), cuma dashboard
// analisis ini yg dipersingkat demi kerapian & bisa dibaca sekilas.
function fmtIDRCompact(n) {
  const v = numOrZero(n);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const unit = (div, suffix) => {
    const num = abs / div;
    const str = (Number.isInteger(num) ? num : num.toFixed(1)).toString().replace(".", ",");
    return `${sign}Rp ${str} ${suffix}`;
  };
  if (abs >= 1e12) return unit(1e12, "T");
  if (abs >= 1e9) return unit(1e9, "M");
  if (abs >= 1e6) return unit(1e6, "Jt");
  if (abs >= 1e3) return unit(1e3, "Rb");
  return fmtIDR(v);
}

// Kolom pnl_reports_v2 yg dibutuhkan - dibangun dari MARGIN_ROWS/
// DATA_PROVIDED_ROWS yg sudah ada (bukan di-hardcode manual) supaya kalau
// nanti ada produk/komponen baru ditambah di PNL_FormPendapatanV2.jsx,
// query di sini otomatis ikut tanpa perlu diubah manual.
const PNL_SELECT_COLS = [
  "partner_name", "branch", "kpi_score", "luar_template_amount", "pengeluaran_data",
  ...MARGIN_ROWS.flatMap((r) => [`margin_${r.id}`, `margin_${r.id}_3id`]),
  ...DATA_PROVIDED_ROWS.map((r) => r.id),
].join(", ");

function monthRange(month, year) {
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

// Select kustom panah manual (konsisten sama teknik FilterSelect di
// page.jsx / ScopeSelector di PNL_FormPengeluaranV2.jsx - permintaan user
// sebelumnya: "ya lakukan hal yang sama").
function PillSelect({ value, onChange, options, t, minWidth = 110 }) {
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none", padding: "8px 30px 8px 14px",
          borderRadius: 10, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi,
          fontSize: 13, fontWeight: 700, fontFamily: "inherit", minWidth, cursor: "pointer",
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
        <ChevronDown size={13} />
      </div>
    </div>
  );
}

function IconBtn({ icon, onClick, t, title, active }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${active ? "transparent" : t.inputBd}`, background: active ? GRAD : t.card, color: active ? "#fff" : t.hi,
      cursor: "pointer", flexShrink: 0, transition: "all .14s",
    }}>{icon}</button>
  );
}

// Ring KPI score — conic-gradient dipakai sbg gauge melingkar, angka besar
// di tengah. value diasumsikan 0-100 (persen).
function KpiRing({ value, t }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
      style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: `conic-gradient(#ED1C24 ${pct * 3.6}deg, ${t.sub} 0deg)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: t.sm }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: t.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: t.hi, lineHeight: 1, letterSpacing: "-0.02em" }}>{value ? pct.toFixed(1).replace(".", ",") : "—"}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>% KPI</span>
        </div>
      </div>
    </motion.div>
  );
}

// Lencana peringkat 1-3 pakai medali warna (emas/perak/perunggu), di luar
// top-3 pakai angka polos - permintaan user: "buat uinya sangat bagus".
const MEDALS = ["#F5B915", "#B9C2CC", "#C87D3C"];
function RankBadge({ rank, color, t }) {
  const medal = MEDALS[rank];
  if (medal) {
    return (
      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: medal, color: "#fff", fontSize: 10.5, fontWeight: 800, boxShadow: `0 2px 6px ${medal}66` }}>
        {rank + 1}
      </div>
    );
  }
  return (
    <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.sub, color: t.lo, fontSize: 10.5, fontWeight: 800 }}>
      {rank + 1}
    </div>
  );
}

// 1 panel leaderboard (bar chart horizontal, animasi lebar bar dari 0).
// BARU (permintaan user - "sajikan semuanya breakdown per area ... buat
// uinya sangat bagus"): header skrg nampilin ringkasan Total + jumlah
// Area, dan daftarnya full (tidak dipotong Top-N lagi) dgn area scroll
// internal (maxHeight) + lencana medali Top-3 - biar tetap rapi walau
// jumlah Area-nya banyak per Partner.
function Leaderboard({ title, icon, items, color, t, emptyText }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const grandTotal = items.reduce((s, i) => s + i.value, 0);
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, boxShadow: t.sm }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: color.bg, color: color.fg, flexShrink: 0 }}>{icon}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.hi, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{title}</div>
        </div>
        {items.length > 0 && (
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: color.fg, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, whiteSpace: "nowrap" }}>{fmtIDRCompact(grandTotal)}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em" }}>{items.length} Area</div>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: t.lo, padding: "26px 0", textAlign: "center" }}>{emptyText}</div>
      ) : (
        <div className="mdidash-scroll" style={{ display: "flex", flexDirection: "column", gap: 11, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {items.map((it, i) => (
            <div key={it.branch} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <RankBadge rank={i} color={color} t={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.branch}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi, flexShrink: 0, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtIDRCompact(it.value)}</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: t.sub, overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(3, (it.value / max) * 100)}%` }}
                    transition={{ duration: 0.65, ease: "easeOut", delay: Math.min(i, 10) * 0.05 }}
                    style={{ height: "100%", borderRadius: 99, background: color.grad }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Donut chart (Komposisi Pendapatan & Cost Structure, total per
// Partner) — permintaan user: "ada seperti diagram pie agar kita mudah
// melihat dari mana sebenarnya kontribusi cost terbesar, begitu juga
// dengan income ... saat di hover diagramnya ada detailnya, buat dengan
// ui yang sangat bagus". SVG arc manual (bukan lib chart baru) supaya tiap
// slice bisa punya hover sendiri (highlight + detail di tengah lubang
// donut + sinkron dgn legend di sampingnya).
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const a0 = startAngle, a1 = Math.max(endAngle, startAngle + 0.0001);
  const so = polarToCartesian(cx, cy, rOuter, a1);
  const eo = polarToCartesian(cx, cy, rOuter, a0);
  const si = polarToCartesian(cx, cy, rInner, a0);
  const ei = polarToCartesian(cx, cy, rInner, a1);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return `M ${so.x} ${so.y} A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${eo.x} ${eo.y} L ${si.x} ${si.y} A ${rInner} ${rInner} 0 ${largeArc} 1 ${ei.x} ${ei.y} Z`;
}

function DonutChart({ title, icon, accent, data, t, emptyText }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((s, it) => s + it.value, 0);
  const size = 172, cx = size / 2, cy = size / 2, rOuter = 80, rInner = 50;
  // FIX (react-hooks/immutability - "Cannot reassign variable after render
  // completes"): hitung posisi kumulatif tiap slice via reduce (tanpa
  // mutasi variabel luar di dalam .map) spy aman dipanggil langsung saat
  // render, bukan di useMemo.
  const slices = data.reduce((acc, it) => {
    const prevEnd = acc.length ? acc[acc.length - 1].end : 0;
    const frac = total > 0 ? it.value / total : 0;
    const start = prevEnd;
    const end = prevEnd + frac * 360;
    acc.push({ ...it, start, end, pct: frac * 100 });
    return acc;
  }, []);
  const active = hover !== null ? slices[hover] : null;

  return (
    <div style={{ flex: "1 1 380px", minWidth: 0, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, boxShadow: t.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: accent.bg, color: accent.fg, flexShrink: 0 }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi, letterSpacing: "-0.01em" }}>{title}</div>
      </div>
      {total <= 0 ? (
        <div style={{ fontSize: 12, color: t.lo, padding: "26px 0", textAlign: "center" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
            style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
          >
            <svg width={size} height={size} style={{ display: "block", overflow: "visible" }}>
              {slices.map((s, i) => (
                <path
                  key={s.label}
                  d={arcPath(cx, cy, hover === i ? rOuter + 5 : rOuter, rInner, s.start, s.end)}
                  fill={s.color}
                  stroke={t.card}
                  strokeWidth={2}
                  opacity={hover === null || hover === i ? 1 : 0.32}
                  style={{ cursor: "pointer", transition: "d .16s ease-out, opacity .16s" }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: active ? active.color : t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, maxWidth: size - 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {active ? active.label : "Total"}
              </span>
              <span style={{ fontSize: active ? 13.5 : 15, fontWeight: 800, color: t.hi, lineHeight: 1.25, whiteSpace: "nowrap" }}>{fmtIDRCompact(active ? active.value : total)}</span>
              {active && <span style={{ fontSize: 10.5, fontWeight: 800, color: active.color, marginTop: 1 }}>{active.pct.toFixed(1)}%</span>}
            </div>
          </motion.div>
          <div style={{ flex: "1 1 160px", minWidth: 160, display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflowY: "auto" }} className="mdidash-scroll">
            {slices.map((s, i) => (
              <div
                key={s.label}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 7px", borderRadius: 7, background: hover === i ? t.sub : "transparent", cursor: "pointer", transition: "background .12s" }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: hover === i ? 800 : 600, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, flexShrink: 0 }}>{s.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const slideVariants = {
  enter: (dir) => ({ x: dir >= 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir >= 0 ? -48 : 48, opacity: 0 }),
};

export default function MDI_Dashboard({ theme, profile, masterData }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [slides, setSlides] = useState([]);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const stageRef = useRef(null);

  const availableYears = useMemo(() => {
    const out = [];
    for (let y = START_YEAR; y <= now.getFullYear() + 1; y++) out.push(y);
    return out;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const { start, end: cutoffISO } = monthRange(month, year);
        // FIX (permintaan user - "ar bukannya sudah banyak ya mengapa ini
        // masih 0 semua"): sumber AR SEBELUMNYA cuma `mf_dse_prod_ar.
        // ar_piutang` (field running-balance yg di banyak Partner/bulan
        // memang kosong/0 - bukan sumber utama). AR yg SEBENARNYA dipakai
        // modul Prod. & AR (lihat computeArAsOf di DSE_ProdAR.jsx) ada di 3
        // ledger TERPISAH per level - DSE (ar_piutang_items, key dse_code),
        // DSO/DSP (dso_piutang_items, key mc/District), dan HoA
        // (hoa_piutang_items, key branch/Area langsung) - "sisa piutang"
        // dihitung dari total transaksi s.d. akhir bulan terpilih DIKURANGI
        // pembayaran yg sudah diterima s.d. tanggal yg sama (persis logika
        // computeArAsOf), BUKAN cuma dijumlah mentah2 nilai `total`-nya.
        const [pnlRes, dseRes, prodRes, dseArRes, dsoArRes, hoaArRes] = await Promise.all([
          supabase.from("pnl_reports_v2").select(PNL_SELECT_COLS).eq("month", month).eq("year", year),
          supabase.from("mf_dse_database").select("dse_code, mdi, branch, mc").eq("is_revoked", false),
          supabase.from("mf_dse_prod_ar").select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo").gte("tanggal", start).lte("tanggal", cutoffISO),
          supabase.from("ar_piutang_items").select("dse_code, total, tanggal_transaksi, ar_piutang_payments(nominal, tanggal_pembayaran, deleted_at)").is("deleted_at", null),
          supabase.from("dso_piutang_items").select("mc, total, tanggal_transaksi, dso_piutang_payments(nominal, tanggal_pembayaran, deleted_at)").is("deleted_at", null),
          supabase.from("hoa_piutang_items").select("branch, total, tanggal_transaksi, hoa_piutang_payments(nominal, tanggal_pembayaran, deleted_at)").is("deleted_at", null),
        ]);
        if (pnlRes.error) throw pnlRes.error;
        if (dseRes.error) throw dseRes.error;
        if (prodRes.error) throw prodRes.error;
        if (dseArRes.error) throw dseArRes.error;
        if (dsoArRes.error) throw dsoArRes.error;
        if (hoaArRes.error) throw hoaArRes.error;
        if (cancelled) return;

        // FIX (permintaan user - "mengapa masih banyak yang null, bukannya
        // data dse prod dan ar itu sudah lengkap"): kolom `branch` di tabel
        // mf_dse_prod_ar TERNYATA SELALU KOSONG di database (dicek via SQL
        // - 0 dari ribuan baris terisi), jadi branch WAJIB diambil dari
        // mf_dse_database (via dse_code/mc), bukan dari baris produktivitas
        // itu sendiri.
        const dseInfo = {};   // dse_code -> {mdi, branch}
        const mcInfo = {};    // mc (District) -> {mdi, branch}
        const branchInfo = {}; // branch (Area) -> mdi - AMAN krn 1 Area
        // SELALU milik 1 Partner saja (dicek via SQL, tidak ada branch yg
        // dipakai > 1 mdi berbeda).
        (dseRes.data || []).forEach((r) => {
          dseInfo[r.dse_code] = { mdi: r.mdi, branch: r.branch };
          if (r.mc && !mcInfo[r.mc]) mcInfo[r.mc] = { mdi: r.mdi, branch: r.branch };
          if (r.branch && !branchInfo[r.branch]) branchInfo[r.branch] = r.mdi;
        });

        // Produktivitas per partner+branch (DSE Prod. & AR - nilai_sp/fwa/
        // voucher/saldo sepanjang bulan terpilih).
        const prodByPartner = {};
        (prodRes.data || []).forEach((r) => {
          const info = dseInfo[r.dse_code];
          if (!info?.mdi || !info?.branch) return;
          const prod = numOrZero(r.nilai_sp) + numOrZero(r.nilai_fwa) + numOrZero(r.nilai_voucher) + numOrZero(r.nilai_saldo);
          if (!prodByPartner[info.mdi]) prodByPartner[info.mdi] = {};
          prodByPartner[info.mdi][info.branch] = (prodByPartner[info.mdi][info.branch] || 0) + prod;
        });

        // Sisa piutang 1 transaksi s.d. cutoffISO (akhir bulan terpilih) -
        // transaksi yg dibuat SETELAH cutoff tidak ikut dihitung, dan
        // pembayaran yg diterima SETELAH cutoff belum mengurangi saldo
        // (persis logika computeArAsOf di DSE_ProdAR.jsx).
        const sisaAkhir = (item, paymentsField) => {
          if (String(item.tanggal_transaksi || "").slice(0, 10) > cutoffISO) return 0;
          const paid = (item[paymentsField] || [])
            .filter((p) => !p.deleted_at && String(p.tanggal_pembayaran || "").slice(0, 10) <= cutoffISO)
            .reduce((s, p) => s + numOrZero(p.nominal), 0);
          return Math.max(0, numOrZero(item.total) - paid);
        };

        const arByPartner = {};
        const addAr = (mdi, branch, value) => {
          if (!mdi || !branch || value <= 0) return;
          if (!arByPartner[mdi]) arByPartner[mdi] = {};
          arByPartner[mdi][branch] = (arByPartner[mdi][branch] || 0) + value;
        };
        (dseArRes.data || []).forEach((it) => {
          const info = dseInfo[it.dse_code];
          if (info) addAr(info.mdi, info.branch, sisaAkhir(it, "ar_piutang_payments"));
        });
        (dsoArRes.data || []).forEach((it) => {
          const info = mcInfo[it.mc];
          if (info) addAr(info.mdi, info.branch, sisaAkhir(it, "dso_piutang_payments"));
        });
        (hoaArRes.data || []).forEach((it) => {
          addAr(branchInfo[it.branch], it.branch, sisaAkhir(it, "hoa_piutang_payments"));
        });

        // BARU (permintaan user - "dari cost structure ini, ada seperti
        // diagram pie ... begitu juga dengan income ... total per
        // partner"): komposisi Pendapatan (6 produk margin IM3+3ID + Dist.
        // Fee & Rewards + Di Luar Template, lihat MARGIN_ROWS/
        // summarizePendapatan) & Cost Structure (OPEX/HR Sales/HR Non-
        // Sales/Marketing/Cost of Money, lihat summarizePengeluaran) -
        // dijumlah lintas SEMUA Area partner itu bulan ybs, bukan per Area.
        const pnlByPartner = {};
        const incomeByPartner = {};
        const costByPartner = {};
        (pnlRes.data || []).forEach((row) => {
          const partner = row.partner_name;
          if (!pnlByPartner[partner]) pnlByPartner[partner] = [];
          pnlByPartner[partner].push({
            branch: row.branch,
            margin: summarizePendapatan(row).totalMargin,
            kpi: numOrZero(row.kpi_score),
          });

          if (!incomeByPartner[partner]) incomeByPartner[partner] = { dataProvided: 0, luarTemplate: 0 };
          const inc = incomeByPartner[partner];
          MARGIN_ROWS.forEach((m) => {
            inc[m.id] = (inc[m.id] || 0) + numOrZero(row[`margin_${m.id}`]) + numOrZero(row[`margin_${m.id}_3id`]);
          });
          inc.dataProvided += summarizePendapatan(row).totalDataProvided;
          inc.luarTemplate += numOrZero(row.luar_template_amount);

          if (!costByPartner[partner]) costByPartner[partner] = { opex: 0, sdmSales: 0, sdmNonSales: 0, marketing: 0, costOfMoney: 0 };
          const exp = summarizePengeluaran(row.pengeluaran_data);
          const cost = costByPartner[partner];
          cost.opex += exp.totalOpex;
          cost.sdmSales += exp.totalSdmSales;
          cost.sdmNonSales += exp.totalSdmNonSales;
          cost.marketing += exp.totalMarketing;
          cost.costOfMoney += exp.totalCostOfMoney;
        });

        const allPartners = new Set([
          ...Object.keys(pnlByPartner), ...Object.keys(prodByPartner), ...Object.keys(arByPartner),
        ]);

        const built = Array.from(allPartners).sort((a, b) => a.localeCompare(b)).map((partner) => {
          const pnlAreas = (pnlByPartner[partner] || []).slice().sort((a, b) => b.margin - a.margin);
          const kpiList = pnlAreas.map((a) => a.kpi).filter((v) => v > 0);
          const kpiScore = kpiList.length ? kpiList.reduce((s, v) => s + v, 0) / kpiList.length : 0;
          const arAreas = Object.entries(arByPartner[partner] || {})
            .map(([branch, total]) => ({ branch, value: total }))
            .sort((a, b) => b.value - a.value);
          const dseAreas = Object.entries(prodByPartner[partner] || {})
            .map(([branch, total]) => ({ branch, value: total }))
            .sort((a, b) => b.value - a.value);

          const inc = incomeByPartner[partner] || {};
          const incomePie = [
            ...MARGIN_ROWS.map((m, i) => ({ label: m.label, value: inc[m.id] || 0, color: PIE_COLORS[i % PIE_COLORS.length] })),
            { label: "Distribution Fee & Rewards", value: inc.dataProvided || 0, color: PIE_COLORS[6] },
            { label: "Di Luar Template", value: inc.luarTemplate || 0, color: PIE_COLORS[7] },
          ].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

          const cost = costByPartner[partner] || {};
          const costPie = [
            { label: "OPEX", value: cost.opex || 0, color: PIE_COLORS[0] },
            { label: "HR Cost Sales", value: cost.sdmSales || 0, color: PIE_COLORS[1] },
            { label: "HR Cost Non-Sales", value: cost.sdmNonSales || 0, color: PIE_COLORS[2] },
            { label: "Marketing Cost", value: cost.marketing || 0, color: PIE_COLORS[3] },
            { label: "Cost of Money", value: cost.costOfMoney || 0, color: PIE_COLORS[4] },
          ].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

          return {
            partner, kpiScore,
            pnlAreas: pnlAreas.map((a) => ({ branch: a.branch, value: a.margin })),
            arAreas, dseAreas, incomePie, costPie,
          };
        });

        // FIX (permintaan user - "dashboard mdi juga bisa diakses harusnya",
        // scope: admin_partner/region/circle saja, filtering data konsisten
        // dgn 3 tingkat Payout Tracker - circle = seluruh Sumatera (TANPA
        // filter, sama spt SPM), region = partner2 yg region-nya cocok
        // (ditautkan via masterData.region, krn built[].partner tidak py
        // info region sendiri), partner = cocokkan nama partner langsung.
        // "Hak akses teratas digabung": kalau akun py >1 role sekaligus,
        // yg terluas menang (circle > region > partner).
        let scoped = built;
        if (!hasRole(profile, "admin_circle")) {
          if (hasRole(profile, "admin_region")) {
            const targetRegions = String(profile?.partner_name || "").split(",").map((r) => r.toUpperCase().trim()).filter(Boolean);
            if (targetRegions.length) {
              scoped = scoped.filter((sl) => {
                const match = (masterData || []).find((m) => normalizeName(m.partner_name) === normalizeName(sl.partner));
                const region = match?.region?.toUpperCase().trim();
                return region && targetRegions.includes(region);
              });
            }
          } else if (hasRole(profile, "admin_partner")) {
            const targetPartners = String(profile?.partner_name || "").split(",").map((p) => normalizeName(p.trim())).filter(Boolean);
            if (targetPartners.length) {
              scoped = scoped.filter((sl) => targetPartners.includes(normalizeName(sl.partner)));
            }
          }
        }

        setSlides(scoped);
        setIdx((i) => (scoped.length ? Math.min(i, scoped.length - 1) : 0));
      } catch (e) {
        if (!cancelled) setErr(e.message || "Gagal memuat data MDI Dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, year, profile, masterData]);

  const total = slides.length;
  const goto = useCallback((i, direction) => {
    setDir(direction);
    setIdx((cur) => {
      if (!total) return 0;
      const n = ((i % total) + total) % total;
      return n;
    });
  }, [total]);
  const next = useCallback(() => goto(idx + 1, 1), [goto, idx]);
  const prev = useCallback(() => goto(idx - 1, -1), [goto, idx]);

  useEffect(() => {
    if (!playing || total < 2) return;
    const id = setInterval(() => { setDir(1); setIdx((i) => (i + 1) % total); }, 7000);
    return () => clearInterval(id);
  }, [playing, total]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) stageRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const slide = slides[idx];
  const monthOptions = MONTHS_ID.map((m, i) => ({ value: String(i + 1), label: m }));
  const yearOptions = availableYears.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div ref={stageRef} style={{
      fontFamily: FONT, background: fullscreen ? t.bg : "transparent",
      minHeight: fullscreen ? "100vh" : undefined, padding: fullscreen ? "24px 28px" : 0,
      borderRadius: fullscreen ? 0 : undefined,
    }}>
      {/* Scrollbar tipis custom utk daftar leaderboard yg full breakdown
          (bisa panjang kalau Area-nya banyak) - permintaan user "sajikan
          semuanya breakdown per area ... buat uinya sangat bagus". */}
      <style>{`
        .mdidash-scroll::-webkit-scrollbar{width:5px}
        .mdidash-scroll::-webkit-scrollbar-track{background:transparent}
        .mdidash-scroll::-webkit-scrollbar-thumb{background:${t.line};border-radius:99px}
        .mdidash-scroll{scrollbar-width:thin;scrollbar-color:${t.line} transparent}
      `}</style>
      {/* Header: judul modul + kontrol periode/play/fullscreen */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: GRAD, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={18} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid }}>Analisis Performa Partner</div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi }}>MDI Dashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <PillSelect value={String(month)} onChange={(v) => setMonth(Number(v))} options={monthOptions} t={t} minWidth={130} />
          <PillSelect value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} t={t} minWidth={90} />
          <IconBtn icon={playing ? <Pause size={15} /> : <Play size={15} />} onClick={() => setPlaying((p) => !p)} t={t} title={playing ? "Jeda slideshow" : "Putar otomatis"} active={playing} />
          <IconBtn icon={fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />} onClick={toggleFullscreen} t={t} title={fullscreen ? "Keluar layar penuh" : "Layar penuh"} />
        </div>
      </div>

      {err && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: t.redBg, color: t.red, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>{err}</div>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", color: t.mid, fontSize: 13, gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${t.line}`, borderTopColor: "#ED1C24", animation: "v2spin 0.8s linear infinite", display: "inline-block" }} />
          Memuat data dashboard...
        </div>
      ) : !total ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: t.mid, fontSize: 13 }}>
          Belum ada data Partner untuk periode {MONTHS_ID[month - 1]} {year}.
        </div>
      ) : (
        <>
          <div style={{ position: "relative", minHeight: 520, borderRadius: 20, border: `1px solid ${t.line}`, background: t.sub, overflow: "hidden" }}>
            <AnimatePresence mode="wait" custom={dir}>
              {slide && (
                <motion.div
                  key={slide.partner}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  style={{ padding: "26px 26px 24px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid, marginBottom: 4 }}>
                        Slide {idx + 1} / {total} &middot; {MONTHS_ID[month - 1]} {year}
                      </div>
                      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi, lineHeight: 1.2 }}>{slide.partner}</div>
                    </div>
                    <KpiRing value={slide.kpiScore} t={t} />
                  </div>

                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <Leaderboard title="Leaderboard PNL per Area (Margin Tertinggi → Terendah)" icon={<TrendingUp size={15} />} items={slide.pnlAreas} color={COLORS.pnl} t={t} emptyText="Belum ada data PNL bulan ini." />
                    <Leaderboard title="Kontribusi AR / Sisa Piutang per Area" icon={<Wallet size={15} />} items={slide.arAreas} color={COLORS.ar} t={t} emptyText="Tidak ada data AR bulan ini." />
                    <Leaderboard title="DSE Productivity per Area" icon={<Users size={15} />} items={slide.dseAreas} color={COLORS.dse} t={t} emptyText="Tidak ada data produktivitas DSE bulan ini." />
                  </div>

                  {/* BARU (permintaan user - "dari cost structure ini, ada
                      seperti diagram pie ... begitu juga dengan income ...
                      total per partner ... saat di hover diagramnya ada
                      detailnya"): 2 donut chart - Komposisi Pendapatan &
                      Komposisi Cost Structure, dijumlah lintas semua Area
                      partner ini bulan ybs. */}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
                    <DonutChart title="Komposisi Pendapatan (Total Partner)" icon={<PieChartIcon size={15} />} accent={COLORS.income} data={slide.incomePie} t={t} emptyText="Belum ada data pendapatan bulan ini." />
                    <DonutChart title="Komposisi Cost Structure (Total Partner)" icon={<TrendingDown size={15} />} accent={COLORS.cost} data={slide.costPie} t={t} emptyText="Belum ada data pengeluaran bulan ini." />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigasi: prev/next + dot indicator per Partner */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 18 }}>
            <IconBtn icon={<ChevronLeft size={16} />} onClick={prev} t={t} title="Partner sebelumnya" />
            <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 480, overflowX: "auto", padding: "4px 2px" }}>
              {slides.map((s, i) => (
                <button key={s.partner} onClick={() => goto(i, i > idx ? 1 : -1)} title={s.partner}
                  style={{
                    width: i === idx ? 22 : 7, height: 7, borderRadius: 99, border: "none", flexShrink: 0, cursor: "pointer",
                    background: i === idx ? GRAD : t.line, transition: "all .18s",
                  }} />
              ))}
            </div>
            <IconBtn icon={<ChevronRight size={16} />} onClick={next} t={t} title="Partner berikutnya" />
          </div>
        </>
      )}
    </div>
  );
}
