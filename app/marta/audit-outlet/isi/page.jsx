"use client";
/**
 * /marta/audit-outlet/isi — form PUBLIK (tanpa login), diisi DSE/Sender di
 * lapangan. DIROMBAK total jadi wizard 3 langkah + layar konfirmasi
 * ("seperti ini" - permintaan user dgn mockup 4 kartu: Data Outlet -> Foto
 * Outlet -> Review & Kirim -> Konfirmasi), menggantikan form 1-halaman
 * sebelumnya:
 * 1) Data Outlet - Nama Sender, Nama Outlet, ID Outlet (dropdown PILIH dari
 *    whitelist - bukan lagi ketik bebas+cek live, krn mockup minta
 *    "Pilih ID Outlet"), Social Media opsional.
 * 2) Foto Outlet - grid 3 slot Foto Etalase + 1 slot Foto Tapak Depan.
 * 3) Review & Kirim - ringkasan semua data + thumbnail foto, tiap bagian
 *    ada link "Ubah" yg lompat balik ke step terkait.
 * 4) Konfirmasi - layar sukses dgn ringkasan ID Outlet/Nama Outlet/Tanggal.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, AtSign, Blinds, Calendar, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Download, Eye, Flag, Frame, Image as ImageIcon, Loader2, MapPin, Pencil, PlusSquare, ScanBarcode, Search, Send,
  Share, Sticker, Store, Tent, Ticket, User, X,
} from "lucide-react";
import lottie from "lottie-web";
import successAnimData from "../../../../public/promotor/success-animation.json";
import { aoCountOutlets, aoCreateSubmission, aoListOutlets, aoListReferencePhotos, aoUploadPhoto } from "../../../../lib/ao";

// Ikon animasi sukses (dipakai sesaat sebelum layar konfirmasi tampil) -
// Lottie yg sama persis dgn yg dipakai utk "tagging sukses" di Promotor App
// (app/promotor/page.jsx), supaya konsisten se-ekosistem MartaHub. Diputar
// sekali (loop:false), lebih besar (220px) krn jadi hero penuh di sini.
function SuccessLottieIcon({ size = 220 }) {
  const hostRef = useRef(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const anim = lottie.loadAnimation({
      container: hostRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: successAnimData,
    });
    return () => anim.destroy();
  }, []);
  return <div ref={hostRef} style={{ width: size, height: size }} />;
}

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const PINK = "#EC0B6F";
const PINK_DK = "#C40A5C";
const ORANGE = "#F7941D";
const YELLOW = "#FFC20E";
const BRAND_GRADIENT = `linear-gradient(135deg, ${PINK} 0%, ${PINK} 35%, ${ORANGE} 75%, ${YELLOW} 100%)`;
const BORDER = "#E7E5ED";
const INK = "#1A1A20";
const MID = "#767485";
const BG = "#F7F6FA";

const STEPS = [
  { key: "data", label: "Data Outlet" },
  { key: "foto", label: "Foto Outlet" },
  { key: "visibility", label: "Visibility" },
  { key: "availability", label: "Availability" },
  { key: "review", label: "Review" },
];

// Step "Visibility" (sebelum Availability) - 5 materi visibilitas, tiap item
// dijawab Ada (1) atau Tidak Ada (0). Key dipakai jadi nama state `vis` DAN
// dikirim ke ao_create_submission (visPoster/visShopblind/visFlagchain/
// visTablemate/visStickerEtalase) -> kolom vis_* di ao_submissions.
const VISIBILITY_ITEMS = [
  { key: "poster", label: "Poster", icon: Frame },
  { key: "shopblind", label: "Shopblind", icon: Blinds },
  { key: "flagchain", label: "Flagchain", icon: Flag },
  { key: "tablemate", label: "Table Mate / Tent Card", icon: Tent },
  { key: "stickerEtalase", label: "Sticker Etalase", icon: Sticker },
];
const VIS_YES = { grad: "linear-gradient(135deg, #22C55E, #16A34A)", shadow: "0 3px 10px rgba(22,163,74,0.35)", solid: "#16A34A", tint: "rgba(22,163,74,0.05)", border: "rgba(22,163,74,0.28)" };
const VIS_NO = { grad: "linear-gradient(135deg, #F87171, #DC2626)", shadow: "0 3px 10px rgba(220,38,38,0.3)", solid: "#DC2626", tint: "rgba(220,38,38,0.04)", border: "rgba(220,38,38,0.25)" };

// 4 parameter availability (sesuai mockup "Cek Availability Produk") - key
// dipakai jadi nama state DAN dikirim ke ao_create_submission (spIm3/sp3id/
// voucherIm3/voucher3id).
// Slab jumlah varian (bukan Ya/Tidak lagi) - tiap item dijawab salah satu
// dari 3 opsi jumlah varian yg kelihatan di outlet. Skor per slab dihitung
// di CMS (bukan di form ini): SP 0-1=skor 0, 2-4=skor 2, 5++=skor 5;
// Voucher 0-2=skor 0, 3-5=skor 2, 6++=skor 5 - jadi sender cuma milih
// jumlah varian apa adanya, tanpa perlu tau/liat skornya.
const SP_SLABS = [
  { value: "0-1", label: "0-1" },
  { value: "2-4", label: "2-4" },
  { value: "5++", label: "5++" },
];
const VOUCHER_SLABS = [
  { value: "0-2", label: "0-2" },
  { value: "3-5", label: "3-5" },
  { value: "6++", label: "6++" },
];
const AVAILABILITY_ITEMS = [
  { key: "spIm3", brand: "im3", no: 1, group: "sp", label: "Jumlah Varian SP IM3", desc: "Contoh: Freedom, IM3, Yellow.", slabs: SP_SLABS },
  { key: "sp3id", brand: "3id", no: 2, group: "sp", label: "Jumlah Varian SP 3ID", desc: "Contoh: AlwaysOn, Happy, AON.", slabs: SP_SLABS },
  { key: "voucherIm3", brand: "im3", no: 3, group: "voucher", label: "Jumlah Varian Voucher IM3", desc: "Contoh: 5K, 10K, 25K, 50K.", slabs: VOUCHER_SLABS },
  { key: "voucher3id", brand: "3id", no: 4, group: "voucher", label: "Jumlah Varian Voucher 3ID", desc: "Contoh: 5K, 10K, 20K, 50K.", slabs: VOUCHER_SLABS },
];
const AVAILABILITY_GROUP_LABEL = { sp: "Starter Pack (SP)", voucher: "Voucher / Isi Ulang" };
// Ikon kartu SIM - sama persis dgn yg dipakai di app Promotor (MartaHub
// mobile, lihat SimCardIcon @ app/promotor/page.jsx) biar representasi
// "Starter Pack/kartu perdana" konsisten se-ekosistem, bukan ikon
// kotak/paket generik.
function SimCardIcon({ size = 16, color = "currentColor", strokeWidth = 1.7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 3h8.5l4.5 4.5V20a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <rect x="8.3" y="10.2" width="7.4" height="6.3" rx="1.3" stroke={color} strokeWidth={strokeWidth * 0.8} />
      <line x1="8.3" y1="13.35" x2="15.7" y2="13.35" stroke={color} strokeWidth={strokeWidth * 0.65} />
      <line x1="12" y1="10.2" x2="12" y2="16.5" stroke={color} strokeWidth={strokeWidth * 0.65} />
    </svg>
  );
}
// Tone warna beda total per grup (pink/magenta utk SP, biru-indigo utk
// Voucher) - bukan cuma garis tipis lagi, biar transisi antar grup
// kerasa jelas sekilas mata, gak perlu baca teksnya dulu.
const AVAILABILITY_GROUP_META = {
  sp: { icon: SimCardIcon, color: PINK_DK, tint: "rgba(236,11,111,0.08)", border: "rgba(236,11,111,0.22)" },
  voucher: { icon: Ticket, color: "#4338CA", tint: "rgba(79,70,229,0.08)", border: "rgba(79,70,229,0.22)" },
};

function Stepper({ step, onStepClick }) {
  return (
    <div className="ao-stepper" style={{ display: "flex", alignItems: "flex-start", padding: "26px 18px 22px" }}>
      {STEPS.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
          {/* Seluruh step bisa diklik (bukan cuma dekoratif) - mundur ke
              step yg udah dilewati selalu boleh; maju cuma kepanggil kalau
              step2 mandatory sebelumnya sudah lengkap (lihat goToStep). */}
          <button onClick={() => onStepClick?.(i)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
            border: "none", background: "transparent", padding: 0, cursor: onStepClick ? "pointer" : "default", fontFamily: FONT,
          }}>
            <div className="ao-step-dot" style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, fontFamily: FONT, flexShrink: 0,
              background: i <= step ? PINK : "#EFEDF4",
              color: i <= step ? "#fff" : "#9A98A8",
              boxShadow: i === step ? `0 0 0 4px rgba(236,11,111,0.14)` : "none",
              transition: "background .35s ease, box-shadow .35s ease",
            }}>
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <div className="ao-step-label" style={{
              fontSize: 10.5, fontWeight: i === step ? 800 : 700, color: i <= step ? INK : "#AFADBD",
              whiteSpace: "nowrap", textAlign: "center", transition: "color .35s ease",
            }}>{s.label}</div>
          </button>
          {i < STEPS.length - 1 && (
            // Track abu2 statis + bar isi (PINK) yg width-nya dianimasikan
            // 0%<->100% - "terisi perlahan" waktu Selanjutnya, "ngurang"
            // waktu Kembali, krn DOM node-nya sama (key stabil per step)
            // jadi transition CSS-nya jalan dua arah, bukan cuma pas isi.
            <div className="ao-step-line" style={{ flex: 1, height: 3, marginTop: 12.5, borderRadius: 2, background: "#EFEDF4", position: "relative", overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 2,
                width: i < step ? "100%" : "0%",
                background: `linear-gradient(90deg, ${PINK}, ${PINK_DK})`,
                transition: "width .5s cubic-bezier(.4,0,.2,1)",
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Header({ title }) {
  return (
    <div className="ao-hdr" style={{
      // padding-top dipadukan env(safe-area-inset-top) - gradient (wrapper
      // pembungkus di pemanggil) jadi ikut menutup sampai belakang notch/
      // status bar iOS, bukan berhenti kelihatan putih di atasnya lagi.
      //
      // fontSize di SINI jadi satu-satunya "dial" skala header (logo +
      // judul dikunci proporsional ke dial yg SAMA via unit `em`, lihat
      // HeaderTitle & <img> di bawah) - SEBELUMNYA logo & judul masing2
      // pakai clamp() terpisah dgn koefisien vw beda, jadi di lebar layar
      // tertentu salah satu udah mentok max duluan sementara yg lain
      // belum, kelihatan gak proporsional/gak seimbang (laporan user).
      // Dgn 1em = fontSize di sini, logo (height dlm em) & judul
      // (fontSize:"1em", inherit) PASTI menyusut/membesar bareng di rasio
      // yg sama persis, berapa pun lebar layarnya.
      fontSize: "clamp(13px, 4.6vw, 19px)",
      padding: "calc(24px + env(safe-area-inset-top)) 16px 10px",
      display: "flex", alignItems: "center", gap: "0.55em",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
      {/* height dlm `em` (bukan clamp px sendiri) - rasio ke judul
          (58/19 ≈ 3.05) persis sama kayak desain awal, tapi sekarang ikut
          skala fontSize Header di atas, jadi logo & judul SELALU
          proporsional bareng pada lebar layar berapa pun. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/audit-outlet/indosat-logo-white.png" alt="Indosat Ooredoo Hutchison" style={{ height: "3.05em", width: "auto", display: "block", flexShrink: 0 }} />
    </div>
  );
}

/** Judul header dua baris: label kecil regular + nama kompetisi bold,
 * dipakai di halaman isi form Pendataan Outlet (brief "Form Pendaftaran
 * North Sumatra Retail Competition" - bold + regular, rapi). Tombol
 * "Pasang Aplikasi" ditaruh SEBARIS dgn baris "NSA Retail Competition"
 * (bukan di ujung kanan header dekat logo lagi) - diminta user krn posisi
 * sebelumnya kejauhan dari judul & kurang nyambung sebagai 1 kelompok. */
function HeaderTitle({ showInstall, onInstallClick, installing }) {
  return (
    // minWidth:0 di container LUAR juga wajib - tanpa ini flex item gak
    // pernah bisa menyusut lebih kecil dari ukuran konten alaminya, jadi
    // ellipsis di bawah gak pernah kepakai & malah ikut dorong layout
    // (sumber "NSA Retail Competition" + tombol install kepepet/ketutup
    // di layar sempit).
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: 0.6, textTransform: "uppercase" }}>
        Form Pendaftaran
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {/* fontSize clamp() - otomatis mengecil di layar sempit (bukan
            ukuran tetap 19px yg gampang mepet/ke-wrap), dipadukan
            overflow:hidden + ellipsis sbg jaring pengaman terakhir kalau
            layar BENAR2 sempit (mis. split-screen) supaya tetap 1 baris,
            gak pernah turun ke baris ke-2 atau dorong tombol install keluar. */}
        {/* fontSize:"1em" - inherit dari fontSize Header (lihat
            komentar di komponen Header), BUKAN clamp() sendiri lagi,
            supaya skalanya PASTI lockstep sama logo, gak ada lagi titik
            dimana salah satu mentok max duluan drpd yg lain. */}
        <span style={{
          fontSize: "1em", fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: 0.1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
        }}>
          NSA Retail Competition
        </span>
        {showInstall && (
          <button onClick={onInstallClick} disabled={installing} aria-label="Pasang Aplikasi" style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.22)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: installing ? "default" : "pointer",
            flexShrink: 0, color: "#fff",
          }}>
            {installing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionCard({ icon, title, subtitle, badge, children }) {
  return (
    <div className="ao-card" style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18, marginBottom: 16,
      boxShadow: "0 2px 4px rgba(20,18,28,0.02), 0 10px 28px rgba(20,18,28,0.05)",
    }}>
      {title && (
        <div className="ao-card-hd" style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
          {icon && (
            // Badge ikon solid (bukan kotak tint pucat lagi) - kesannya
            // lebih "premium" drpd flat polos, TANPA glow di luar (cuma
            // shadow jarak-dekat yg wajar + inner highlight tipis di atas
            // buat kedalaman) - sesuai permintaan "jangan ada glownya".
            <div style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0, position: "relative", overflow: "hidden",
              background: `linear-gradient(145deg, ${PINK} 0%, ${PINK_DK} 100%)`,
              boxShadow: "0 1.5px 3px rgba(20,18,28,0.12), inset 0 1px 0 rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {icon}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: -0.1, lineHeight: 1.25 }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 11.5, color: MID, marginTop: 2, lineHeight: 1.3 }}>{subtitle}</div>
            )}
          </div>
          {badge && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: 0.3, textTransform: "uppercase",
              background: `linear-gradient(135deg, ${PINK}, ${PINK_DK})`, padding: "4.5px 10px", borderRadius: 999,
              boxShadow: "0 2px 6px rgba(236,11,111,0.3)", display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ id, label, required, optional, error, children }) {
  return (
    <div id={id} className="ao-field" style={{ marginBottom: 16, scrollMarginTop: 12 }}>
      <label className="ao-label" style={{ display: "block", fontSize: 13, fontWeight: 700, color: INK, marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: PINK }}> *</span>}
        {optional && <span style={{ fontWeight: 400, color: MID }}> (Opsional)</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11.5, color: "#DC2626", fontWeight: 700, marginTop: 6 }}>Wajib diisi</div>}
    </div>
  );
}

// Ubah ke HURUF BESAR tanpa bikin kursor loncat ke akhir teks (masalah di
// iOS Safari kalau value input terkontrol diganti saat user ngedit di tengah).
function upperKeepCaret(e, setter) {
  const el = e.target;
  const a = el.selectionStart, b = el.selectionEnd;
  setter(el.value.toUpperCase());
  requestAnimationFrame(() => { try { el.setSelectionRange(a, b); } catch {} });
}

// `color` & `colorScheme` di-set eksplisit - SEBELUMNYA field ini gak
// nentuin warna teks/placeholder sendiri, jadi browser mobile yg system-nya
// dark mode (atau in-app WebView spt WhatsApp/Instagram yg ikut dark mode
// device) bakal render teks input & placeholder jadi putih/abu terang di
// atas background abu muda form ini - kebaca sangat tipis/gak kontras.
// `colorScheme:"light"` maksa browser pakai skema terang utk kontrol form
// (teks, placeholder, caret, UI native select/date) walau device-nya dark
// mode, jadi kontrasnya konsisten di semua kondisi.
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 11,
  border: `1.5px solid ${BORDER}`, fontSize: 16, fontFamily: FONT, outline: "none", background: "#FAFAFC",
  color: INK, colorScheme: "light",
};

function BottomBar({ children, hidden }) {
  // hidden=true saat keyboard terbuka: bar disembunyikan supaya area isi form
  // selebar mungkin (bar tetap menempel di dasar layar begitu keyboard ditutup).
  if (hidden) return null;
  // Dibuat PERSIS spt action bar MartaHub Mobile (app/martahub/m/activities/
  // [id]/submit/page.jsx) yg sudah terbukti selalu lengket rapi ke bawah
  // tanpa gap - position:"fixed" + bottom:0 POLOS (gak perlu hitungan
  // visualViewport yg malah bisa nyisain gap kalau browsernya ngasih
  // angka offsetTop/height yg gak pas persis), jarak amannya (notch/home
  // indicator) CUKUP via padding-bottom env(safe-area-inset-bottom) di
  // dalam, kotak putihnya sendiri tetap full lengket ke tepi paling bawah
  // layar beneran.
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
      background: "#fff", borderTop: `1px solid ${BORDER}`,
    }}>
      <div className="ao-wrap ao-bar" style={{
        margin: "0 auto", display: "flex", gap: 10,
        padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
      }}>
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, full }) {
  return (
    <button className="ao-btn" onClick={onClick} disabled={disabled} style={{
      flex: full ? 1 : "1 1 auto", padding: "13px 18px", borderRadius: 12, border: "none",
      background: disabled ? "#D8D6DF" : PINK,
      color: "#fff", fontWeight: 800, fontSize: 14.5, fontFamily: FONT,
      cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    }}>
      {children}
    </button>
  );
}
function GhostBtn({ children, onClick }) {
  return (
    <button className="ao-btn" onClick={onClick} style={{
      flex: 1, padding: "13px 18px", borderRadius: 12, border: `1.5px solid ${BORDER}`, background: "#fff",
      color: INK, fontWeight: 800, fontSize: 14.5, fontFamily: FONT, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    }}>
      {children}
    </button>
  );
}

// ── 1 baris label/value di kartu info outlet terpilih ──────────────────────
function OutletInfoItem({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: PINK_DK, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 12.5, color: INK, fontWeight: 500, wordBreak: "break-word", lineHeight: 1.3 }}>{value || "-"}</div>
    </div>
  );
}

// ── Chip status GPS (auto-capture, bukan input manual) ─────────────────────
function GpsChip({ lat, lng, locating, error, onRetry }) {
  // marginTop dikasih di SINI (bukan cuma marginBottom) - biar chip ini
  // (loading MAUPUN error) konsisten punya jarak napas dari Stepper di
  // atasnya, gak pernah nempel mepet kayak sebelumnya ("tetap dibawah
  // stepper, buat dengan rapi").
  if (locating) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 13,
        background: "#F7F6FA", border: `1px solid ${BORDER}`, marginTop: 2, marginBottom: 14, fontSize: 12.5,
      }}>
        <Loader2 size={15} color={MID} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
        <span style={{ color: MID, fontWeight: 700 }}>Mengambil lokasi GPS...</span>
      </div>
    );
  }
  if (error) {
    // Tombol balik ke kanan (spt sebelumnya) - tapi icon+teks di-align ke
    // ATAS ("flex-start"), bukan center, jadi walau teksnya sampai 2-3
    // baris (kasus "izin diblokir") dia tetap kelihatan rapi/sejajar;
    // tombolnya sendiri di-"self-center" vertikal di tengah tinggi baris
    // teks itu + dikasih sedikit marginTop biar pas optis sama baseline
    // baris pertama teks, bukan ngambang ketinggian.
    return (
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 14,
        background: "#fff", border: "1.5px solid rgba(220,38,38,0.35)", marginTop: 2, marginBottom: 14,
        boxShadow: "0 2px 8px rgba(220,38,38,0.08)",
      }}>
        <div style={{
          flexShrink: 0, alignSelf: "center", width: 34, height: 34, borderRadius: 10, background: "rgba(220,38,38,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <MapPin size={17} color="#DC2626" strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 12.5, color: "#991B1B", fontWeight: 700, flex: 1, lineHeight: 1.45, alignSelf: "center" }}>{error}</span>
        <button onClick={onRetry} style={{
          flexShrink: 0, alignSelf: "center", border: "none", borderRadius: 999, background: "#DC2626", color: "#fff",
          fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "8px 14px", whiteSpace: "nowrap",
          boxShadow: "0 2px 6px rgba(220,38,38,0.3)",
        }}>
          Coba Lagi
        </button>
      </div>
    );
  }
  // Sukses - TIDAK ditampilkan ke sender (cukup dicatat diam2 di
  // gpsLat/gpsLng utk dikirim ke ao_create_submission), biar form tidak
  // berisik nampilin koordinat yg sender sendiri tidak perlu lihat.
  return null;
}

// ── Panduan foto (contoh benar/salah dalam bentuk teks - konsep sesuai
// mockup "Panduan Foto Etalase/Tapak Depan") ─────────────────────────────
// Kalau admin CMS sudah upload foto referensi (lihat /martahub/pendataan-
// outlet tab "Foto Referensi"), tampilkan foto asli (1 contoh benar + s.d.
// 3 contoh salah dgn label alasan) persis template. Kalau belum ada foto
// utk jenis ybs, fallback ke checklist teks dos/donts - dibungkus kartu +
// banner hijau/merah yg sama persis gaya-nya dgn versi berfoto, supaya
// tampilannya tetap konsisten dgn template walau foto belum diupload admin.
function PhotoGuide({ title, desc, dos, donts, refs, onCapture, onOpen }) {
  const [open, setOpen] = useState(false); // tetap mounted selama animasi tutup jalan
  const [show, setShow] = useState(false); // true = sheet digeser ke posisi terbuka (translateY 0)
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Lightbox - foto referensi (benar/salah) bisa diklik utk lihat ukuran
  // penuh, bukan cuma thumbnail kecil di dalam sheet panduan.
  const [lightbox, setLightbox] = useState(null); // url string | null
  const dragRef = useRef({ startY: 0, lastY: 0 });
  const closeTimerRef = useRef(null);
  const hasBenarPhoto = !!refs?.benar;
  const hasSalahPhotos = (refs?.salah?.length || 0) > 0;
  const subject = title.replace(/^Panduan\s*/, "");
  // Teks tombol aksi bawah - drop kata "Outlet" di ujung biar singkat &
  // actionable (mis. "Ambil Foto Etalase", bukan "Tutup Panduan Foto
  // Etalase Outlet") - tombol tetap menutup sheet yg sama (closeSheet).
  const actionSubject = subject.replace(/\s*Outlet$/, "");

  const openSheet = () => {
    clearTimeout(closeTimerRef.current);
    setDragY(0);
    setOpen(true);
    // Refresh foto referensi tiap kali sheet dibuka - sebelumnya cuma
    // di-fetch SEKALI saat form pertama kali dimount, jadi kalau admin
    // upload foto referensi baru dari CMS SETELAH sender sudah buka form
    // di HP-nya, foto baru itu tidak pernah muncul sampai sender reload
    // manual. onOpen (refetchRefPhotos di parent) diteriakkan tiap buka
    // sheet supaya selalu dapat data terbaru tanpa perlu reload halaman.
    onOpen?.();
    requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
  };
  const closeSheet = () => {
    setShow(false);
    setDragY(0);
    closeTimerRef.current = setTimeout(() => setOpen(false), 320);
  };

  const onHandlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, lastY: 0 };
    setDragging(true);
  };
  const onHandlePointerMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - dragRef.current.startY;
    if (dy > 0) {
      dragRef.current.lastY = dy;
      setDragY(dy);
    }
  };
  const onHandlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragRef.current.lastY > 110) closeSheet();
    else setDragY(0);
  };

  return (
    <div style={{ marginTop: 12 }}>
      {/* 1 baris gabungan "Lihat {title}" - sebelumnya kata "Panduan"
          kebaca 2x ("Panduan Foto Etalase Outlet" + "Lihat Panduan").
          Animasi glow pink pelan (bukan jreng/distraktif) biar tombol
          kebaca jelas sbg aksi, bukan cuma teks info biasa. */}
      <button onClick={openSheet} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", border: "1px solid rgba(236,11,111,0.22)",
        background: "linear-gradient(135deg, rgba(236,11,111,0.07), rgba(247,148,29,0.06))",
        borderRadius: 13, padding: "11px 12px", cursor: "pointer", fontFamily: FONT,
        animation: "guideGlow 2.2s ease-in-out infinite",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: "#fff",
          border: "1px solid rgba(236,11,111,0.18)", boxShadow: "0 2px 6px rgba(20,18,28,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Store size={13} color={PINK} />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: PINK_DK, flex: 1, textAlign: "left" }}>Lihat {title}</span>
        <ChevronRight size={15} color={PINK} style={{ flexShrink: 0 }} />
      </button>
      <style>{`
        @keyframes guideGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(236,11,111,0.22); }
          50% { box-shadow: 0 0 0 5px rgba(236,11,111,0); }
        }
      `}</style>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={closeSheet} style={{
            position: "absolute", inset: 0, background: "rgba(20,18,28,0.55)",
            opacity: show ? 1 : 0, transition: "opacity .32s ease",
          }} />
          <div className="ao-wrap" style={{
            position: "relative", width: "100%", height: "min(99vh, 800px)", background: "#fff",
            borderRadius: "22px 22px 0 0", display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 -10px 40px rgba(0,0,0,0.25)", fontFamily: FONT,
            transform: `translateY(${show ? dragY : 9999}px)`,
            transition: dragging ? "none" : "transform .32s cubic-bezier(.4,0,.2,1)",
          }}>
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              style={{ padding: "12px 0 8px", display: "flex", justifyContent: "center", cursor: "grab", touchAction: "none", flexShrink: 0 }}
            >
              <div style={{ width: 42, height: 5, borderRadius: 999, background: "#DEDCE6" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 18px 13px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: INK, flex: 1, lineHeight: 1.25 }}>{title}</span>
              <button onClick={closeSheet} style={{
                width: 38, height: 38, borderRadius: "50%", border: "none", background: "#F2F1F6", color: INK,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "background .15s ease",
              }}>
                <X size={19} strokeWidth={2.4} />
              </button>
            </div>
            <div style={{ padding: "10px 18px 12px", overflowY: "auto", flex: 1, minHeight: 0 }}>
              {desc && <div style={{ fontSize: 14, color: INK, lineHeight: 1.5, marginBottom: 8 }}>{desc}</div>}

              {hasBenarPhoto ? (
                <img src={refs.benar} alt="" onClick={() => setLightbox(refs.benar)} style={{ width: "100%", aspectRatio: "15/8", objectFit: "cover", borderRadius: "14px 14px 0 0", border: `1px solid ${BORDER}`, borderBottom: "none", display: "block", cursor: "zoom-in" }} />
              ) : (
                <div style={{
                  width: "100%", aspectRatio: "15/8", borderRadius: "14px 14px 0 0", border: `1.5px dashed ${BORDER}`, borderBottom: "none",
                  background: "#FAFAFC", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <ImageIcon size={24} color={MID} />
                  <span style={{ fontSize: 11.5, color: MID, fontWeight: 600, textAlign: "center", padding: "0 20px" }}>
                    Foto referensi belum diunggah admin
                  </span>
                </div>
              )}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, background: "rgba(22,163,74,0.1)", padding: "10px 14px", marginBottom: 14,
                borderRadius: "0 0 12px 12px", border: `1px solid rgba(22,163,74,0.18)`, borderTop: "none",
              }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={12} color="#fff" strokeWidth={3} />
                </div>
                {/* `subject` sudah mengandung kata "Foto" (mis. "Foto Etalase
                    Outlet"), jadi templatenya TIDAK diawali "Contoh Foto" lagi
                    - sebelumnya jadi dobel: "Contoh Foto Foto Etalase Outlet
                    yang Benar". */}
                <span style={{ fontSize: 14.5, fontWeight: 800, color: "#16A34A", lineHeight: 1.3 }}>
                  Contoh {subject} yang Benar
                </span>
              </div>

              <div style={{ marginBottom: 4, paddingLeft: 15 }}>
                {dos.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    {/* Filled hijau, ukuran+gap+padding-left disamakan
                        persis dgn ikon di banner "Contoh ... yang Benar" di
                        atasnya (20px, gap 8, +1px kompensasi border banner)
                        biar sejajar rapi. */}
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 0.5 }}>
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: 14, color: INK, fontWeight: 500, lineHeight: 1.35 }}>{d}</span>
                  </div>
                ))}
              </div>

              <div style={{ height: 2, background: "#E3E1EC", borderRadius: 2, margin: "12px 0 10px" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <X size={11} color="#fff" strokeWidth={3} />
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: "#DC2626" }}>Contoh Foto yang Salah</span>
              </div>
              {hasSalahPhotos ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {refs.salah.map((r) => (
                    <div key={r.urutan}>
                      <div style={{ position: "relative" }}>
                        <img src={r.url} alt="" onClick={() => setLightbox(r.url)} style={{ width: "100%", aspectRatio: "0.85", objectFit: "cover", borderRadius: 10, border: "1.5px solid rgba(220,38,38,0.4)", cursor: "zoom-in" }} />
                        {/* Badge "salah" dipindah ke pojok KIRI-ATAS, bentuk
                            pill kecil (bukan lingkaran putih+X merah) - biar
                            gak ketuker sama tombol "hapus foto" beneran (yg
                            selalu lingkaran putih+X merah di pojok KANAN-ATAS
                            di slot upload lain) dan gak kesan "bisa diklik". */}
                        <div style={{
                          position: "absolute", bottom: 6, right: 6, background: "#DC2626", borderRadius: 7,
                          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 2px 5px rgba(220,38,38,0.4), inset 0 1px 0 rgba(255,255,255,0.25)", pointerEvents: "none",
                        }}>
                          <X size={15} color="#fff" strokeWidth={3.2} />
                        </div>
                      </div>
                      {/* Keterangan "kenapa salah"-nya dibuat pill merah
                          muda (bukan teks polos abu2/hitam) - biar langsung
                          kebaca sbg alasan kesalahan, senada sama badge X
                          di foto, bukan cuma caption biasa. */}
                      {r.label && (
                        <div style={{
                          display: "inline-block", marginTop: 6, padding: "3px 8px", borderRadius: 6,
                          background: "rgba(220,38,38,0.1)", fontSize: 11, color: "#DC2626", fontWeight: 700, lineHeight: 1.3,
                        }}>
                          {r.label}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {donts.map((d, i) => (
                    <div key={i}>
                      <div style={{
                        position: "relative", aspectRatio: "0.85", borderRadius: 10, border: `1.5px dashed ${BORDER}`, background: "#FAFAFC",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <ImageIcon size={20} color={MID} />
                        <div style={{
                          position: "absolute", bottom: 6, right: 6, background: "#DC2626", borderRadius: 7,
                          width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: "0 2px 5px rgba(220,38,38,0.4), inset 0 1px 0 rgba(255,255,255,0.25)", pointerEvents: "none",
                        }}>
                          <X size={15} color="#fff" strokeWidth={3.2} />
                        </div>
                      </div>
                      <div style={{
                        display: "inline-block", marginTop: 6, padding: "3px 8px", borderRadius: 6,
                        background: "rgba(220,38,38,0.1)", fontSize: 11, color: "#DC2626", fontWeight: 700, lineHeight: 1.3,
                      }}>
                        {d}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "16px 20px calc(16px + env(safe-area-inset-bottom))", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <button onClick={() => { closeSheet(); onCapture?.(); }} style={{
                width: "100%", border: "none", borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontFamily: FONT,
                background: PINK, color: "#fff", fontSize: 14.5, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
                <Camera size={16} /> Ambil {actionSubject}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          // zIndex 150 - di atas sheet Panduan Foto (zIndex 100), supaya
          // lightbox SELALU tampil paling depan & nutup penuh layar -
          // sebelumnya 80 (di bawah sheet), jadi overlay gelapnya ketutup
          // sheet dan cuma tombol X-nya yg nongol aneh ngambang di atas.
          position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out",
        }}>
          <button onClick={() => setLightbox(null)} aria-label="Tutup"
            style={{
              position: "absolute", top: "calc(14px + env(safe-area-inset-top))", right: 16, width: 38, height: 38, borderRadius: "50%",
              border: "none", background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
            <X size={20} color="#fff" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}

// ── 1 baris checklist Ya/Tidak di step "Cek Availability Produk" - logo
// brand jadi badge besar kiri (bukan nomor urut lagi), checkbox Ya/Tidak
// ditumpuk vertikal di kanan (bukan 2 tombol lebar di bawah), seluruh
// kartu dikasih tint hijau/merah halus begitu dijawab biar progres
// kelihatan sekilas tanpa perlu baca teks. ────────────────────────────────
// Segmented control 3 opsi (jumlah varian) dgn highlight yg "geser" pakai
// transition transform - bukan cuma ganti warna background tiap tombol,
// biar kepilihnya kerasa smooth & jelas ("animasinya sangat bagus").
function AvailabilitySlabs({ slabs, value, onChange, brand = "pink" }) {
  const idx = slabs.findIndex((s) => s.value === value);
  // im3 = kuning (cocok sama badge logo IM3), 3id = magenta (cocok sama
  // badge logo 3ID) - teks pill aktif disesuaikan kontrasnya per warna
  // (gelap di atas kuning, putih di atas magenta).
  const activeBg = brand === "im3" ? `linear-gradient(135deg, ${YELLOW}, #E8AE00)` : `linear-gradient(135deg, ${PINK}, ${PINK_DK})`;
  const activeShadow = brand === "im3" ? "0 3px 10px rgba(255,194,14,0.45)" : "0 3px 10px rgba(236,11,111,0.3)";
  const activeTextColor = brand === "im3" ? "#5C4300" : "#fff";
  return (
    <div style={{
      position: "relative", display: "flex", background: "#F1EFF6", borderRadius: 12, padding: 4,
    }}>
      {idx >= 0 && (
        <div style={{
          position: "absolute", top: 4, bottom: 4, left: 4,
          width: `calc(${100 / slabs.length}% - ${8 / slabs.length}px)`,
          transform: `translateX(${idx * 100}%)`,
          background: activeBg,
          borderRadius: 9, boxShadow: activeShadow,
          transition: "transform .28s cubic-bezier(.34,1.3,.64,1)",
        }} />
      )}
      {slabs.map((slab) => {
        const active = slab.value === value;
        return (
          <button key={slab.value} onClick={() => onChange(slab.value)} style={{
            position: "relative", zIndex: 1, flex: 1, border: "none", background: "transparent",
            padding: "9px 6px", borderRadius: 9, cursor: "pointer", fontFamily: FONT, outline: "none",
            fontSize: 13.5, fontWeight: 800, color: active ? activeTextColor : "#8784A0",
            transition: "color .2s ease .05s",
          }}>
            {slab.label}
          </button>
        );
      })}
    </div>
  );
}

function AvailabilityRow({ item, value, onChange, error }) {
  const isIm3 = item.brand === "im3";
  // Aksen kiri + badge brand kecil di atas desc - penguat visual kedua
  // (selain warna badge logo) biar baris IM3 vs 3ID gak ketuker pas user
  // buru2 ngisi 4 baris yg bentuknya mirip semua.
  const brandColor = isIm3 ? "#C9900A" : PINK_DK;
  const cardBg = value != null ? (isIm3 ? "rgba(255,194,14,0.05)" : "rgba(236,11,111,0.03)") : "#fff";
  const cardBorder = error ? "#DC2626" : value != null ? (isIm3 ? "rgba(201,144,10,0.28)" : "rgba(236,11,111,0.22)") : BORDER;
  return (
    <div style={{
      // Non-shorthand penuh (borderTop/Right/Bottom/Left terpisah, BUKAN
      // "border" shorthand + "borderLeft" override) - React warn kalau 2
      // properti itu dicampur krn bisa beda hasil antar render ("Updating
      // a style property... border/borderLeft conflicting").
      borderRadius: 16,
      borderTop: `1.5px solid ${cardBorder}`, borderRight: `1.5px solid ${cardBorder}`, borderBottom: `1.5px solid ${cardBorder}`,
      // Pas error, aksen kiri ikut jadi merah solid (BUKAN warna
      // brand/pucat lagi) - sebelumnya border kanan-atas-bawah udah merah
      // tapi kiri masih warna brand/pucat, jadi 1 kartu kelihatan 2 warna
      // beda di sisi yg nyambung ("jelek"/gak nyatu).
      borderLeft: `4px solid ${error ? "#DC2626" : value != null ? brandColor : (isIm3 ? "rgba(255,194,14,0.55)" : "rgba(236,11,111,0.3)")}`,
      background: cardBg, padding: 15,
      boxShadow: value != null ? "0 2px 8px rgba(20,18,28,0.04)" : "0 1px 3px rgba(20,18,28,0.03)",
      transition: "background .25s ease, border-color .25s ease, box-shadow .25s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          flexShrink: 0, width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
          background: isIm3 ? YELLOW : `linear-gradient(135deg, ${PINK}, ${PINK_DK})`,
          boxShadow: "0 3px 8px rgba(20,18,28,0.1)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isIm3 ? "/brand/logo-im3.png" : "/brand/logo-3id.png"}
            alt={isIm3 ? "IM3" : "3ID"}
            style={{
              // Logo IM3 asetnya punya whitespace lebih lebar di sisi kiri
              // drpd kanan - digeser dikit ke kanan (marginLeft) biar
              // optically center di tengah badge. Logo 3ID dikecilkan
              // sedikit (24 drpd 28) krn bentuknya lebih "padat"/kotak,
              // jadi 28px kerasa agak besar sebelah dibanding badge IM3.
              width: isIm3 ? 27 : 23, height: isIm3 ? 27 : 23, objectFit: "contain", display: "block",
              marginLeft: isIm3 ? 1 : 0,
              // Aset logo-3id.png warnanya hitam solid (bukan putih) - di-invert
              // jadi putih biar kontras di atas background magenta, sesuai
              // tampilan resmi logo Tri/3ID (putih di atas magenta).
              ...(!isIm3 ? { filter: "brightness(0) invert(1)" } : {}),
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.3 }}>{item.label}</div>
          <div style={{ fontSize: 11.5, color: MID, marginTop: 3, lineHeight: 1.4 }}>{item.desc}</div>
        </div>
        {value != null && (
          <div style={{
            flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "#16A34A",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "slabCheckPop .25s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            <Check size={13} color="#fff" strokeWidth={3.2} />
          </div>
        )}
      </div>
      <AvailabilitySlabs slabs={item.slabs} value={value} onChange={onChange} brand={isIm3 ? "im3" : "3id"} />
      {error && (
        <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, marginTop: 10 }}>Wajib dijawab sebelum lanjut</div>
      )}
      <style>{`@keyframes slabCheckPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

// ── Step "Visibility": toggle Ada / Tidak Ada dgn highlight yg "geser"
// (transform, bukan ganti warna tombol) - hijau utk Ada, merah utk Tidak Ada.
function VisibilityToggle({ value, onChange }) {
  const opts = [{ v: 1, label: "Ada", Icon: Check }, { v: 0, label: "Tidak Ada", Icon: X }];
  const idx = value === 1 ? 0 : value === 0 ? 1 : -1;
  const tone = value === 1 ? VIS_YES : VIS_NO;
  return (
    <div role="radiogroup" className="vis-tg" style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", width: "100%", boxSizing: "border-box", background: "#F1EFF6", borderRadius: 11, padding: 3 }}>
      {idx >= 0 && (
        <div style={{
          position: "absolute", top: 3, bottom: 3,
          // Toggle selebar kartu (di bawah judul) -> 2 kolom sama lebar.
          left: idx === 0 ? 3 : "50%",
          width: "calc((100% - 6px) / 2)",
          background: tone.grad, borderRadius: 8, boxShadow: tone.shadow,
          transition: "left .28s cubic-bezier(.34,1.3,.64,1), width .28s cubic-bezier(.34,1.3,.64,1)",
        }} />
      )}
      {opts.map(({ v, label, Icon }) => {
        const active = value === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={active} onClick={() => onChange(v)} style={{
            position: "relative", zIndex: 1, minWidth: 0, border: "none", background: "transparent",
            padding: "10px 4px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, outline: "none",
            fontSize: 13, fontWeight: 800, color: active ? "#fff" : "#8784A0",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap",
            transition: "color .2s ease .05s",
          }}>
            <Icon size={12} strokeWidth={3} />{label}
          </button>
        );
      })}
    </div>
  );
}

function VisibilityRow({ item, value, onChange, error }) {
  const answered = value === 0 || value === 1;
  const tone = value === 1 ? VIS_YES : VIS_NO;
  const Icon = item.icon;
  const cardBorder = error ? "#DC2626" : answered ? tone.border : BORDER;
  return (
    <div style={{
      borderRadius: 14, border: `1.5px solid ${cardBorder}`,
      background: answered ? tone.tint : "#fff", padding: "14px",
      transition: "background .25s ease, border-color .25s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          background: answered ? tone.grad : `linear-gradient(135deg, ${PINK}, ${PINK_DK})`,
          transition: "background .25s ease",
        }}>
          <Icon size={18} color="#fff" strokeWidth={2.1} />
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.3, overflowWrap: "anywhere" }}>{item.label}</div>
      </div>
      <VisibilityToggle value={value} onChange={onChange} />
      {error && (
        <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, marginTop: 8 }}>Wajib dijawab sebelum lanjut</div>
      )}
    </div>
  );
}

const OUTLET_RESULTS_CAP = 60; // batasi baris yg DI-RENDER - dgn ~16rb
// outlet, nge-render SEMUA hasil kosong/query pendek bikin DOM berat &
// kerasa lemot. Query tetap jalan ke semua data, cuma tampilannya dibatasi.

// ── Dropdown "Pilih ID Outlet" (cari + pilih dari whitelist) ───────────────
// Ditulis ULANG supaya search-nya SERVER-SIDE (RPC ao_list_outlets/
// ao_count_outlets dgn p_search), BUKAN lagi download SEMUA ~16rb outlet
// ke browser dulu baru difilter di client. Alasan optimasi:
//   1. Buka form jadi INSTAN - gak nunggu ~17 kali panggilan RPC beruntun
//      (download ~16rb baris) kelar dulu sebelum bisa dipakai cari.
//   2. Data yg ditarik cuma yg relevan dgn kata kunci - jauh lebih hemat
//      kuota, penting banget utk sales lapangan di sinyal lemah.
//   3. Filternya PERSIS sama logic SQL `ilike` yg sudah ada di RPC (sudah
//      diperluas jg cakupannya ke nama_outlet/area/mc, bukan cuma 4 field
//      spt sebelumnya) - akurasi tetap sama/lebih baik, bukan trade-off.
// `p_active_only: true` dikirim ke RPC supaya outlet nonaktif difilter DI
// SERVER (konsisten antara daftar & total count), bukan didownload dulu
// baru dibuang di client spt sebelumnya.
// Posisi + tinggi visual viewport (di atas keyboard) utk overlay full-screen.
// Di iOS `inset: 0` mengikuti layout viewport yg TIDAK menyusut saat keyboard
// muncul, jadi bagian bawah overlay (hasil pencarian terakhir) ketutup
// keyboard. Ukur ulang saat keyboard bergerak (resize/scroll + polling
// singkat setelah fokus berubah) supaya overlay pas persis di atas keyboard.
function useVisualViewportBox() {
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox({ top: Math.max(0, Math.round(vv.offsetTop)), height: Math.round(vv.height * (vv.scale || 1)) });
    let raf = 0, until = 0;
    const poll = () => { update(); if (performance.now() < until) raf = requestAnimationFrame(poll); };
    const burst = () => { until = performance.now() + 1000; cancelAnimationFrame(raf); raf = requestAnimationFrame(poll); };
    burst();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", burst);
    window.addEventListener("focusout", burst);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", burst);
      window.removeEventListener("focusout", burst);
    };
  }, []);
  return box;
}

function OutletPicker({ value, onChange, error }) {
  const vvBox = useVisualViewportBox();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Debounce 350ms (lebih panjang drpd versi client-filter sebelumnya yg
  // 120ms) - sekarang tiap pencarian itu ROUND-TRIP JARINGAN beneran ke
  // Supabase, bukan cuma filter array di memori, jadi debounce-nya perlu
  // lebih longgar biar gak nembak request baru tiap huruf sementara user
  // masih ngetik cepat.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const [results, setResults] = useState([]);
  const [totalMatches, setTotalMatches] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Fetch ulang tiap qDebounced berubah, TAPI cuma selagi sheet-nya
  // kebuka (`open`) - sheet ketutup gak perlu nembak request ke server.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSearching(true); setSearchError("");
    (async () => {
      try {
        const [list, total] = await Promise.all([
          aoListOutlets({ search: qDebounced || undefined, limit: OUTLET_RESULTS_CAP, activeOnly: true }),
          aoCountOutlets(qDebounced || undefined, true),
        ]);
        if (!alive) return;
        setResults(list);
        setTotalMatches(total);
      } catch (e) {
        if (!alive) return;
        setSearchError("Gagal memuat daftar outlet. Periksa koneksi internet, lalu coba lagi.");
        setResults([]);
        setTotalMatches(null);
      } finally {
        if (alive) setSearching(false);
      }
    })();
    return () => { alive = false; };
  }, [open, qDebounced]);

  return (
    <div style={{ position: "relative" }}>
      <button className="ao-in" onClick={() => setOpen((v) => !v)} style={{
        ...inputStyle, paddingLeft: 36, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
        color: value ? INK : "#9A98A8", borderColor: error ? "#DC2626" : BORDER, position: "relative",
      }}>
        <ScanBarcode size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {value || "Pilih ID Outlet"}
        </span>
        <ChevronDown size={16} color={MID} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <>
          {/* Full-screen sheet (bukan dropdown kecil yg nempel di bawah
              tombol) - dropdown lama gampang ketutup keyboard/konten lain
              & susah di-scroll pas lagi cari (lihat keluhan user). Sheet ini
              nutup seluruh layar, search box sticky di atas, hasil full-
              height di bawahnya - selalu kebaca penuh apapun posisi field. */}
          <div style={{
            position: "fixed", left: 0, right: 0, zIndex: 50, background: "#fff",
            display: "flex", flexDirection: "column",
            ...(vvBox ? { top: vvBox.top, height: vvBox.height } : { top: 0, bottom: 0 }),
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              // Jarak atas ditambah (24px, bukan 12px) - sebelumnya search
              // box ketarik terlalu nempel ke status bar, kerasa sempit.
              padding: "calc(24px + env(safe-area-inset-top)) 14px 14px",
              borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: "#fff",
            }}>
              <button onClick={() => { setOpen(false); setQ(""); }} aria-label="Tutup"
                style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F4F3F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                <ChevronLeft size={19} color={INK} />
              </button>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={16} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                {/* color + colorScheme eksplisit - sama alasannya spt
                    inputStyle: tanpa ini teks & placeholder kebaca putih/
                    pudar di device dark mode, gak kontras di atas background
                    abu muda field ini. */}
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID Outlet, nama, cabang..."
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 36px", borderRadius: 12,
                    border: `1.5px solid ${BORDER}`, fontSize: 16, fontFamily: FONT, outline: "none",
                    background: "#FAFAFC", color: INK, colorScheme: "light",
                    boxShadow: "0 2px 6px rgba(20,18,28,0.04)",
                  }} />
                {q && (
                  <button onClick={() => setQ("")} aria-label="Hapus pencarian"
                    style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", border: "none", background: BORDER, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={12} color={MID} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {searchError ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "34px 16px", textAlign: "center" }}>
                  <AlertTriangle size={22} color="#DC2626" />
                  <div style={{ fontSize: 12.5, color: "#991B1B", fontWeight: 600 }}>{searchError}</div>
                </div>
              ) : searching && results.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "34px 16px" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", border: `3px solid ${BORDER}`, borderTopColor: PINK,
                    animation: "spin .8s linear infinite",
                  }} />
                  <div style={{ fontSize: 12.5, color: MID, fontWeight: 600 }}>Mencari outlet...</div>
                </div>
              ) : results.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12.5, color: MID }}>Tidak ditemukan</div>
              ) : results.map((o, i) => {
                const isSelected = o.id_outlet === value;
                return (
                  <button key={`${o.id || o.id_outlet || "row"}-${i}`} onClick={() => { onChange(o.id_outlet, o); setOpen(false); setQ(""); }} style={{
                    width: "100%", textAlign: "left", padding: "14px 16px", border: "none",
                    background: isSelected ? "rgba(236,11,111,0.06)" : "#fff",
                    cursor: "pointer", borderBottom: `1px solid ${BORDER}`,
                    display: "flex", alignItems: "flex-start", gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 1 baris gabungan ID IM3+3ID - TIDAK duplikat lagi
                          dgn id_outlet terpilih (dulu ditampilkan 2x: judul
                          id_outlet + badge IM3/3ID yg nilainya sama persis). */}
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
                        {o.outlet_id_im3 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999, background: YELLOW, color: "#5C4300" }}>IM3</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{o.outlet_id_im3}</span>
                          </span>
                        )}
                        {o.outlet_id_im3 && o.outlet_id_3id && <span style={{ color: BORDER }}>|</span>}
                        {o.outlet_id_3id && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999, background: PINK_DK, color: "#fff" }}>3ID</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{o.outlet_id_3id}</span>
                          </span>
                        )}
                        {!o.outlet_id_im3 && !o.outlet_id_3id && (
                          <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{o.id_outlet}</span>
                        )}
                        {isSelected && (
                          <span style={{ flexShrink: 0, width: 15, height: 15, borderRadius: "50%", background: PINK, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Check size={9} color="#fff" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      {(o.branch || o.mc) && (
                        <div style={{ fontSize: 11, color: MID, marginTop: 5 }}>{[o.branch, o.mc].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                  </button>
                );
              })}
              {totalMatches != null && totalMatches > OUTLET_RESULTS_CAP && (
                <div style={{ padding: "9px 14px", textAlign: "center", fontSize: 11, color: MID, background: "#FAFAFC" }}>
                  Menampilkan {OUTLET_RESULTS_CAP} dari {totalMatches.toLocaleString("id-ID")} hasil - ketik lebih spesifik untuk mempersempit
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PhotoSlot({ file, label, onRequestCamera, onRemove, disabled, error }) {
  if (file) {
    return (
      <div style={{
        position: "relative", borderRadius: 15, overflow: "hidden", border: `1.5px solid ${BORDER}`, aspectRatio: "1",
        boxShadow: "0 6px 16px rgba(20,18,28,0.1)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={URL.createObjectURL(file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* Tombol hapus solid putih + ikon merah - sebelumnya kaca/blur
            gelap transparan gampang nyaru sama foto gelap. Badge centang
            hijau di pojok kiri dihapus (foto sudah jelas keisi, gak perlu
            penanda "correct" tambahan). */}
        <button onClick={onRemove} disabled={disabled} style={{
          position: "absolute", top: 7, right: 7, width: 25, height: 25, borderRadius: "50%", border: "none",
          background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    );
  }
  // Catatan: SEBELUMNYA ini <label><input type="file" capture="environment">,
  // tapi atribut `capture` cuma hint yg di-ignore browser desktop (laptop
  // tetap bisa pilih file dari galeri/Finder, capture tidak wajib). Sekarang
  // wajib pakai kamera in-browser (getUserMedia) via onRequestCamera - tidak
  // ada fallback ke file picker sama sekali.
  return (
    <button type="button" onClick={onRequestCamera} disabled={disabled} style={{
      aspectRatio: "1", borderRadius: 15, border: `1.5px dashed ${error ? "#DC2626" : "#D8B9C9"}`, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer",
      background: error ? "rgba(220,38,38,0.04)" : "linear-gradient(145deg, #FFF9FB 0%, #FEF6FA 55%, #FDF3F8 100%)",
      transition: "border-color .15s ease, background .15s ease", padding: 0,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", background: "#fff",
        border: `1px solid ${error ? "rgba(220,38,38,0.25)" : "rgba(236,11,111,0.18)"}`,
        boxShadow: "0 3px 8px rgba(20,18,28,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Camera size={16} color={error ? "#DC2626" : PINK} />
      </div>
      <span style={{ fontSize: 10.5, color: error ? "#DC2626" : "#8A7E8F", fontWeight: 700, textAlign: "center", padding: "0 6px" }}>{label}</span>
    </button>
  );
}

/**
 * Overlay kamera in-browser (getUserMedia + canvas), full-screen. Dibuat
 * utk gantikan <input type="file" capture="environment"> krn atribut
 * `capture` cuma hint non-enforced - browser desktop (laptop) tetap bisa
 * buka file picker biasa & pilih foto dari galeri/Finder, bukan wajib
 * buka kamera. Komponen ini TIDAK ada fallback ke file picker sama sekali:
 * kalau getUserMedia gagal/ditolak/gak ada kamera, user cuma dikasih pesan
 * error + tombol tutup & coba lagi (sesuai permintaan "wajib camera").
 */
// Sudut rotasi layar saat ini (0/90/180/270), dipakai utk auto-rotate
// preview kamera & hasil jepretan supaya selalu tegak mengikuti orientasi
// device - beberapa browser mobile (terutama WebView di dalam app chat
// spt WhatsApp/Messenger, dan sebagian Android WebView) TIDAK auto-rotate
// video getUserMedia sendiri walau device diputar, jadi perlu di-handle manual.
function getScreenAngle() {
  if (typeof window === "undefined") return 0;
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === "number") return ((angle % 360) + 360) % 360;
  if (typeof window.orientation === "number") return ((window.orientation % 360) + 360) % 360;
  return 0;
}

function CameraCapture({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraErr, setCameraErr] = useState("");
  const [ready, setReady] = useState(false);
  const [angle, setAngle] = useState(0); // 0/90/180/270 - rotasi utk kompensasi preview & capture
  // Hasil jepretan ditahan dulu di sini (preview) - BELUM langsung dikirim
  // ke parent via onCapture. User wajib konfirmasi "Gunakan Foto" dulu,
  // atau "Ambil Ulang" kalau hasilnya miring/kurang pas (lihat permintaan
  // user). Stream kamera TIDAK dimatikan saat preview supaya "Ambil Ulang"
  // instan tanpa perlu minta izin kamera ulang.
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewFileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const updateAngle = () => {
      let a = getScreenAngle();
      // Fallback utk WebView yg API screen.orientation-nya gak akurat
      // (laporan user: sejumlah in-app browser chat spt WhatsApp/Messenger/
      // Instagram gak update `angle` walau device udah diputar ke
      // landscape) - kalau API bilang tegak (0/180) padahal window jelas2
      // lebih lebar dari tinggi (landscape), paksa anggap 90° supaya
      // kompensasi rotasi TETAP jalan (prioritas: foto gak boleh miring,
      // drpd ikut info API yg salah).
      const dimLandscape = window.innerWidth > window.innerHeight;
      if (dimLandscape && (a === 0 || a === 180)) a = 90;
      if (!dimLandscape && (a === 90 || a === 270) && window.innerHeight <= window.innerWidth) {
        // kebalikannya (API bilang landscape tp window jelas potrait) - abaikan API, anggap tegak
        a = 0;
      }
      setAngle(a);
    };
    updateAngle();
    window.screen?.orientation?.addEventListener?.("change", updateAngle);
    window.addEventListener("orientationchange", updateAngle);
    window.addEventListener("resize", updateAngle);
    return () => {
      window.screen?.orientation?.removeEventListener?.("change", updateAngle);
      window.removeEventListener("orientationchange", updateAngle);
      window.removeEventListener("resize", updateAngle);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraErr(""); setReady(false); setPreviewUrl(null); previewFileRef.current = null;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("unsupported");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        if (cancelled) return;
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
          setCameraErr("Akses kamera ditolak. Mohon izinkan akses kamera di browser untuk melanjutkan.");
        } else if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") {
          setCameraErr("Kamera tidak ditemukan di perangkat ini. Form ini wajib menggunakan kamera langsung.");
        } else {
          setCameraErr("Tidak bisa mengakses kamera. Pastikan browser mendukung & izin kamera sudah diberikan.");
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    };
  }, [open]);

  const stopStream = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  const handleClose = () => {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); previewFileRef.current = null;
    onClose();
  };

  const handleShutter = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    // Kompensasi rotasi: kalau layar lagi landscape (angle 90/270), lebar &
    // tinggi canvas ditukar supaya hasil foto digambar tegak (bukan
    // kesamping), sesuai apa yg user lihat di preview yg sudah di-rotate.
    if (angle === 90 || angle === 270) {
      canvas.width = vh; canvas.height = vw;
    } else {
      canvas.width = vw; canvas.height = vh;
    }
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    ctx.restore();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
      previewFileRef.current = file;
      setPreviewUrl(URL.createObjectURL(blob));
    }, "image/jpeg", 0.92);
  };

  const handleRetake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    previewFileRef.current = null;
  };

  const handleUsePhoto = () => {
    const file = previewFileRef.current;
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    previewFileRef.current = null;
    if (file) onCapture(file);
  };

  const isLandscape = angle === 90 || angle === 270;

  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 999,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {!cameraErr && !previewUrl && (
        <video ref={videoRef} playsInline muted style={{
          width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0,
          transform: `rotate(${-angle}deg)`,
          transition: "transform .25s ease",
        }} />
      )}
      {/* Preview hasil jepretan - full-screen, ikut konfirmasi "Gunakan
          Foto" / "Ambil Ulang" sebelum benar2 dikirim ke form. */}
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Pratinjau foto" style={{
          width: "100%", height: "100%", objectFit: "contain", position: "absolute", inset: 0, background: "#000",
        }} />
      )}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "calc(18px + env(safe-area-inset-top)) 16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
        {/* Badge indikator orientasi - biar user tau kamera ini udah
            kedeteksi landscape atau belum, bukan cuma nebak2 dari hasil
            fotonya nanti. Icon ikut ngikutin bentuk persegi yg di-rotate
            sesuai sudut terdeteksi. */}
        {!cameraErr && !previewUrl ? (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.16)", color: "#fff", fontSize: 11.5, fontWeight: 700,
          }}>
            <span style={{
              width: 14, height: 10, border: "1.6px solid #fff", borderRadius: 2.5, display: "inline-block",
              transform: `rotate(${isLandscape ? 90 : 0}deg)`, transition: "transform .25s ease",
            }} />
            {isLandscape ? "Landscape" : "Potret"}
          </div>
        ) : <span />}
        <button onClick={handleClose} style={{
          width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.18)",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
        }}>
          <X size={20} />
        </button>
      </div>
      {cameraErr ? (
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 28px", color: "#fff" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(220,38,38,0.2)", margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Camera size={26} color="#FCA5A5" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Kamera tidak tersedia</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, marginBottom: 22 }}>{cameraErr}</div>
          <button onClick={handleClose} style={{
            padding: "10px 22px", borderRadius: 999, border: "none", background: "#fff", color: "#14121C",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Tutup</button>
        </div>
      ) : previewUrl ? (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom))",
          display: "flex", gap: 10, background: "linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))",
        }}>
          <button onClick={handleRetake} style={{
            flex: 1, padding: "13px 16px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: FONT,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            Ambil Ulang
          </button>
          <button onClick={handleUsePhoto} style={{
            flex: 1, padding: "13px 16px", borderRadius: 12, border: "none",
            background: PINK, color: "#fff", fontWeight: 800, fontSize: 14, fontFamily: FONT,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            <Check size={16} strokeWidth={3} /> Gunakan Foto
          </button>
        </div>
      ) : (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 0 calc(36px + env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", zIndex: 2 }}>
          <button onClick={handleShutter} disabled={!ready} style={{
            width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff",
            background: ready ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
            cursor: ready ? "pointer" : "not-allowed",
          }} />
        </div>
      )}
    </div>
  );
}

export default function AuditOutletFormPage() {
  // PWA: daftarkan service worker (installable) - online-only, sama pola
  // persis dgn app/martahub/m/_shared/MobileShell.jsx & app/promotor/page.jsx.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/marta/audit-outlet/sw.js", { scope: "/marta/audit-outlet/" }).catch(() => {});
  }, []);

  // "Pasang Aplikasi" - tombol add-to-home-screen, sama pola persis dgn
  // app/martahub/m/login/page.jsx (lihat komentar lengkap di sana): Android/
  // Chrome bisa trigger otomatis lewat event `beforeinstallprompt`, iOS
  // Safari TIDAK bisa sama sekali (batasan platform) jadi cuma ditampilkan
  // panduan manual (Share > Add to Home Screen). Disembunyikan total kalau
  // app sudah ke-install (`display-mode: standalone`).
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installingApp, setInstallingApp] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  useEffect(() => {
    const ua = window.navigator.userAgent || "";
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !window.MSStream);
    setIsMobileDevice(/android|iphone|ipad|ipod|mobile/i.test(ua));
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
    );
    const onBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);
  // Tinggi viewport REAL (px) - khusus utk jaga BottomBar "lengket" pas di
  // iOS PWA standalone. inset:0 / 100dvh kadang kepotong dikit sama area
  // home-indicator/layout-vs-visual-viewport WebKit (Android gak kena ini
  // sama sekali), jadi ninggalin gap tipis di bawah BottomBar. window.
  // visualViewport.height adalah satu2nya angka yg akurat beneran di iOS -
  // dipakai utk set height eksplisit (px) pada container root, gak cuma
  // andalkan inset:0 yg "auto-stretch".
  // `vh` = tinggi visual viewport, `vTop` = offsetTop-nya. Dua-duanya perlu:
  // di iOS Safari keyboard TIDAK menyusutkan layout viewport, cuma visual
  // viewport yg menyusut + bergeser (offsetTop). Event resize iOS juga
  // sering cuma kepanggil di AWAL animasi keyboard (nilai tengah2), jadi
  // container berhenti di tinggi yg keliru -> gap kosong di atas keyboard.
  // Solusi: ukur ulang di event scroll/resize visualViewport, focusin/
  // focusout, dan polling singkat (~1 dtk) setelah fokus berubah supaya
  // nilai akhir setelah animasi keyboard selesai yg dipakai.
  const [vh, setVh] = useState(null);
  const [vTop, setVTop] = useState(0);
  const [kbOpen, setKbOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    const isTyping = (el) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(el.type)));
    // Keyboard dianggap TERBUKA hanya kalau (1) ada kolom teks yg difokus DAN
    // (2) tinggi area kelihatan benar2 menyusut dibanding tinggi normalnya.
    // Sebelumnya cukup "ada kolom difokus" -> tombol bawah ikut hilang di
    // desktop/emulator (tanpa keyboard layar) dan NYANGKUT hilang kalau kolom
    // yg difokus dilepas tanpa event blur (mis. sheet "Cari ID Outlet" ditutup).
    // Dicek ulang tiap 400ms + tiap event, jadi selalu self-healing.
    const base = { h: 0 };
    const measure = () => {
      const vv = window.visualViewport;
      const h = Math.round(vv ? vv.height * (vv.scale || 1) : window.innerHeight);
      const typing = isTyping(document.activeElement);
      if (!typing || base.h === 0) base.h = Math.max(h, typing ? base.h : 0) || h;
      setKbOpen(typing && h < base.h - 120);
    };
    const onIn = (e) => {
      if (!isTyping(e.target)) return;
      measure();
      // Setelah animasi keyboard selesai, gulirkan kolom yg difokus ke
      // tengah area yg kelihatan supaya tidak tertutup keyboard.
      const el = e.target;
      setTimeout(() => { try { if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }, 380);
    };
    const onOut = () => { setTimeout(measure, 60); };
    const vv = window.visualViewport;
    const timer = setInterval(measure, 400);
    window.addEventListener("focusin", onIn);
    window.addEventListener("focusout", onOut);
    window.addEventListener("orientationchange", () => { base.h = 0; });
    vv?.addEventListener("resize", measure);
    measure();
    return () => {
      clearInterval(timer);
      window.removeEventListener("focusin", onIn);
      window.removeEventListener("focusout", onOut);
      vv?.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const update = () => {
      setVh(vv ? Math.round(vv.height * (vv.scale || 1)) : window.innerHeight);
      setVTop(vv ? Math.max(0, Math.round(vv.offsetTop)) : 0);
    };
    let raf = 0;
    let until = 0;
    const poll = () => {
      update();
      if (performance.now() < until) raf = requestAnimationFrame(poll);
    };
    const burst = () => {
      until = performance.now() + 1000;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(poll);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", burst);
    window.addEventListener("focusin", burst);
    window.addEventListener("focusout", burst);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", burst);
      window.removeEventListener("focusin", burst);
      window.removeEventListener("focusout", burst);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) { setShowIOSGuide(true); return; }
    if (!installPrompt) return;
    setInstallingApp(true);
    try {
      installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
      setInstallingApp(false);
    }
  };
  const showInstallButton = !isStandalone && (isIOS || !!installPrompt);

  const [step, setStep] = useState(0); // 0=Data Outlet, 1=Foto Outlet, 2=Visibility, 3=Availability, 4=Review (Konfirmasi = layar `done` terpisah)
  const [done, setDone] = useState(false);
  const [doneAt, setDoneAt] = useState(null);
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);

  // Begitu submit sukses: tampilkan animasi Lottie full-screen dulu
  // ("Pendaftaran Berhasil"), baru setelah itu layar konfirmasi detail
  // muncul - bukan langsung tanpa transisi.
  useEffect(() => {
    if (!done) return;
    setShowSuccessAnim(true);
    const id = setTimeout(() => setShowSuccessAnim(false), 2200);
    return () => clearTimeout(id);
  }, [done]);

  // Outlet terpilih DISIMPAN LANGSUNG sbg object (dikirim OutletPicker
  // saat user tap 1 baris hasil pencarian) - bukan lagi di-lookup dari
  // daftar lengkap yg didownload upfront (lihat OutletPicker: sekarang
  // dia search server-side on-demand, gak ada lagi daftar penuh di sini
  // utk di-lookup).
  const [selectedOutlet, setSelectedOutlet] = useState(null);

  // Foto referensi (contoh benar/salah) yg diupload admin CMS - dipakai
  // PhotoGuide dibawah supaya Panduan Foto menampilkan foto asli, bukan
  // cuma teks. Kalau belum ada yg diupload (slot kosong), PhotoGuide jatuh
  // balik ke daftar teks dos/donts seperti sebelumnya.
  const [refPhotos, setRefPhotos] = useState([]);
  const refetchRefPhotos = () => { aoListReferencePhotos().then(setRefPhotos).catch(() => {}); };
  useEffect(() => { refetchRefPhotos(); }, []);
  const refsFor = (jenis) => ({
    benar: refPhotos.find((r) => r.jenis === jenis && r.kind === "benar" && r.url)?.url || "",
    salah: [1, 2, 3]
      .map((u) => refPhotos.find((r) => r.jenis === jenis && r.kind === "salah" && r.urutan === u))
      .filter((r) => r?.url),
  });

  const [namaSender, setNamaSender] = useState("");
  const [namaOutlet, setNamaOutlet] = useState("");
  const [idOutlet, setIdOutlet] = useState("");
  const [socialMedia, setSocialMedia] = useState("");
  const [etalaseFiles, setEtalaseFiles] = useState([null, null, null]);
  const [tapakFile, setTapakFile] = useState(null);
  // Capture berurutan dari tombol "Ambil Foto ..." di sheet Panduan - ambil
  // foto 1 -> otomatis lanjut ke foto 2 -> foto 3, begitu 3-3 nya kepenuhi
  // tombol itu cuma nutup sheet balik ke tampilan Foto Outlet (gak buka
  // kamera lagi). 2 input file TERSEMBUNYI terpisah dari yg ada di tiap
  // PhotoSlot (yg masih bisa dipakai manual per-slot spt biasa).
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraTargetRef = useRef(null); // callback(file) dipanggil saat shutter ditekan
  const nativeCameraInputRef = useRef(null); // <input capture> tersembunyi, khusus HP (lihat openCameraFor)
  // Lightbox foto di step Review - klik thumbnail Foto Etalase/Tampak Depan
  // buat lihat ukuran penuh, sama pola kayak lightbox foto referensi di
  // PhotoGuide. Simpan SELURUH daftar foto + index aktif (bukan 1 url
  // doang) - utk Foto Etalase (s.d. 3 foto) bisa geser kiri/kanan dari
  // lightbox yg lagi kebuka, gak perlu nutup+klik thumbnail lain lagi.
  const [reviewLightbox, setReviewLightbox] = useState(null); // { urls: string[], index: number } | null
  const reviewLightboxDrag = useRef({ startX: 0 });

  // GPS - auto-capture (mockup: "ada longlat capture juga"), BUKAN field yg
  // diisi manual sender, cuma dicatat diam2 sbg bukti lokasi submit (dipakai
  // nanti utk validasi radius vs outlet terpilih - lihat diskusi sebelumnya).
  const [gpsLat, setGpsLat] = useState(null);
  const [gpsLng, setGpsLng] = useState(null);
  const [gpsLocating, setGpsLocating] = useState(false);
  const [gpsError, setGpsError] = useState("");
  // Longlat ini WAJIB akurat (dipakai validasi radius vs outlet terpilih),
  // TAPI auto-retry tiap 5 detik DIHAPUS (sebelumnya ada) - kalau gagal,
  // sender tap tombol "Coba Lagi" sendiri dan itu langsung manggil
  // getCurrentPosition lagi (prompt izin browser muncul ulang kalau
  // statusnya masih "belum ditentukan"/prompt; kalau user sempat pilih
  // "Block"/"Never allow" permanen, itu batasan keamanan browser - gak ada
  // API JS yg bisa paksa prompt itu muncul lagi, user wajib ubah sendiri
  // lewat Settings browser lalu tap "Coba Lagi").
  const captureGps = () => {
    if (!navigator.geolocation) { setGpsError("Browser ini tidak mendukung GPS."); return; }
    // Kalau izinnya sudah di-"Block" permanen, getCurrentPosition gagal
    // SEKETIKA (gak ada network/GPS delay sama sekali) - makanya tap
    // "Coba Lagi" kelihatan "tidak terjadi apa apa" (locating cuma nyala
    // sepersekian detik lalu balik ke error yang sama persis). Dikasih
    // delay minimum biar spinner sempat kelihatan jalan (ada feedback nyata
    // tiap tap), dan pesan errornya dibedain khusus utk kasus "denied"
    // permanen - supaya jelas itu bukan diam/ngebug, tapi emang perlu
    // diaktifkan manual lewat Settings browser.
    setGpsLocating(true); setGpsError("");
    const startedAt = Date.now();
    const MIN_SPIN_MS = 500;
    const finish = (fn) => {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPIN_MS - elapsed);
      setTimeout(fn, wait);
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish(() => {
          setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsLocating(false);
        });
      },
      (err) => {
        finish(() => {
          setGpsError(
            err && err.code === err.PERMISSION_DENIED
              ? "Izin lokasi diblokir. Aktifkan lewat pengaturan browser (ikon gembok di address bar), lalu tap Coba Lagi."
              : "Gagal mengambil lokasi. Pastikan izin lokasi diaktifkan."
          );
          setGpsLocating(false);
        });
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  // Dicoba otomatis saat form dibuka, DAN diulang tiap kali pindah step
  // (bukan cuma sekali di awal) - supaya kalau GPS sempat gagal/izin
  // belum diizinkan saat awal buka, begitu sender lanjut ke step
  // berikutnya dia dicoba ulang lagi secara diam2 (gak perlu sender tap
  // apa2). Kalau akhirnya sukses, chip errornya otomatis hilang.
  useEffect(() => { captureGps(); }, [step]);
  // Pindah step -> selalu mulai dari atas (container ini yg scroll, bukan window).
  useEffect(() => { rootRef.current?.scrollTo?.({ top: 0 }); }, [step]);

  // 4 jawaban availability (step "Cek Availability Produk" di mockup) -
  // null = belum dijawab (dibedakan dari false/"Tidak").
  const [spIm3, setSpIm3] = useState(null);
  const [sp3id, setSp3id] = useState(null);
  const [voucherIm3, setVoucherIm3] = useState(null);
  const [voucher3id, setVoucher3id] = useState(null);
  const availabilityState = { spIm3: [spIm3, setSpIm3], sp3id: [sp3id, setSp3id], voucherIm3: [voucherIm3, setVoucherIm3], voucher3id: [voucher3id, setVoucher3id] };

  // 5 jawaban visibility (step "Cek Visibility Outlet") - null = belum
  // dijawab, 1 = Ada, 0 = Tidak Ada (dikirim apa adanya ke kolom vis_*).
  const VIS_EMPTY = { poster: null, shopblind: null, flagchain: null, tablemate: null, stickerEtalase: null };
  const [vis, setVis] = useState(VIS_EMPTY);
  const setVisItem = (key, val) => setVis((prev) => ({ ...prev, [key]: val }));
  const [attemptedV, setAttemptedV] = useState(false); // sama utk step Visibility

  const [submitting, setSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressStep, setProgressStep] = useState({ current: 0, total: 1 });
  const [err, setErr] = useState("");
  const [attempted0, setAttempted0] = useState(false); // true setelah "Selanjutnya" step Data Outlet ditekan - baru di sini field kosong ditandai merah
  const [attempted1, setAttempted1] = useState(false); // sama utk step Foto Outlet
  const [attempted2, setAttempted2] = useState(false); // sama utk step Availability

  // Nama Outlet SEKARANG murni freetext dari sender - TIDAK lagi auto-isi
  // dari nama_outlet (nama desa) hasil pilih ID Outlet, krn nama_outlet di
  // whitelist cuma nama desa, bukan nama outlet sebenarnya.
  // `outletObj` dikirim langsung oleh OutletPicker (baris hasil search yg
  // di-tap) - disimpan apa adanya ke `selectedOutlet`, gak perlu lookup
  // dari daftar lengkap lagi (lihat komentar di state `selectedOutlet`).
  const onPickOutlet = (id, outletObj) => { setIdOutlet(id); setSelectedOutlet(outletObj || null); };

  const dataValid = namaSender.trim() && namaOutlet.trim() && idOutlet.trim();
  const etalaseCount = etalaseFiles.filter(Boolean).length;
  const fotoValid = etalaseCount >= 1 && !!tapakFile;
  const availabilityValid = spIm3 !== null && sp3id !== null && voucherIm3 !== null && voucher3id !== null;
  const availabilityAnsweredCount = [spIm3, sp3id, voucherIm3, voucher3id].filter((v) => v !== null).length;
  const visibilityAnsweredCount = VISIBILITY_ITEMS.filter((it) => vis[it.key] !== null).length;
  const visibilityValid = visibilityAnsweredCount === VISIBILITY_ITEMS.length;

  // Tombol "Selanjutnya" SELALU bisa diklik ("tombol dibuat bisa diklik") -
  // kalau ada field wajib yg masih kosong, bukan diblok (disabled), tapi
  // field yg kosong itu yg ditandai outline merah supaya user tahu persis
  // apa yg kurang, baru lanjut ke step berikutnya kalau semua sudah lengkap.
  const goNextFromData = () => {
    if (dataValid) { setAttempted0(false); setStep(1); return; }
    setAttempted0(true);
    const firstId = !namaSender.trim() ? "ao-field-sender" : !namaOutlet.trim() ? "ao-field-outlet" : "ao-field-id";
    setTimeout(() => { try { document.getElementById(firstId)?.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }, 60);
  };
  const goNextFromFoto = () => {
    if (fotoValid) { setAttempted1(false); setStep(2); } else { setAttempted1(true); }
  };
  const goNextFromVisibility = () => {
    if (visibilityValid) { setAttemptedV(false); setStep(3); } else { setAttemptedV(true); }
  };
  const goNextFromAvailability = () => {
    if (availabilityValid) { setAttempted2(false); setStep(4); } else { setAttempted2(true); }
  };

  // Klik langsung di Stepper (lihat <Stepper onStepClick>) - mundur ke step
  // manapun yg udah dilewati selalu boleh (datanya kan udah ada). Maju
  // cuma boleh kalau SEMUA step mandatory di antaranya sudah lengkap -
  // kalau mentok di step tertentu, tandai "attempted" step itu (field
  // kosongnya jadi merah) persis spt nekan "Selanjutnya", trus berhenti
  // di situ (gak ikut lompat ke step tujuan).
  const goToStep = (target) => {
    if (target <= step) { setStep(target); return; }
    if (!dataValid) { setAttempted0(true); setStep(0); return; }
    if (target >= 2 && !fotoValid) { setAttempted1(true); setStep(1); return; }
    if (target >= 3 && !visibilityValid) { setAttemptedV(true); setStep(2); return; }
    if (target >= 4 && !availabilityValid) { setAttempted2(true); setStep(3); return; }
    setStep(target);
  };

  const setEtalaseAt = (i, file) => setEtalaseFiles((prev) => { const n = [...prev]; n[i] = file; return n; });

  // Buka overlay CameraCapture (getUserMedia, wajib kamera - lihat komponen
  // CameraCapture di atas utk alasan kenapa tidak lagi pakai
  // <input type="file" capture="environment">). cameraTargetRef menampung
  // callback yg dipanggil dgn File hasil jepretan.
  const openCameraFor = (onCaptured) => {
    cameraTargetRef.current = onCaptured;
    if (isMobileDevice) {
      // HP: pakai kamera BAWAAN HP langsung (native camera app), bukan
      // overlay getUserMedia custom - jauh lebih stabil (gak ada lagi
      // error izin/preview/rotasi yg sering muncul di sejumlah browser &
      // in-app WebView HP). `capture="environment"` juga memastikan ini
      // SELALU buka kamera, TIDAK PERNAH galeri/album foto.
      nativeCameraInputRef.current?.click();
      return;
    }
    // Laptop/desktop: gak ada "kamera bawaan" native app yg bisa dipanggil
    // spt di HP, jadi tetap pakai overlay getUserMedia (webcam laptop) -
    // supaya tetap WAJIB pakai kamera langsung, bukan buka file
    // picker/galeri biasa.
    setCameraOpen(true);
  };
  const handleNativeCameraChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // reset biar bisa jepret foto baru dgn nama file sama lagi
    if (!f) { cameraTargetRef.current = null; return; }
    const cb = cameraTargetRef.current;
    cameraTargetRef.current = null;
    cb?.(f);
  };
  const handleCameraCapture = (file) => {
    setCameraOpen(false);
    const cb = cameraTargetRef.current;
    cameraTargetRef.current = null;
    cb?.(file);
  };
  const handleCameraClose = () => {
    setCameraOpen(false);
    cameraTargetRef.current = null;
  };

  const captureEtalaseSlot = (slotIdx) => {
    openCameraFor((f) => setEtalaseAt(slotIdx, f));
  };

  const startEtalaseCapture = () => {
    if (etalaseFiles.every(Boolean)) return; // 3/3 - jangan buka kamera lagi
    openCameraFor((f) => {
      setEtalaseFiles((prev) => {
        const idx = prev.findIndex((x) => !x);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = f;
        // Masih ada slot kosong sisanya -> buka kamera lagi otomatis utk
        // foto berikutnya.
        if (next.some((x) => !x)) {
          setTimeout(() => startEtalaseCapture(), 350);
        }
        return next;
      });
    });
  };

  const startTapakCapture = () => {
    if (tapakFile) return; // sudah ada - jangan buka kamera lagi
    openCameraFor((f) => setTapakFile(f));
  };

  const submit = async () => {
    setSubmitting(true); setErr("");
    const etalase = etalaseFiles.filter(Boolean);
    const totalSteps = 2 + etalase.length; // simpan data + tiap foto etalase + foto tapak depan
    let stepsDone = 0;
    setProgressStep({ current: 0, total: totalSteps });
    const advance = () => { stepsDone += 1; setProgressStep({ current: stepsDone, total: totalSteps }); };
    try {
      setProgressMsg("Menyimpan data outlet ke sistem...");
      const submissionId = await aoCreateSubmission({
        namaSender: namaSender.trim(), namaOutlet: namaOutlet.trim(), idOutlet: idOutlet.trim(),
        socialMedia: socialMedia.trim(),
        latitude: gpsLat, longitude: gpsLng,
        spIm3, sp3id, voucherIm3, voucher3id,
        visPoster: vis.poster, visShopblind: vis.shopblind, visFlagchain: vis.flagchain,
        visTablemate: vis.tablemate, visStickerEtalase: vis.stickerEtalase,
      });
      advance();
      for (let i = 0; i < etalase.length; i++) {
        setProgressMsg(`Mengunggah foto etalase ${i + 1} dari ${etalase.length}...`);
        await aoUploadPhoto(submissionId, "etalase", i + 1, etalase[i]);
        advance();
      }
      setProgressMsg("Mengunggah foto tampak depan outlet...");
      await aoUploadPhoto(submissionId, "tapak_depan", 1, tapakFile);
      advance();
      setDoneAt(new Date());
      setDone(true);
    } catch (e) {
      setErr(e?.message || "Gagal mengirim data, coba lagi.");
      setStep(4);
    } finally {
      setSubmitting(false); setProgressMsg(""); setProgressStep({ current: 0, total: 1 });
    }
  };

  const resetAll = () => {
    setNamaSender(""); setNamaOutlet(""); setIdOutlet(""); setSocialMedia(""); setSelectedOutlet(null);
    setEtalaseFiles([null, null, null]); setTapakFile(null);
    setSpIm3(null); setSp3id(null); setVoucherIm3(null); setVoucher3id(null);
    setVis(VIS_EMPTY); setAttemptedV(false);
    setGpsLat(null); setGpsLng(null); setGpsError("");
    setStep(0); setDone(false); setErr("");
    captureGps();
  };

  if (submitting) {
    const pct = Math.min(100, Math.round((progressStep.current / progressStep.total) * 100));
    const phase = progressMsg.includes("tampak depan") ? 2 : progressMsg.includes("etalase") ? 1 : 0;
    const PHASES = ["Data Outlet", "Foto Etalase", "Foto Tampak Depan"];
    // Dulu overlay ini "position: static" biasa (ikut document flow) dgn
    // cuma minHeight:100svh - kalau user nge-tap "Kirim" sambil scroll
    // masih di bawah (form cukup panjang), overlay ketarik sejajar sama
    // posisi scroll lama & jadi ketutup sebagian / keliatan nge-gap putih
    // di bawahnya pas address-bar browser collapse/expand (ini laporan
    // user: "sering kali tidak muncul dengan baik"). Sekarang full-screen
    // overlay betulan (position:fixed, inset:0) - selalu nutup PERSIS
    // seluruh viewport apapun posisi scroll/ukuran address-bar, dan konten
    // di-center pakai flex vertikal+horizontal supaya selalu pas di tengah
    // layar di semua ukuran device (responsive).
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 500, background: BG, fontFamily: FONT,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "28px 24px", textAlign: "center", boxSizing: "border-box",
        animation: "submitOverlayFade .25s ease",
      }}>
        <div style={{ position: "relative", width: 104, height: 104, display: "flex", alignItems: "center", justifyContent: "center", animation: "submitRingPop .4s cubic-bezier(.34,1.3,.64,1)" }}>
          <svg width={104} height={104} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx={52} cy={52} r={46} stroke={BORDER} strokeWidth={6} fill="none" />
            <circle
              cx={52} cy={52} r={46} stroke={PINK} strokeWidth={6} fill="none" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset .45s ease" }}
            />
          </svg>
          <span style={{ fontSize: 19, fontWeight: 800, color: INK }}>{pct}%</span>
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 18, letterSpacing: "-0.02em" }}>
          Mengirim Data Outlet
        </div>
        <div style={{ fontSize: 13, color: MID, marginTop: 5, minHeight: 18 }}>{progressMsg}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 22 }}>
          {PHASES.map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800, flexShrink: 0, transition: "all .3s ease",
                background: i < phase ? "#16A34A" : i === phase ? PINK : "#fff",
                color: i <= phase ? "#fff" : "#B7B4C0",
                border: i === phase ? `2px solid ${PINK}` : i < phase ? "none" : `1.5px solid ${BORDER}`,
                boxShadow: i === phase ? "0 0 0 3.5px rgba(236,11,111,0.14)" : "none",
              }}>
                {i < phase ? <Check size={9.5} /> : i + 1}
              </div>
              {i < PHASES.length - 1 && (
                <div style={{ width: 16, height: 2, borderRadius: 999, background: i < phase ? "#16A34A" : BORDER, transition: "background .3s ease" }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10.5, color: "#B7B4C0", marginTop: 18 }}>Mohon tunggu, jangan tutup halaman ini.</div>
        <style>{`
          @keyframes submitOverlayFade{0%{opacity:0}100%{opacity:1}}
          @keyframes submitRingPop{0%{opacity:0;transform:scale(.85)}100%{opacity:1;transform:scale(1)}}
        `}</style>
      </div>
    );
  }

  if (done && showSuccessAnim) {
    return (
      <div style={{
        minHeight: "100vh", background: "#fff", fontFamily: FONT, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center",
      }}>
        <div style={{ position: "relative", animation: "successPopBig .55s cubic-bezier(.19,1.28,.32,1.02) both" }}>
          <SuccessLottieIcon size={340} />
        </div>
        <style>{`
          @keyframes successPopBig{0%{opacity:0;transform:scale(.72) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        `}</style>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100svh", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column", animation: "fadeIn .4s both" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 24px 12px", textAlign: "center" }}>
          <div style={{ position: "relative", width: 380, height: 380, marginBottom: -36, display: "flex", alignItems: "center", justifyContent: "center", animation: "doneRise .5s cubic-bezier(.19,1.1,.32,1.02) both" }}>
            <div style={{ position: "absolute", width: 210, height: 210, borderRadius: "50%", background: "rgba(236,11,111,0.07)", top: 48, left: 46, animation: "doneBlobA 6.5s ease-in-out infinite" }} />
            <div style={{ position: "absolute", width: 168, height: 168, borderRadius: "50%", background: "rgba(247,148,29,0.08)", bottom: 48, right: 60, animation: "doneBlobB 7.5s ease-in-out infinite" }} />
            <div style={{ position: "absolute", width: 108, height: 108, borderRadius: "50%", background: "rgba(255,194,14,0.09)", top: 70, right: 68, animation: "doneBlobA 8.5s ease-in-out infinite .4s" }} />
            <img src="/marta/audit-outlet/success-outlet.png" alt="Outlet berhasil didaftarkan" style={{ position: "relative", width: 380, height: 380, objectFit: "contain", filter: "drop-shadow(0 14px 26px rgba(236,11,111,0.2))" }} />
          </div>

          <div style={{ fontSize: 25, fontWeight: 800, color: INK, marginBottom: 7, letterSpacing: "-0.02em", animation: "doneUp .4s .12s both" }}>
            Data Outlet<br />Berhasil Dikirim!
          </div>
          <div style={{ fontSize: 13.5, color: MID, maxWidth: 280, marginBottom: 22, lineHeight: 1.5, animation: "doneUp .4s .18s both" }}>
            Terima kasih, data outlet telah berhasil disimpan dalam sistem.
          </div>

          <div style={{
            width: "100%", maxWidth: 320, background: "#fff", borderRadius: 18, padding: "6px 18px 4px",
            textAlign: "left", boxShadow: "0 10px 30px rgba(20,18,28,0.08)", border: `1px solid ${BORDER}`,
            animation: "doneUp .4s .24s both",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7, padding: "12px 0", fontSize: 13, fontWeight: 800,
              color: "#6B6875", textTransform: "uppercase", letterSpacing: "0.03em",
            }}>
              <CheckCircle2 size={15} color="#16A34A" /> Ringkasan Pendaftaran
            </div>
            <div style={{ height: 1, background: BORDER, marginBottom: 4 }} />

            {(selectedOutlet?.outlet_id_im3 || selectedOutlet?.outlet_id_3id) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "13px 0", borderBottom: `1px solid ${BORDER}` }}>
                {selectedOutlet?.outlet_id_im3 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999, background: YELLOW, color: "#5C4300" }}>IM3</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_im3}</span>
                  </div>
                )}
                {selectedOutlet?.outlet_id_im3 && selectedOutlet?.outlet_id_3id && <div style={{ width: 1, height: 14, background: BORDER }} />}
                {selectedOutlet?.outlet_id_3id && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999, background: PINK_DK, color: "#fff" }}>3ID</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_3id}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(236,11,111,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ScanBarcode size={14} color={PINK} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: "#8A8795" }}>ID Outlet</div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{idOutlet}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(247,148,29,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Store size={14} color={ORANGE} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "#8A8795" }}>Nama Outlet</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namaOutlet || "-"}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0" }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(16,163,74,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Calendar size={14} color="#16A34A" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "#8A8795" }}>Tanggal</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>
                  {doneAt ? doneAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
              </div>
            </div>
          </div>

          <div style={{ width: "100%", maxWidth: 320, marginTop: 20, paddingBottom: "env(safe-area-inset-bottom)", display: "flex", animation: "doneUp .4s .3s both" }}>
            <PrimaryBtn onClick={resetAll} full><ArrowLeft size={16} /> Daftar Outlet Lain</PrimaryBtn>
          </div>
        </div>
        <style>{`
          @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
          @keyframes doneUp{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
          @keyframes doneRise{0%{opacity:0;transform:scale(.82) translateY(6px)}100%{opacity:1;transform:scale(1) translateY(0)}}
          @keyframes doneBlobA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(8px,10px) scale(1.1)}}
          @keyframes doneBlobB{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-7px,-9px) scale(1.12)}}
        `}</style>
      </div>
    );
  }

  return (
    // position:fixed + inset:0 (bukan cuma minHeight:100vh biasa) - supaya
    // <body> gak ikut jadi scroll container-nya. Sebelumnya body yg
    // scroll, jadi pas standalone PWA di-scroll/rubber-band dikit aja,
    // background <body> (yg di dark mode device = gelap/hampir hitam, lihat
    // globals.css) sempat kesorot persis di belakang notch/status bar -
    // itu salah satu sumber "bagian atas jadi dark" yg dilaporkan user,
    // bukan cuma soal status-bar translucency iOS. Dengan div ini sendiri
    // yg jadi scroll container (overflowY:auto + -webkit-overflow-scrolling
    // utk momentum scroll iOS), gak ada lagi body yg kesorot - app ini
    // kerasa penuh layar (fullscreen) & konsisten di semua ukuran device.
    <div ref={rootRef}
      // Ketuk area kosong (bukan kolom/tombol/link) -> tutup keyboard.
      onPointerDown={(e) => {
        const a = document.activeElement;
        if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && !e.target.closest("input,textarea,select,button,a,label")) a.blur();
      }}
      style={{
      // height eksplisit dari window.visualViewport (px, via hook `vh` di
      // atas) - khusus iOS PWA standalone, inset:0 doang/100dvh bisa
      // mismatch tipis dgn tinggi layar yg BENERAN kelihatan (Android gak
      // kena ini). Sebelum `vh` sempat terukur (first paint/SSR), fallback
      // ke inset:0 dulu spy gak ada flash kosong.
      position: "fixed", top: vTop, left: 0, right: 0,
      ...(vh ? { height: vh } : { bottom: 0 }),
      overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "none",
      // Cegah zoom (pinch / double-tap) - iOS mengabaikan maximum-scale, jadi
      // zoom nyangkut (layout "membesar", tombol bawah keluar layar).
      touchAction: "pan-x pan-y",
      background: BG, fontFamily: FONT, display: "flex", flexDirection: "column",
    }}>
      {/* Jaring pengaman: <html>/<body> global (globals.css) punya
          background GELAP (var(--background) #0a0a0a) di dark mode device -
          kalau container fixed di atas ini ternyata gak pas 100% nutup
          tinggi viewport asli (beda hitungan "layout viewport" vs "visual
          viewport" di sejumlah device/browser versi iOS pas PWA standalone,
          atau pas keyboard muncul/overlay dropdown spt "Cari ID Outlet"),
          bagian yg "bocor" di bawah/atasnya bakal nunjukin hitam pekat body
          itu - persis laporan user "bagian hitam saat pemilihan outlet".
          Form ini DIBUAT LIGHT MODE SAJA, gak boleh ada dark mode sama
          sekali - jadi override-nya pakai warna BG TERANG form ini (bukan
          gradient gelap spt sebelumnya), dan color-scheme dipaksa "light"
          biar keyboard/native UI browser juga ikut terang, bukan ngikut
          dark mode OS device. */}
      <style>{`
        html, body { background: ${BG} !important; color-scheme: light !important; }
        .ao-wrap { max-width: 480px; }
        @media (min-width: 640px) { .ao-wrap { max-width: 560px; } }
        @media (min-width: 900px) { .ao-wrap { max-width: 640px; } }
        /* Layar HP: padat & proporsional (bukan ukuran desktop yg terasa
           "zoom"). Font input TETAP 16px (di bawah itu iOS auto-zoom). */
        @media (max-width: 420px) {
          .ao-page { padding-left: 14px !important; padding-right: 14px !important; padding-top: 14px !important; }
          .ao-card { padding: 15px !important; border-radius: 16px !important; margin-bottom: 14px !important; }
          .ao-card-hd { padding-bottom: 13px !important; margin-bottom: 13px !important; }
          .ao-field { margin-bottom: 13px !important; }
          .ao-label { font-size: 12.5px !important; margin-bottom: 6px !important; }
          .ao-in { padding-top: 10px !important; padding-bottom: 10px !important; }
          .ao-hdr { padding-top: calc(16px + env(safe-area-inset-top)) !important; }
          .ao-stepper { padding: 18px 10px 16px !important; }
          .ao-step-label { font-size: 10px !important; }
          .ao-bar { padding-top: 12px !important; padding-bottom: calc(12px + env(safe-area-inset-bottom)) !important; }
          .ao-btn { padding-top: 12px !important; padding-bottom: 12px !important; }
        }
        @media (max-width: 360px) {
          .ao-page { padding-left: 12px !important; padding-right: 12px !important; }
          .ao-card { padding: 13px !important; }
          .ao-stepper { padding-left: 6px !important; padding-right: 6px !important; }
          .ao-step-dot { width: 24px !important; height: 24px !important; font-size: 11px !important; }
          .ao-step-line { margin-top: 10.5px !important; }
          .ao-step-label { font-size: 9px !important; }
        }
      `}</style>
      <CameraCapture open={cameraOpen} onClose={handleCameraClose} onCapture={handleCameraCapture} />
      {/* Input tersembunyi khusus HP - capture="environment" memaksa buka
          kamera belakang HP langsung (bukan galeri). Dipicu programatis
          lewat nativeCameraInputRef.current.click() dari openCameraFor(). */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleNativeCameraChange}
        style={{ display: "none" }}
      />
      <div style={{ background: BRAND_GRADIENT, position: kbOpen ? "static" : "sticky", top: 0, zIndex: 30 }}>
        <Header title={<HeaderTitle showInstall={showInstallButton} onInstallClick={handleInstallClick} installing={installingApp} />} />
        <div style={{ background: "#fff", borderRadius: "22px 22px 0 0", marginTop: 0, boxShadow: "0 -8px 20px rgba(0,0,0,0.06)" }}>
          <Stepper step={step} onStepClick={goToStep} />
        </div>
      </div>

      <div className="ao-wrap ao-page" style={{ flex: 1, width: "100%", margin: "0 auto", padding: kbOpen ? "18px 18px 24px" : "18px 18px calc(92px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        {/* GPS dicek ulang tiap pindah step (lihat useEffect([step])) dan
            chip-nya dipasang di SINI (di luar blok per-step) - jadi dia
            selalu nongol pas di bawah Stepper, masih di dalam kontainer
            putih yang sama, di step manapun user lagi berada. Kalau
            aman/belum ada apa2 (locating selesai & gak error) GpsChip
            return null - gak kelihatan sama sekali. */}
        <GpsChip lat={gpsLat} lng={gpsLng} locating={gpsLocating} error={gpsError} onRetry={captureGps} />
        {step === 0 && (
          <SectionCard icon={<ClipboardList size={17} color="#fff" />} title="Data Outlet" subtitle="Informasi dasar outlet">
            <Field id="ao-field-sender" label="Nama Sender" required error={attempted0 && !namaSender.trim()}>
              <div style={{ position: "relative" }}>
                <User size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input className="ao-in" style={{ ...inputStyle, paddingLeft: 36, borderColor: attempted0 && !namaSender.trim() ? "#DC2626" : BORDER }}
                  value={namaSender} onChange={(e) => upperKeepCaret(e, setNamaSender)} placeholder="Masukkan nama Anda"
                  autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("ao-in-outlet")?.focus(); } }} />
              </div>
            </Field>
            <Field id="ao-field-outlet" label="Nama Outlet" required error={attempted0 && !namaOutlet.trim()}>
              <div style={{ position: "relative" }}>
                <Store size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input className="ao-in" style={{ ...inputStyle, paddingLeft: 36, borderColor: attempted0 && !namaOutlet.trim() ? "#DC2626" : BORDER }}
                  id="ao-in-outlet" value={namaOutlet} onChange={(e) => upperKeepCaret(e, setNamaOutlet)} placeholder="Masukkan nama outlet"
                  autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
              </div>
            </Field>
            <Field id="ao-field-id" label="ID Outlet" required error={attempted0 && !idOutlet.trim()}>
              <OutletPicker value={idOutlet} onChange={onPickOutlet} error={attempted0 && !idOutlet.trim()} />
            </Field>
            {idOutlet && (
              <div style={{ borderRadius: 14, background: "#fff", border: `1px solid ${BORDER}`, marginBottom: 16, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 14px", background: "rgba(22,163,74,0.07)", borderBottom: `1px solid rgba(22,163,74,0.16)` }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={11} color="#fff" strokeWidth={3} />
                  </div>
                  <span style={{ fontSize: 12.5, color: "#16A34A", fontWeight: 700 }}>ID Outlet Terdaftar dalam White List</span>
                </div>

                {/* Badge IM3/3ID - cuma pill solid + nilai ID polos (tanpa
                    kotak border tambahan per-badge) biar tidak numpuk 3
                    lapis border (card + kotak badge + pill) spt sebelumnya. */}
                {(selectedOutlet?.outlet_id_im3 || selectedOutlet?.outlet_id_3id) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 14px 12px", flexWrap: "wrap" }}>
                    {selectedOutlet?.outlet_id_im3 && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: YELLOW, color: "#5C4300" }}>IM3</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_im3}</span>
                      </div>
                    )}
                    {selectedOutlet?.outlet_id_3id && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: PINK_DK, color: "#fff" }}>3ID</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_3id}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ height: 1, background: BORDER, margin: "0 14px" }} />

                {/* Info lengkap lokasi outlet terpilih - Region TIDAK
                    ditampilkan (cuma 1 region yg dipakai saat ini: North
                    Sumatera) jadi tinggal 6 field, pas 3x2 kolom. */}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gridTemplateRows: "repeat(3, auto)", gridAutoFlow: "column", gap: "12px 12px", padding: "14px", alignItems: "start" }}>
                  <OutletInfoItem label="Area" value={selectedOutlet?.area} />
                  <OutletInfoItem label="Branch" value={selectedOutlet?.branch} />
                  <OutletInfoItem label="MC" value={selectedOutlet?.mc} />
                  <OutletInfoItem label="Kota/Kabupaten" value={selectedOutlet?.city} />
                  <OutletInfoItem label="Kecamatan" value={selectedOutlet?.district} />
                  <OutletInfoItem label="Desa" value={selectedOutlet?.village} />
                </div>
              </div>
            )}
            <Field label="Social Media" optional>
              <div style={{ position: "relative" }}>
                <AtSign size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input className="ao-in" style={{ ...inputStyle, paddingLeft: 36 }} value={socialMedia} onChange={(e) => setSocialMedia(e.target.value)} placeholder="Contoh: @namaoutlet, link IG/FB"
                  autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" inputMode="text"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } }} />
              </div>
            </Field>
          </SectionCard>
        )}

        {step === 1 && (
          <>
            <SectionCard icon={<ImageIcon size={17} color="#fff" />} title="Foto Etalase Outlet"
              subtitle={<>Maks. 3 foto produk <strong>({etalaseCount}/3)</strong></>} badge="Wajib">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: -2 }}>
                {[0, 1, 2].map((i) => (
                  <PhotoSlot key={i} file={etalaseFiles[i]} label={`Tambah Foto ${i + 1}`}
                    onRequestCamera={() => captureEtalaseSlot(i)}
                    onRemove={() => setEtalaseAt(i, null)} error={attempted1 && etalaseCount < 1 && !etalaseFiles[i]} />
                ))}
              </div>
              <PhotoGuide title="Panduan Foto Etalase Outlet" refs={refsFor("etalase")} onOpen={refetchRefPhotos}
                desc="Foto etalase harus jelas dan fokus, mencakup seluruh produk dan materi promosi yang dipajang."
                dos={["Seluruh etalase terlihat jelas", "Produk & materi promosi terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Gelap / blur", "Terhalang orang atau objek lain"]}
                onCapture={startEtalaseCapture} />
            </SectionCard>
            <SectionCard icon={<Store size={17} color="#fff" />} title="Foto Tampak Depan Outlet" subtitle="1 foto, lingkungan sekitar terlihat" badge="Wajib">
              <div style={{ maxWidth: 150, marginTop: -2 }}>
                <PhotoSlot file={tapakFile} label="Tambah Foto Tampak Depan Outlet"
                  onRequestCamera={() => openCameraFor((f) => setTapakFile(f))}
                  onRemove={() => setTapakFile(null)} error={attempted1 && !tapakFile} />
              </div>
              <PhotoGuide title="Panduan Foto Tampak Depan Outlet" refs={refsFor("tapak_depan")} onOpen={refetchRefPhotos}
                desc="Foto tampak depan harus diambil dari jarak yang cukup, sehingga seluruh fasad toko beserta lingkungan sekitarnya terlihat jelas."
                dos={["Seluruh tampak depan outlet terlihat", "Nama outlet / signage terlihat jelas", "Lingkungan sekitar terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Sudut tidak lengkap (fasad tidak terlihat)", "Gelap / blur"]}
                onCapture={startTapakCapture} />
            </SectionCard>
          </>
        )}

        {step === 2 && (
          <SectionCard icon={<Eye size={17} color="#fff" />} title="Cek Visibility Outlet" subtitle="Ada atau tidak ada di outlet">
            {/* Progres jawaban - bar + hitungan, berubah hijau begitu 5/5. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 99, background: "#EFEDF4", overflow: "hidden" }}>
                <div style={{
                  width: `${(visibilityAnsweredCount / VISIBILITY_ITEMS.length) * 100}%`, height: "100%", borderRadius: 99,
                  background: visibilityValid ? "linear-gradient(90deg, #22C55E, #16A34A)" : `linear-gradient(90deg, ${PINK}, ${ORANGE})`,
                  transition: "width .35s ease, background .3s ease",
                }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: visibilityValid ? "#16A34A" : MID, whiteSpace: "nowrap" }}>
                {visibilityAnsweredCount}/{VISIBILITY_ITEMS.length} dijawab
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {VISIBILITY_ITEMS.map((item) => (
                <VisibilityRow key={item.key} item={item} value={vis[item.key]} onChange={(v) => setVisItem(item.key, v)}
                  error={attemptedV && vis[item.key] === null} />
              ))}
            </div>
          </SectionCard>
        )}

        {step === 3 && (
          <SectionCard icon={<Search size={17} color="#fff" />} title="Cek Availability Produk" subtitle="Jumlah varian tiap produk">
            {Object.entries(
              AVAILABILITY_ITEMS.reduce((acc, item) => {
                (acc[item.group] = acc[item.group] || []).push(item);
                return acc;
              }, {})
            ).map(([group, items], gi) => {
              const meta = AVAILABILITY_GROUP_META[group];
              const GroupIcon = meta.icon;
              return (
                // Dibungkus jadi SATU kartu per grup (bukan header lepas +
                // kartu item ngambang) - lebih kerasa "SP ini satu kesatuan,
                // Voucher kesatuan lain" drpd cuma dipisah banner tipis.
                // Pembungkusnya SENGAJA netral (putih/abu2, bukan tinted
                // warna grup) - kalau wrapper-nya ikut berwarna + badge
                // ikon + border kiri tiap item juga berwarna, kesannya jadi
                // kebanyakan warna ("terlalu rame"). Pembeda grup cukup di
                // ikon+teks judul grup aja, cukup jelas tanpa bikin ramai.
                <div key={group} style={{
                  borderRadius: 18, border: `1.5px solid ${BORDER}`, background: "#FBFAFC",
                  padding: 12, marginTop: gi === 0 ? 0 : 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "0 2px" }}>
                    <div style={{
                      flexShrink: 0, width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                      background: meta.color,
                    }}>
                      <GroupIcon size={16} color="#fff" strokeWidth={2.3} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: meta.color, letterSpacing: 0.1 }}>
                      {AVAILABILITY_GROUP_LABEL[group]}
                    </span>
                  </div>
                  {items.map((item, i) => {
                    const [val, setVal] = availabilityState[item.key];
                    return (
                      <div key={item.key} style={{ marginBottom: i === items.length - 1 ? 0 : 10 }}>
                        <AvailabilityRow item={item} value={val} onChange={setVal}
                          error={attempted2 && val === null} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </SectionCard>
        )}

        {step === 4 && (
          <>
            {/* Header halaman polos (BUKAN kartu lagi) - 3 section di
                bawahnya (Data Outlet/Foto Outlet/Availability Produk)
                sekarang masing2 jadi kartu BERDIRI SENDIRI (lihat
                ReviewSection), bukan digabung 1 kartu besar lagi. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "0 2px" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                background: `linear-gradient(145deg, ${PINK} 0%, ${PINK_DK} 100%)`,
                boxShadow: "0 1.5px 3px rgba(20,18,28,0.12), inset 0 1px 0 rgba(255,255,255,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckCircle2 size={17} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: -0.1 }}>Review Data</div>
                <div style={{ fontSize: 11.5, color: MID, marginTop: 2 }}>Pastikan semua sudah benar</div>
              </div>
            </div>
            <ReviewSection icon={<User size={17} color="#fff" />} title="Data Outlet" subtitle="Nama, ID & lokasi outlet" onUbah={() => setStep(0)}>
              {/* SEMUA jadi 1 kartu bertingkat: Nama Outlet -> Social Media
                  (kosong aja kalau gak diisi, BUKAN "-") -> ID Outlet ->
                  badge IM3/3ID -> grid Area/Branch/MC/dst - urutan sesuai
                  permintaan, dibungkus 1 border+shadow yg sama, bukan lagi
                  2 blok terpisah (rows polos di atas + kartu sendiri di
                  bawah). */}
              <>
                <div style={{ padding: "0 0 12px", minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A98A8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>Nama Outlet</div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: INK, wordBreak: "break-word", lineHeight: 1.25 }}>{namaOutlet || "-"}</div>
                  {socialMedia && (
                    <div style={{
                      fontSize: 11.5, color: MID, fontWeight: 600, marginTop: 5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {socialMedia}
                    </div>
                  )}
                </div>
                {(selectedOutlet?.outlet_id_im3 || selectedOutlet?.outlet_id_3id) && (
                  <>
                    {/* Divider di-inset (margin "0 14px", bukan borderTop
                        full-bleed) - konsisten sama divider lain di kartu
                        ini, biar gak nabrak lengkungan sudut kartu yg
                        kelihatan "gak rapi". */}
                    <div style={{ height: 1, background: BORDER, margin: "0 14px" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 14px" }}>
                    {selectedOutlet?.outlet_id_im3 && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: YELLOW, color: "#5C4300" }}>IM3</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_im3}</span>
                      </div>
                    )}
                    {selectedOutlet?.outlet_id_3id && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: PINK_DK, color: "#fff" }}>3ID</span>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{selectedOutlet.outlet_id_3id}</span>
                      </div>
                    )}
                  </div>
                  </>
                )}
                {(selectedOutlet?.outlet_id_im3 || selectedOutlet?.outlet_id_3id) && (selectedOutlet?.area || selectedOutlet?.branch || selectedOutlet?.mc || selectedOutlet?.city || selectedOutlet?.district || selectedOutlet?.village) && (
                  <div style={{ height: 1, background: BORDER, margin: "0 14px" }} />
                )}
                {/* Grid 2 kolom label magenta (OutletInfoItem) - komponen yg
                    SAMA PERSIS dgn kartu konfirmasi di step Data Outlet,
                    biar visualnya konsisten antara step 1 & step Review ini. */}
                {(selectedOutlet?.area || selectedOutlet?.branch || selectedOutlet?.mc || selectedOutlet?.city || selectedOutlet?.district || selectedOutlet?.village) && (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "12px 12px", padding: "14px" }}>
                    {selectedOutlet?.area && <OutletInfoItem label="Area" value={selectedOutlet.area} />}
                    {selectedOutlet?.city && <OutletInfoItem label="Kota/Kabupaten" value={selectedOutlet.city} />}
                    {selectedOutlet?.branch && <OutletInfoItem label="Branch" value={selectedOutlet.branch} />}
                    {selectedOutlet?.district && <OutletInfoItem label="Kecamatan" value={selectedOutlet.district} />}
                    {selectedOutlet?.mc && <OutletInfoItem label="MC" value={selectedOutlet.mc} />}
                    {selectedOutlet?.village && <OutletInfoItem label="Desa" value={selectedOutlet.village} />}
                  </div>
                )}
              </>
            </ReviewSection>

            <ReviewSection icon={<ImageIcon size={17} color="#fff" />} title="Foto Outlet" subtitle={`${etalaseCount + (tapakFile ? 1 : 0)}/4 foto`} onUbah={() => setStep(1)}>
              {/* Dibungkus 1 kartu (konsisten sama section Data Outlet) +
                  SEMUA foto (etalase maks 3 + tampak depan maks 1 = maks 4)
                  digabung jadi SATU baris flex, bukan 2 blok bertumpuk lagi
                  - biar gak banyak scroll ke bawah. */}
                <div style={{ display: "flex", gap: 7 }}>
                  {[
                    ...etalaseFiles.filter(Boolean).map((f, i) => ({ f, label: `Etalase ${i + 1}`, urls: etalaseFiles.filter(Boolean).map((x) => URL.createObjectURL(x)), index: i })),
                    ...(tapakFile ? [{ f: tapakFile, label: "Tampak Depan", urls: [URL.createObjectURL(tapakFile)], index: 0 }] : []),
                  ].map((p, i) => (
                    <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(p.f)} alt=""
                        onClick={() => setReviewLightbox({ urls: p.urls, index: p.index })}
                        style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}`, cursor: "zoom-in", display: "block" }} />
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#9A98A8", textAlign: "center", marginTop: 4 }}>{p.label}</div>
                    </div>
                  ))}
                </div>
            </ReviewSection>

            <ReviewSection icon={<Eye size={17} color="#fff" />} title="Visibility Outlet" subtitle="Ada / tidak ada di outlet" onUbah={() => setStep(2)}>
              <div style={{ borderRadius: 12, background: "#FBFAFC", border: `1px solid ${BORDER}`, padding: "8px 10px" }}>
                {VISIBILITY_ITEMS.map((item, i) => {
                  const val = vis[item.key];
                  const ada = val === 1;
                  const Icon = item.icon;
                  return (
                    <div key={item.key} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                      borderTop: i > 0 ? `1px solid ${BORDER}` : "none", fontSize: 12,
                    }}>
                      <span style={{
                        flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                        background: val === null ? "#C8C5D0" : ada ? VIS_YES.solid : VIS_NO.solid,
                      }}>
                        <Icon size={13} color="#fff" strokeWidth={2.2} />
                      </span>
                      <span style={{ color: INK, flex: 1, fontWeight: 500 }}>{item.label}</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                        fontSize: 10.5, fontWeight: 800, padding: "3px 9px 3px 7px", borderRadius: 999,
                        background: val === null ? "rgba(120,116,133,0.12)" : ada ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.1)",
                        color: val === null ? MID : ada ? "#15803D" : "#B91C1C",
                      }}>
                        {val === null ? "-" : ada ? <Check size={11} strokeWidth={3.2} /> : <X size={11} strokeWidth={3.2} />}
                        {val === null ? "" : ada ? "Ada" : "Tidak Ada"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ReviewSection>

            <ReviewSection icon={<Search size={17} color="#fff" />} title="Availability Produk" subtitle="Jumlah varian tiap produk" onUbah={() => setStep(3)}>
              {/* Dibungkus 1 kartu luar (konsisten sama 2 section di atas) -
                  grup SP/Voucher di dalamnya tetap kebedain lewat box+warna
                  masing2 spt sebelumnya. */}
              {Object.entries(
                AVAILABILITY_ITEMS.reduce((acc, item) => {
                  (acc[item.group] = acc[item.group] || []).push(item);
                  return acc;
                }, {})
              ).map(([group, items], gi) => {
                const groupMeta = AVAILABILITY_GROUP_META[group];
                const GroupIcon = groupMeta.icon;
                return (
                <div key={group} style={{
                  borderRadius: 12, background: "#FBFAFC", border: `1px solid ${BORDER}`,
                  padding: "8px 10px", marginTop: gi === 0 ? 0 : 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <GroupIcon size={12} color={groupMeta.color} strokeWidth={2.4} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: groupMeta.color, letterSpacing: 0.2 }}>
                      {AVAILABILITY_GROUP_LABEL[group]}
                    </span>
                  </div>
                  {items.map((item, i) => {
                    const [val] = availabilityState[item.key];
                    return (
                      <div key={item.key} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                        borderTop: i > 0 ? `1px solid ${BORDER}` : "none",
                        fontSize: 12,
                      }}>
                        <span style={{
                          flexShrink: 0, width: 24, height: 24, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                          background: item.brand === "im3" ? YELLOW : `linear-gradient(135deg, ${PINK}, ${PINK_DK})`,
                        }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.brand === "im3" ? "/brand/logo-im3.png" : "/brand/logo-3id.png"}
                            alt={item.brand === "im3" ? "IM3" : "3ID"}
                            style={{
                              width: 14, height: 14, objectFit: "contain", display: "block",
                              filter: item.brand === "3id" ? "brightness(0) invert(1)" : "none",
                            }}
                          />
                        </span>
                        <span style={{ color: INK, flex: 1, fontWeight: 500 }}>{item.label}</span>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 10.5, fontWeight: 800, padding: "3px 9px 3px 7px", borderRadius: 999, flexShrink: 0,
                          background: "rgba(236,11,111,0.1)", color: PINK_DK,
                        }}>
                          {val ?? "-"} varian
                        </span>
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </ReviewSection>

            {err && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "11px 13px", borderRadius: 11, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)" }}>
                <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: "#DC2626" }}>{err}</div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomBar hidden={kbOpen}>
        {step > 0 && <GhostBtn onClick={() => setStep((s) => s - 1)}><ChevronLeft size={16} /> Kembali</GhostBtn>}
        {step === 0 && (
          <PrimaryBtn onClick={goNextFromData}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 1 && (
          <PrimaryBtn onClick={goNextFromFoto}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 2 && (
          <PrimaryBtn onClick={goNextFromVisibility}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 3 && (
          <PrimaryBtn onClick={goNextFromAvailability}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 4 && (
          <PrimaryBtn onClick={submit} disabled={submitting}>
            {submitting ? (<><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> {progressMsg || "Mengirim..."}</>) : (<><Send size={15} /> Kirim Data</>)}
          </PrimaryBtn>
        )}
      </BottomBar>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {reviewLightbox && (
        <div onClick={() => setReviewLightbox(null)} style={{
          position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out",
        }}>
          <button onClick={() => setReviewLightbox(null)} aria-label="Tutup"
            style={{
              position: "absolute", top: "calc(14px + env(safe-area-inset-top))", right: 16, width: 38, height: 38, borderRadius: "50%",
              border: "none", background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 1,
            }}>
            <X size={20} color="#fff" />
          </button>

          {reviewLightbox.urls.length > 1 && (
            <>
              {/* Tombol panah - disabled (bukan disembunyikan) di ujung
                  biar user tetap paham ini foto pertama/terakhir. */}
              <button
                onClick={(e) => { e.stopPropagation(); setReviewLightbox((v) => ({ ...v, index: Math.max(0, v.index - 1) })); }}
                disabled={reviewLightbox.index === 0}
                aria-label="Foto sebelumnya"
                style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%",
                  border: "none", background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: reviewLightbox.index === 0 ? "default" : "pointer", opacity: reviewLightbox.index === 0 ? 0.3 : 1, zIndex: 1,
                }}>
                <ChevronLeft size={22} color="#fff" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setReviewLightbox((v) => ({ ...v, index: Math.min(v.urls.length - 1, v.index + 1) })); }}
                disabled={reviewLightbox.index === reviewLightbox.urls.length - 1}
                aria-label="Foto berikutnya"
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%",
                  border: "none", background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: reviewLightbox.index === reviewLightbox.urls.length - 1 ? "default" : "pointer",
                  opacity: reviewLightbox.index === reviewLightbox.urls.length - 1 ? 0.3 : 1, zIndex: 1,
                }}>
                <ChevronRight size={22} color="#fff" />
              </button>
              <div style={{
                position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)",
                display: "flex", gap: 6, zIndex: 1,
              }}>
                {reviewLightbox.urls.map((_, i) => (
                  <span key={i} style={{
                    width: i === reviewLightbox.index ? 16 : 6, height: 6, borderRadius: 999,
                    background: i === reviewLightbox.index ? "#fff" : "rgba(255,255,255,0.4)", transition: "width .2s ease, background .2s ease",
                  }} />
                ))}
              </div>
            </>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reviewLightbox.urls[reviewLightbox.index]} alt=""
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => { reviewLightboxDrag.current.startX = e.clientX; }}
            onPointerUp={(e) => {
              const dx = e.clientX - reviewLightboxDrag.current.startX;
              if (Math.abs(dx) < 40) return; // tap biasa, bukan swipe
              if (dx < 0) setReviewLightbox((v) => (v.index < v.urls.length - 1 ? { ...v, index: v.index + 1 } : v));
              else setReviewLightbox((v) => (v.index > 0 ? { ...v, index: v.index - 1 } : v));
            }}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, touchAction: "pan-y" }}
          />
        </div>
      )}

      {/* Panduan manual "Add to Home Screen" utk iOS Safari - lihat
          komentar lengkap di showInstallButton. Sama pola persis dgn
          app/martahub/m/login/page.jsx. */}
      {showIOSGuide && (
        <div onClick={() => setShowIOSGuide(false)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FONT }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(20,18,28,0.55)" }} />
          <div onClick={(e) => e.stopPropagation()} className="ao-wrap" style={{
            position: "relative", width: "100%", boxSizing: "border-box",
            background: "#fff", borderRadius: "22px 22px 0 0",
            padding: "22px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
            boxShadow: "0 -10px 32px rgba(17,17,20,0.16)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>Pasang Pendataan Outlet di Layar Utama</div>
              <button onClick={() => setShowIOSGuide(false)} style={{ background: "none", border: "none", cursor: "pointer", color: MID, padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: MID, lineHeight: 1.5 }}>
              Safari di iPhone/iPad tidak mengizinkan instal otomatis - ikuti 2 langkah ini:
            </div>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "#F6F7F9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: INK }}>1</div>
              <div style={{ fontSize: 13, color: INK, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Tap ikon <Share size={15} style={{ display: "inline" }} /> <b>Share/Bagikan</b> di bar Safari
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "#F6F7F9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: INK }}>2</div>
              <div style={{ fontSize: 13, color: INK, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                Pilih <PlusSquare size={15} style={{ display: "inline" }} /> <b>Add to Home Screen</b>
              </div>
            </div>
            <button onClick={() => setShowIOSGuide(false)}
              style={{ marginTop: 22, width: "100%", height: 48, borderRadius: 14, border: "none", background: INK, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewSection({ icon, title, subtitle, onUbah, children }) {
  // Sekarang kartu BERDIRI SENDIRI (border+radius+shadow+padding persis
  // SectionCard) - bukan lagi 1 section di dalam 1 kartu besar gabungan.
  // Header (badge ikon + judul + subtitle + tombol Ubah) ikut DI DALAM
  // kartu yg sama, jadi "Data Outlet"/"Foto Outlet"/"Availability Produk"
  // masing2 jadi kartu-nya sendiri yg rapi dan utuh.
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16, marginBottom: 14,
      boxShadow: "0 2px 4px rgba(20,18,28,0.02), 0 10px 28px rgba(20,18,28,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 12, flexShrink: 0, position: "relative", overflow: "hidden",
          background: `linear-gradient(145deg, ${PINK} 0%, ${PINK_DK} 100%)`,
          boxShadow: "0 1.5px 3px rgba(20,18,28,0.12), inset 0 1px 0 rgba(255,255,255,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: INK, letterSpacing: -0.1, lineHeight: 1.25 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: MID, marginTop: 1, lineHeight: 1.3 }}>{subtitle}</div>}
        </div>
        <button onClick={onUbah} style={{
          border: "none", background: "rgba(236,11,111,0.08)", borderRadius: 999,
          color: PINK_DK, fontSize: 11.5, fontWeight: 800, padding: "6px 12px",
          display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flexShrink: 0,
        }}>
          <Pencil size={11} /> Ubah
        </button>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, last, blankIfEmpty }) {
  // blankIfEmpty - khusus field opsional (mis. Social Media): kalau
  // kosong, kolom kanan dibiarkan kosong beneran (bukan tanda "-"), krn
  // "-" di situ kesannya kayak field wajib yg kelupaan diisi.
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
      padding: "6px 0", borderBottom: last ? "none" : `1px solid ${BORDER}`, fontSize: 12.5,
    }}>
      <div style={{ color: "#8A8795", flexShrink: 0 }}>{label}</div>
      <div style={{ color: INK, fontWeight: 700, textAlign: "right" }}>{value || (blankIfEmpty ? "" : "-")}</div>
    </div>
  );
}
