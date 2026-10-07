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
  AlertTriangle, AtSign, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Image as ImageIcon, Loader2, MapPin, Pencil, ScanBarcode, Search, Send, Store, User, X,
} from "lucide-react";
import { aoCreateSubmission, aoListOutlets, aoListReferencePhotos, aoUploadPhoto } from "../../../../lib/ao";

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
  { key: "availability", label: "Availability" },
  { key: "review", label: "Review & Kirim" },
];

// 4 parameter availability (sesuai mockup "Cek Availability Produk") - key
// dipakai jadi nama state DAN dikirim ke ao_create_submission (spIm3/sp3id/
// voucherIm3/voucher3id).
const AVAILABILITY_ITEMS = [
  { key: "spIm3", brand: "im3", no: 1, group: "sp", label: "Varian SP IM3 ≥ 2?", desc: "Contoh: Freedom, IM3, Yellow." },
  { key: "sp3id", brand: "3id", no: 2, group: "sp", label: "Varian SP 3ID ≥ 2?", desc: "Contoh: AlwaysOn, Happy, AON." },
  { key: "voucherIm3", brand: "im3", no: 3, group: "voucher", label: "Varian Voucher IM3 ≥ 3?", desc: "Contoh: 5K, 10K, 25K, 50K." },
  { key: "voucher3id", brand: "3id", no: 4, group: "voucher", label: "Varian Voucher 3ID ≥ 3?", desc: "Contoh: 5K, 10K, 20K, 50K." },
];
const AVAILABILITY_GROUP_LABEL = { sp: "Starter Pack (SP)", voucher: "Voucher / Isi Ulang" };

function Stepper({ step, onStepClick }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "26px 18px 22px" }}>
      {STEPS.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
          {/* Seluruh step bisa diklik (bukan cuma dekoratif) - mundur ke
              step yg udah dilewati selalu boleh; maju cuma kepanggil kalau
              step2 mandatory sebelumnya sudah lengkap (lihat goToStep). */}
          <button onClick={() => onStepClick?.(i)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
            border: "none", background: "transparent", padding: 0, cursor: onStepClick ? "pointer" : "default", fontFamily: FONT,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, fontFamily: FONT, flexShrink: 0,
              background: i <= step ? PINK : "#EFEDF4",
              color: i <= step ? "#fff" : "#9A98A8",
              boxShadow: i === step ? `0 0 0 4px rgba(236,11,111,0.14)` : "none",
              transition: "background .35s ease, box-shadow .35s ease",
            }}>
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <div style={{
              fontSize: 10.5, fontWeight: i === step ? 800 : 700, color: i <= step ? INK : "#AFADBD",
              whiteSpace: "nowrap", textAlign: "center", transition: "color .35s ease",
            }}>{s.label}</div>
          </button>
          {i < STEPS.length - 1 && (
            // Track abu2 statis + bar isi (PINK) yg width-nya dianimasikan
            // 0%<->100% - "terisi perlahan" waktu Selanjutnya, "ngurang"
            // waktu Kembali, krn DOM node-nya sama (key stabil per step)
            // jadi transition CSS-nya jalan dua arah, bukan cuma pas isi.
            <div style={{ flex: 1, height: 3, marginTop: 12.5, borderRadius: 2, background: "#EFEDF4", position: "relative", overflow: "hidden" }}>
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
    <div style={{
      // padding-top dipadukan env(safe-area-inset-top) - gradient (wrapper
      // pembungkus di pemanggil) jadi ikut menutup sampai belakang notch/
      // status bar iOS, bukan berhenti kelihatan putih di atasnya lagi.
      padding: "calc(24px + env(safe-area-inset-top)) 18px 10px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ flex: 1 }}>{title}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/audit-outlet/indosat-logo-white.png" alt="Indosat Ooredoo Hutchison" style={{ height: 58, width: "auto", display: "block", flexShrink: 0 }} />
    </div>
  );
}

/** Judul header dua baris: label kecil regular + nama kompetisi bold,
 * dipakai di halaman isi form Pendataan Outlet (brief "Form Pendaftaran
 * North Sumatra Retail Competition" - bold + regular, rapi). */
function HeaderTitle() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: 0.6, textTransform: "uppercase" }}>
        Form Pendaftaran
      </span>
      <span style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: 0.1 }}>
        NSA Retail Competition
      </span>
    </div>
  );
}

function SectionCard({ icon, title, badge, children }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18, marginBottom: 16,
      boxShadow: "0 2px 4px rgba(20,18,28,0.02), 0 10px 28px rgba(20,18,28,0.05)",
    }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
          {icon && (
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              background: `linear-gradient(135deg, rgba(236,11,111,0.14), rgba(247,148,29,0.12))`,
              border: "1px solid rgba(236,11,111,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {icon}
            </div>
          )}
          <div style={{ flex: 1, fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: -0.1 }}>{title}</div>
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

function Field({ label, required, optional, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: INK, marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: PINK }}> *</span>}
        {optional && <span style={{ fontWeight: 400, color: MID }}> (Opsional)</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 11,
  border: `1.5px solid ${BORDER}`, fontSize: 16, fontFamily: FONT, outline: "none", background: "#FAFAFC",
};

function BottomBar({ children }) {
  return (
    <div style={{
      position: "sticky", bottom: 0, background: "#fff", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10,
      padding: "16px 20px calc(16px + env(safe-area-inset-bottom))",
    }}>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, full }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
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
    <button onClick={onClick} style={{
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
      <div style={{ fontSize: 9.5, color: PINK_DK, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 12.5, color: INK, fontWeight: 500, wordBreak: "break-word", lineHeight: 1.3 }}>{value || "-"}</div>
    </div>
  );
}

// ── Chip status GPS (auto-capture, bukan input manual) ─────────────────────
function GpsChip({ lat, lng, locating, error, onRetry }) {
  if (locating) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 11, background: "#F7F6FA", border: `1px solid ${BORDER}`, marginBottom: 14, fontSize: 12 }}>
        <Loader2 size={14} color={MID} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
        <span style={{ color: MID, fontWeight: 600 }}>Mengambil lokasi GPS...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 11, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.18)", marginBottom: 14 }}>
        <MapPin size={14} color="#DC2626" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: "#DC2626", fontWeight: 600, flex: 1 }}>{error}</span>
        <button onClick={onRetry} style={{ border: "none", background: "transparent", color: "#DC2626", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>Coba lagi</button>
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
function PhotoGuide({ title, desc, dos, donts, refs, onCapture }) {
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
          <div style={{
            position: "relative", width: "100%", maxWidth: 480, height: "min(99vh, 800px)", background: "#fff",
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {refs.salah.map((r) => (
                    <div key={r.urutan}>
                      <div style={{ position: "relative" }}>
                        <img src={r.url} alt="" onClick={() => setLightbox(r.url)} style={{ width: "100%", aspectRatio: "0.85", objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}`, cursor: "zoom-in" }} />
                        <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(220,38,38,0.92)", borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <X size={11} color="#fff" />
                        </div>
                      </div>
                      {r.label && <div style={{ fontSize: 11.5, color: INK, fontWeight: 500, marginTop: 4, lineHeight: 1.25 }}>{r.label}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {donts.map((d, i) => (
                    <div key={i}>
                      <div style={{
                        position: "relative", aspectRatio: "0.85", borderRadius: 10, border: `1.5px dashed ${BORDER}`, background: "#FAFAFC",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <ImageIcon size={20} color={MID} />
                        <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(220,38,38,0.92)", borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <X size={11} color="#fff" />
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: INK, fontWeight: 500, marginTop: 4, lineHeight: 1.25 }}>{d}</div>
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
function AvailabilityCheck({ label, checked, onClick, tone = "pink" }) {
  // "Ya" dikasih tone hijau (produk tersedia = positif), "Tidak" tetap
  // merah (senada sama tint kartu & progress bar yg udah pakai hijau/merah
  // yg sama utk makna ini) - bukan pink generik lagi.
  const toneColor = tone === "green" ? "#16A34A" : tone === "red" ? "#DC2626" : PINK;
  const toneColorDk = tone === "green" ? "#128037" : tone === "red" ? "#B91C1C" : PINK_DK;
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, border: "none", background: "transparent",
      cursor: "pointer", padding: "3px 2px", fontFamily: FONT,
      // outline:none - browser nampilin outline fokus biru default begitu
      // tombol di-tap (nempel keliatan terus di mobile, bukan cuma pas
      // navigasi keyboard) - dimatikan total sesuai permintaan, tanpa
      // pengganti ring apapun.
      outline: "none",
    }}>
      <span style={{
        flexShrink: 0, width: 19, height: 19, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${checked ? toneColor : "#D9D6E0"}`,
        background: checked ? `linear-gradient(135deg, ${toneColor}, ${toneColorDk})` : "#fff",
        boxShadow: checked ? `0 2px 5px ${tone === "green" ? "rgba(22,163,74,0.3)" : tone === "red" ? "rgba(220,38,38,0.3)" : "rgba(236,11,111,0.3)"}` : "none",
        transition: "background .15s ease, border-color .15s ease, box-shadow .15s ease",
      }}>
        {checked && <Check size={12} color="#fff" strokeWidth={3.2} />}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: checked ? INK : "#9A98A8" }}>{label}</span>
    </button>
  );
}

function AvailabilityRow({ item, value, onChange, error }) {
  const cardBg = value === true ? "rgba(22,163,74,0.045)" : value === false ? "rgba(220,38,38,0.035)" : "#fff";
  const cardBorder = error ? "#DC2626" : value === true ? "rgba(22,163,74,0.3)" : value === false ? "rgba(220,38,38,0.25)" : BORDER;
  return (
    <div style={{
      borderRadius: 16, border: `1.5px solid ${cardBorder}`, background: cardBg, padding: 15, marginBottom: 12,
      boxShadow: value !== null ? "0 2px 8px rgba(20,18,28,0.04)" : "0 1px 3px rgba(20,18,28,0.03)",
      transition: "background .25s ease, border-color .25s ease, box-shadow .25s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          flexShrink: 0, width: 52, height: 52, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center",
          background: item.brand === "im3" ? YELLOW : `linear-gradient(135deg, ${PINK}, ${PINK_DK})`,
          boxShadow: "0 3px 8px rgba(20,18,28,0.1)",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.brand === "im3" ? "/brand/logo-im3.png" : "/brand/logo-3id.png"}
            alt={item.brand === "im3" ? "IM3" : "3ID"}
            style={{
              width: 34, height: 34, objectFit: "contain", display: "block",
              // Aset logo-3id.png warnanya hitam solid (bukan putih) - di-invert
              // jadi putih biar kontras di atas background magenta, sesuai
              // tampilan resmi logo Tri/3ID (putih di atas magenta).
              ...(item.brand !== "im3" ? { filter: "brightness(0) invert(1)" } : {}),
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, lineHeight: 1.3 }}>{item.label}</div>
          <div style={{ fontSize: 11.5, color: MID, marginTop: 3, lineHeight: 1.4 }}>{item.desc}</div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 7 }}>
          <AvailabilityCheck label="Ya" tone="green" checked={value === true} onClick={() => onChange(true)} />
          <AvailabilityCheck label="Tidak" tone="red" checked={value === false} onClick={() => onChange(false)} />
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 700, marginTop: 10 }}>Wajib dijawab sebelum lanjut</div>
      )}
    </div>
  );
}

const OUTLET_RESULTS_CAP = 60; // batasi baris yg DI-RENDER - dgn ~16rb
// outlet, nge-render SEMUA hasil kosong/query pendek bikin DOM berat &
// kerasa lemot. Query tetap jalan ke semua data, cuma tampilannya dibatasi.

// ── Dropdown "Pilih ID Outlet" (cari + pilih dari whitelist) ───────────────
function OutletPicker({ outlets, loading, loaded, value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Debounce 120ms - tanpa ini, tiap keystroke langsung filter ulang ~16rb
  // baris x 4 field SAAT user masih ngetik, numpuk kerjaan render per huruf
  // & bikin input kerasa "lag". Field input tetap pakai `q` (responsif),
  // cuma filtering yg nunggu jeda ketikan.
  const [qDebounced, setQDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 120);
    return () => clearTimeout(id);
  }, [q]);

  // Peta id_outlet -> outlet (O(1)) + field pencarian sudah di-lowercase
  // SEKALI per outlet (bukan per keystroke) - index ini cuma dihitung ulang
  // kalau `outlets` referensinya berubah (selesai loading / reload), bukan
  // tiap kali user ngetik.
  const index = useMemo(() => {
    const byId = new Map();
    const searchable = outlets.map((o) => {
      byId.set(o.id_outlet, o);
      return { o, s: [o.id_outlet, o.outlet_id_im3, o.outlet_id_3id, o.nama_outlet].filter(Boolean).join(" • ").toLowerCase() };
    });
    return { byId, searchable };
  }, [outlets]);

  const selected = index.byId.get(value);
  const matches = useMemo(() => {
    const s = qDebounced.trim().toLowerCase();
    return s ? index.searchable.filter((x) => x.s.includes(s)) : index.searchable;
  }, [index, qDebounced]);
  const filtered = useMemo(() => matches.slice(0, OUTLET_RESULTS_CAP).map((x) => x.o), [matches]);
  const totalMatches = matches.length;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        ...inputStyle, paddingLeft: 36, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
        color: selected ? INK : "#9A98A8", borderColor: error ? "#DC2626" : BORDER, position: "relative",
      }}>
        <ScanBarcode size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {selected ? selected.id_outlet : "Pilih ID Outlet"}
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
            position: "fixed", inset: 0, zIndex: 50, background: "#fff",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "calc(12px + env(safe-area-inset-top)) 14px 12px",
              borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
            }}>
              <button onClick={() => { setOpen(false); setQ(""); }} aria-label="Tutup"
                style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "#F4F3F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}>
                <ChevronLeft size={19} color={INK} />
              </button>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={15} color={MID} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID Outlet, nama, cabang..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px 11px 34px", borderRadius: 11, border: `1.5px solid ${BORDER}`, fontSize: 16, fontFamily: FONT, outline: "none", background: "#FAFAFC" }} />
                {q && (
                  <button onClick={() => setQ("")} aria-label="Hapus pencarian"
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", border: "none", background: BORDER, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={12} color={MID} />
                  </button>
                )}
              </div>
            </div>
            {loading && outlets.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#FCEAEE", borderBottom: `1px solid ${BORDER}` }}>
                <Loader2 size={12} color={PINK} style={{ animation: "spin .8s linear infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: PINK_DK, fontWeight: 700, flex: 1 }}>
                  Masih memuat ({loaded.toLocaleString("id-ID")} outlet) - hasil bisa belum lengkap
                </span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {loading && outlets.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "34px 16px" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", border: `3px solid ${BORDER}`, borderTopColor: PINK,
                    animation: "spin .8s linear infinite",
                  }} />
                  <div style={{ fontSize: 12.5, color: MID, fontWeight: 600 }}>Menyiapkan daftar outlet...</div>
                  <div style={{ fontSize: 11, color: "#B2AFC2" }}>{loaded.toLocaleString("id-ID")} outlet dimuat</div>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 16, textAlign: "center", fontSize: 12.5, color: MID }}>
                  {loading ? "Mencari di outlet yang sudah dimuat..." : "Tidak ditemukan"}
                </div>
              ) : filtered.map((o, i) => {
                const isSelected = o.id_outlet === value;
                return (
                  <button key={`${o.id || o.id_outlet || "row"}-${i}`} onClick={() => { onChange(o.id_outlet); setOpen(false); setQ(""); }} style={{
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
              {totalMatches > OUTLET_RESULTS_CAP && (
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

function PhotoSlot({ file, label, onPick, onRemove, disabled, error }) {
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
  return (
    <label style={{
      aspectRatio: "1", borderRadius: 15, border: `1.5px dashed ${error ? "#DC2626" : "#D8B9C9"}`, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer",
      background: error ? "rgba(220,38,38,0.04)" : "linear-gradient(145deg, #FFF9FB 0%, #FEF6FA 55%, #FDF3F8 100%)",
      transition: "border-color .15s ease, background .15s ease",
    }}>
      <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={disabled} style={{ display: "none" }} />
      <div style={{
        width: 34, height: 34, borderRadius: "50%", background: "#fff",
        border: `1px solid ${error ? "rgba(220,38,38,0.25)" : "rgba(236,11,111,0.18)"}`,
        boxShadow: "0 3px 8px rgba(20,18,28,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Camera size={16} color={error ? "#DC2626" : PINK} />
      </div>
      <span style={{ fontSize: 10.5, color: error ? "#DC2626" : "#8A7E8F", fontWeight: 700, textAlign: "center", padding: "0 6px" }}>{label}</span>
    </label>
  );
}

export default function AuditOutletFormPage() {
  const [step, setStep] = useState(0); // 0=Data Outlet, 1=Foto Outlet, 2=Review, 3=Konfirmasi(terpisah)
  const [done, setDone] = useState(false);
  const [doneAt, setDoneAt] = useState(null);

  const [outlets, setOutlets] = useState([]);
  const [outletsLoading, setOutletsLoading] = useState(true);
  const [outletsLoaded, setOutletsLoaded] = useState(0);
  // Whitelist outlet bisa belasan ribu baris (~16rb) - RPC ao_list_outlets
  // DIBATASI p_limit (default cuma 100/panggilan), jadi WAJIB di-paging
  // habis di sini (sama pola dgn OutletMasterBody CMS di
  // app/martahub/pendataan-outlet/page.jsx) sebelum dipakai utk pencarian,
  // kalau tidak search cuma akan "melihat" 100 outlet pertama & sender yg
  // outlet-nya bukan di 100 itu tidak akan pernah ketemu.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const PAGE = 1000;
        const seen = new Set();
        let all = [];
        for (let off = 0; off < 200000; off += PAGE) {
          const list = await aoListOutlets({ limit: PAGE, offset: off });
          // Dedupe by id - lapis pertahanan kedua kalau ordering RPC-nya
          // suatu saat tidak stabil lagi (lihat catatan di ao_list_outlets):
          // tanpa ini baris yg ke-load dobel di 2 halaman bikin React
          // "duplicate key" & list rusak.
          for (const o of list) { if (!seen.has(o.id)) { seen.add(o.id); all.push(o); } }
          if (!alive) return;
          setOutletsLoaded(all.length);
          if (list.length < PAGE) break;
        }
        if (alive) setOutlets(all.filter((o) => o.active));
      } finally { if (alive) setOutletsLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Foto referensi (contoh benar/salah) yg diupload admin CMS - dipakai
  // PhotoGuide dibawah supaya Panduan Foto menampilkan foto asli, bukan
  // cuma teks. Kalau belum ada yg diupload (slot kosong), PhotoGuide jatuh
  // balik ke daftar teks dos/donts seperti sebelumnya.
  const [refPhotos, setRefPhotos] = useState([]);
  useEffect(() => {
    let alive = true;
    aoListReferencePhotos().then((rows) => { if (alive) setRefPhotos(rows); }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
  const etalaseCaptureRef = useRef(null);
  const tapakCaptureRef = useRef(null);
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

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsError("Browser ini tidak mendukung GPS."); return; }
    setGpsLocating(true); setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setGpsLocating(false); },
      () => { setGpsError("Gagal mengambil lokasi. Pastikan izin lokasi diaktifkan."); setGpsLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  // Dicoba sekali otomatis saat form dibuka - supaya sender tidak perlu tap
  // apa2, cukup izinkan permission browser saat diminta.
  useEffect(() => { captureGps(); }, []);

  // 4 jawaban availability (step "Cek Availability Produk" di mockup) -
  // null = belum dijawab (dibedakan dari false/"Tidak").
  const [spIm3, setSpIm3] = useState(null);
  const [sp3id, setSp3id] = useState(null);
  const [voucherIm3, setVoucherIm3] = useState(null);
  const [voucher3id, setVoucher3id] = useState(null);
  const availabilityState = { spIm3: [spIm3, setSpIm3], sp3id: [sp3id, setSp3id], voucherIm3: [voucherIm3, setVoucherIm3], voucher3id: [voucher3id, setVoucher3id] };

  const [submitting, setSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [err, setErr] = useState("");
  const [attempted0, setAttempted0] = useState(false); // true setelah "Selanjutnya" step Data Outlet ditekan - baru di sini field kosong ditandai merah
  const [attempted1, setAttempted1] = useState(false); // sama utk step Foto Outlet
  const [attempted2, setAttempted2] = useState(false); // sama utk step Availability

  // Nama Outlet SEKARANG murni freetext dari sender - TIDAK lagi auto-isi
  // dari nama_outlet (nama desa) hasil pilih ID Outlet, krn nama_outlet di
  // whitelist cuma nama desa, bukan nama outlet sebenarnya.
  const onPickOutlet = (id) => setIdOutlet(id);

  const selectedOutlet = outlets.find((o) => o.id_outlet === idOutlet);
  const dataValid = namaSender.trim() && namaOutlet.trim() && idOutlet.trim();
  const etalaseCount = etalaseFiles.filter(Boolean).length;
  const fotoValid = etalaseCount >= 1 && !!tapakFile;
  const availabilityValid = spIm3 !== null && sp3id !== null && voucherIm3 !== null && voucher3id !== null;
  const availabilityAnsweredCount = [spIm3, sp3id, voucherIm3, voucher3id].filter((v) => v !== null).length;

  // Tombol "Selanjutnya" SELALU bisa diklik ("tombol dibuat bisa diklik") -
  // kalau ada field wajib yg masih kosong, bukan diblok (disabled), tapi
  // field yg kosong itu yg ditandai outline merah supaya user tahu persis
  // apa yg kurang, baru lanjut ke step berikutnya kalau semua sudah lengkap.
  const goNextFromData = () => {
    if (dataValid) { setAttempted0(false); setStep(1); } else { setAttempted0(true); }
  };
  const goNextFromFoto = () => {
    if (fotoValid) { setAttempted1(false); setStep(2); } else { setAttempted1(true); }
  };
  const goNextFromAvailability = () => {
    if (availabilityValid) { setAttempted2(false); setStep(3); } else { setAttempted2(true); }
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
    if (target >= 3 && !availabilityValid) { setAttempted2(true); setStep(2); return; }
    setStep(target);
  };

  const setEtalaseAt = (i, file) => setEtalaseFiles((prev) => { const n = [...prev]; n[i] = file; return n; });

  const startEtalaseCapture = () => {
    if (etalaseFiles.every(Boolean)) return; // 3/3 - jangan buka kamera lagi
    etalaseCaptureRef.current?.click();
  };
  const onEtalaseCaptureChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEtalaseFiles((prev) => {
      const idx = prev.findIndex((x) => !x);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = f;
      // Masih ada slot kosong sisanya -> buka kamera lagi otomatis utk foto
      // berikutnya. Delay kecil supaya UI sempat update & kamera sebelumnya
      // benar2 tertutup dulu (langsung click() lagi di tick yg sama kurang
      // reliable di beberapa mobile browser).
      if (next.some((x) => !x)) {
        setTimeout(() => etalaseCaptureRef.current?.click(), 400);
      }
      return next;
    });
  };

  const startTapakCapture = () => {
    if (tapakFile) return; // sudah ada - jangan buka kamera lagi
    tapakCaptureRef.current?.click();
  };
  const onTapakCaptureChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setTapakFile(f);
  };

  const submit = async () => {
    setSubmitting(true); setErr("");
    try {
      setProgressMsg("Menyimpan data...");
      const submissionId = await aoCreateSubmission({
        namaSender: namaSender.trim(), namaOutlet: namaOutlet.trim(), idOutlet: idOutlet.trim(),
        socialMedia: socialMedia.trim(),
        latitude: gpsLat, longitude: gpsLng,
        spIm3, sp3id, voucherIm3, voucher3id,
      });
      const etalase = etalaseFiles.filter(Boolean);
      for (let i = 0; i < etalase.length; i++) {
        setProgressMsg(`Mengunggah foto etalase ${i + 1}/${etalase.length}...`);
        await aoUploadPhoto(submissionId, "etalase", i + 1, etalase[i]);
      }
      setProgressMsg("Mengunggah foto tampak depan outlet...");
      await aoUploadPhoto(submissionId, "tapak_depan", 1, tapakFile);
      setDoneAt(new Date());
      setDone(true);
    } catch (e) {
      setErr(e?.message || "Gagal mengirim data, coba lagi.");
      setStep(3);
    } finally {
      setSubmitting(false); setProgressMsg("");
    }
  };

  const resetAll = () => {
    setNamaSender(""); setNamaOutlet(""); setIdOutlet(""); setSocialMedia("");
    setEtalaseFiles([null, null, null]); setTapakFile(null);
    setSpIm3(null); setSp3id(null); setVoucherIm3(null); setVoucher3id(null);
    setGpsLat(null); setGpsLng(null); setGpsError("");
    setStep(0); setDone(false); setErr("");
    captureGps();
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center" }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%", background: "linear-gradient(135deg, rgba(236,11,111,0.12), rgba(247,148,29,0.12))",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22, position: "relative",
          }}>
            <Store size={40} color={PINK} />
            <div style={{
              position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: "50%",
              background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff",
            }}>
              <Check size={16} color="#fff" />
            </div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginBottom: 8 }}>Data Outlet<br />Berhasil Dikirim!</div>
          <div style={{ fontSize: 13.5, color: MID, maxWidth: 280, marginBottom: 24 }}>
            Terima kasih, data outlet telah berhasil disimpan dalam sistem.
          </div>
          <div style={{ width: "100%", maxWidth: 320, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, textAlign: "left" }}>
            <SummaryRow label="ID Outlet" value={idOutlet} />
            <SummaryRow label="Nama Outlet" value={namaOutlet} />
            <SummaryRow label="Tanggal" value={doneAt ? doneAt.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""} last />
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <PrimaryBtn onClick={resetAll} full>Isi Outlet Lain</PrimaryBtn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <div style={{ background: BRAND_GRADIENT, position: "sticky", top: 0, zIndex: 30 }}>
        <Header title={<HeaderTitle />} />
        <div style={{ background: "#fff", borderRadius: "22px 22px 0 0", marginTop: 0, boxShadow: "0 -8px 20px rgba(0,0,0,0.06)" }}>
          <Stepper step={step} onStepClick={goToStep} />
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 480, width: "100%", margin: "0 auto", padding: "18px 18px 10px", boxSizing: "border-box" }}>
        {step === 0 && (
          <SectionCard icon={<ClipboardList size={16} color={PINK} />} title="Data Outlet">
            <Field label="Nama Sender" required>
              <div style={{ position: "relative" }}>
                <User size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input style={{ ...inputStyle, paddingLeft: 36, borderColor: attempted0 && !namaSender.trim() ? "#DC2626" : BORDER }}
                  value={namaSender} onChange={(e) => setNamaSender(e.target.value.toUpperCase())} placeholder="Masukkan nama Anda" />
              </div>
            </Field>
            <Field label="Nama Outlet" required>
              <div style={{ position: "relative" }}>
                <Store size={15} color={MID} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                <input style={{ ...inputStyle, paddingLeft: 36, borderColor: attempted0 && !namaOutlet.trim() ? "#DC2626" : BORDER }}
                  value={namaOutlet} onChange={(e) => setNamaOutlet(e.target.value.toUpperCase())} placeholder="Masukkan nama outlet" />
              </div>
            </Field>
            <Field label="ID Outlet" required>
              <OutletPicker outlets={outlets} loading={outletsLoading} loaded={outletsLoaded} value={idOutlet} onChange={onPickOutlet} error={attempted0 && !idOutlet.trim()} />
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, auto)", gridAutoFlow: "column", gap: "12px 12px", padding: "14px", alignItems: "start" }}>
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
                <input style={{ ...inputStyle, paddingLeft: 36 }} value={socialMedia} onChange={(e) => setSocialMedia(e.target.value)} placeholder="Contoh: @namaoutlet, link IG/FB" />
              </div>
            </Field>
          </SectionCard>
        )}

        {step === 1 && (
          <>
            <GpsChip lat={gpsLat} lng={gpsLng} locating={gpsLocating} error={gpsError} onRetry={captureGps} />
            <SectionCard icon={<ImageIcon size={16} color={PINK} />} title="Foto Etalase Outlet" badge="Wajib">
              <div style={{ fontSize: 12, color: MID, marginBottom: 14, marginTop: -8 }}>
                Upload maksimal 3 foto etalase produk yang dijual. <strong>{etalaseCount}/3</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <PhotoSlot key={i} file={etalaseFiles[i]} label={`Tambah Foto ${i + 1}`}
                    onPick={(e) => { const f = e.target.files?.[0]; if (f) setEtalaseAt(i, f); e.target.value = ""; }}
                    onRemove={() => setEtalaseAt(i, null)} error={attempted1 && etalaseCount < 1 && !etalaseFiles[i]} />
                ))}
              </div>
              <PhotoGuide title="Panduan Foto Etalase Outlet" refs={refsFor("etalase")}
                desc="Foto etalase harus jelas dan fokus, mencakup seluruh produk dan materi promosi yang dipajang."
                dos={["Seluruh etalase terlihat jelas", "Produk & materi promosi terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Gelap / blur", "Terhalang orang atau objek lain"]}
                onCapture={startEtalaseCapture} />
              <input ref={etalaseCaptureRef} type="file" accept="image/*" capture="environment" onChange={onEtalaseCaptureChange} style={{ display: "none" }} />
            </SectionCard>
            <SectionCard icon={<Store size={16} color={PINK} />} title="Foto Tampak Depan Outlet" badge="Wajib">
              <div style={{ fontSize: 12, color: MID, marginBottom: 14, marginTop: -8 }}>
                Upload 1 foto tampak depan outlet dengan kondisi lingkungan sekitar.
              </div>
              <div style={{ maxWidth: 150 }}>
                <PhotoSlot file={tapakFile} label="Tambah Foto Tampak Depan Outlet"
                  onPick={(e) => { const f = e.target.files?.[0]; if (f) setTapakFile(f); e.target.value = ""; }}
                  onRemove={() => setTapakFile(null)} error={attempted1 && !tapakFile} />
              </div>
              <PhotoGuide title="Panduan Foto Tampak Depan Outlet" refs={refsFor("tapak_depan")}
                desc="Foto tampak depan harus diambil dari jarak yang cukup, sehingga seluruh fasad toko beserta lingkungan sekitarnya terlihat jelas."
                dos={["Seluruh tampak depan outlet terlihat", "Nama outlet / signage terlihat jelas", "Lingkungan sekitar terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Sudut tidak lengkap (fasad tidak terlihat)", "Gelap / blur"]}
                onCapture={startTapakCapture} />
              <input ref={tapakCaptureRef} type="file" accept="image/*" capture="environment" onChange={onTapakCaptureChange} style={{ display: "none" }} />
            </SectionCard>
          </>
        )}

        {step === 2 && (
          <SectionCard icon={<CheckCircle2 size={16} color={PINK} />} title="Cek Availability Produk">
            <div style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 20, marginTop: -8,
              padding: "12px 14px", borderRadius: 12,
              background: availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "rgba(22,163,74,0.06)" : "#FAFAFC",
              border: `1px solid ${availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "rgba(22,163,74,0.18)" : BORDER}`,
              transition: "background .25s ease, border-color .25s ease",
            }}>
              <div style={{ fontSize: 12.5, color: INK, fontWeight: 500, flex: 1, lineHeight: 1.4 }}>
                Pastikan ketersediaan tiap varian produk berikut di outlet ini.
              </div>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                <span style={{
                  fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
                  color: availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "#16A34A" : PINK_DK,
                }}>
                  {availabilityAnsweredCount}/{AVAILABILITY_ITEMS.length} {availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "Lengkap" : "Terjawab"}
                </span>
                <div style={{ width: 64, height: 6, borderRadius: 999, background: "#E7E5ED", overflow: "hidden" }}>
                  <div style={{
                    width: `${(availabilityAnsweredCount / AVAILABILITY_ITEMS.length) * 100}%`, height: "100%", borderRadius: 999,
                    background: availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "#16A34A" : `linear-gradient(90deg, ${PINK}, ${ORANGE})`,
                    transition: "width .35s cubic-bezier(.4,0,.2,1), background .3s ease",
                  }} />
                </div>
              </div>
            </div>
            {AVAILABILITY_ITEMS.map((item, i) => {
              const [val, setVal] = availabilityState[item.key];
              const showGroupHeader = i === 0 || AVAILABILITY_ITEMS[i - 1].group !== item.group;
              return (
                <div key={item.key}>
                  {showGroupHeader && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 10, marginTop: i === 0 ? 0 : 20,
                    }}>
                      <span style={{ width: 3, height: 13, borderRadius: 999, background: `linear-gradient(180deg, ${PINK}, ${ORANGE})`, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: "#6B6878", textTransform: "uppercase", letterSpacing: 0.6 }}>
                        {AVAILABILITY_GROUP_LABEL[item.group]}
                      </span>
                      <span style={{ flex: 1, height: 1, background: BORDER }} />
                    </div>
                  )}
                  <AvailabilityRow item={item} value={val} onChange={setVal}
                    error={attempted2 && val === null} />
                </div>
              );
            })}
            <div style={{
              display: "flex", gap: 10, alignItems: "flex-start", padding: "13px 14px", borderRadius: 13, marginTop: 6,
              background: "linear-gradient(135deg, rgba(247,148,29,0.08), rgba(247,148,29,0.04))",
              border: "1px solid rgba(247,148,29,0.22)",
            }}>
              <div style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: "rgba(247,148,29,0.16)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={14} color={ORANGE} />
              </div>
              <div style={{ fontSize: 12, color: "#7A5110", lineHeight: 1.5, paddingTop: 2 }}>
                <strong style={{ color: "#5C3D0C" }}>Catatan:</strong> jika salah satu produk tidak tersedia, pastikan outlet mendapat arahan restock sesuai area coverage.
              </div>
            </div>
          </SectionCard>
        )}

        {step === 3 && (
          <>
            <SectionCard icon={<CheckCircle2 size={16} color={PINK} />} title="Review Data">
              <div style={{ fontSize: 12, color: MID, marginBottom: 16, marginTop: -8 }}>Pastikan semua data sudah benar sebelum dikirim.</div>

              <ReviewSection icon={<User size={14} color={PINK} />} title="Data Sender" onUbah={() => setStep(0)}>
                <SummaryRow label="Nama Sender" value={namaSender} last />
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<Store size={14} color={PINK} />} title="Informasi Outlet" onUbah={() => setStep(0)}>
                <SummaryRow label="Nama Outlet" value={namaOutlet} />
                <SummaryRow label="ID Outlet" value={idOutlet} />
                {selectedOutlet?.outlet_id_im3 && <SummaryRow label="ID Outlet IM3" value={selectedOutlet.outlet_id_im3} />}
                {selectedOutlet?.outlet_id_3id && <SummaryRow label="ID Outlet 3ID" value={selectedOutlet.outlet_id_3id} />}
                {selectedOutlet?.area && <SummaryRow label="Area" value={selectedOutlet.area} />}
                {selectedOutlet?.branch && <SummaryRow label="Branch" value={selectedOutlet.branch} />}
                {selectedOutlet?.mc && <SummaryRow label="MC" value={selectedOutlet.mc} />}
                {selectedOutlet?.city && <SummaryRow label="Kota/Kabupaten" value={selectedOutlet.city} />}
                {selectedOutlet?.district && <SummaryRow label="Kecamatan" value={selectedOutlet.district} />}
                {selectedOutlet?.village && <SummaryRow label="Desa" value={selectedOutlet.village} />}
                <SummaryRow label="Social Media" value={socialMedia || "-"} last />
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<ImageIcon size={14} color={PINK} />} title={`Foto Etalase Outlet (${etalaseCount}/3)`} onUbah={() => setStep(1)}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {etalaseFiles.filter(Boolean).map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={URL.createObjectURL(f)} alt=""
                      onClick={() => setReviewLightbox({ urls: etalaseFiles.filter(Boolean).map((x) => URL.createObjectURL(x)), index: i })}
                      style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 11, border: `1px solid ${BORDER}`, boxShadow: "0 2px 6px rgba(20,18,28,0.06)", cursor: "zoom-in" }} />
                  ))}
                </div>
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<Store size={14} color={PINK} />} title={`Foto Tampak Depan Outlet (${tapakFile ? 1 : 0}/1)`} onUbah={() => setStep(1)}>
                {tapakFile && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(tapakFile)} alt="" onClick={() => setReviewLightbox({ urls: [URL.createObjectURL(tapakFile)], index: 0 })}
                    style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 11, border: `1px solid ${BORDER}`, boxShadow: "0 2px 6px rgba(20,18,28,0.06)", marginTop: 10, display: "block", cursor: "zoom-in" }} />
                )}
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<CheckCircle2 size={14} color={PINK} />} title="Availability Produk" onUbah={() => setStep(2)}>
                {AVAILABILITY_ITEMS.map((item, i) => {
                  const [val] = availabilityState[item.key];
                  const showGroupHeader = i === 0 || AVAILABILITY_ITEMS[i - 1].group !== item.group;
                  return (
                    <div key={item.key}>
                      {showGroupHeader && (
                        <div style={{
                          fontSize: 10.5, fontWeight: 800, color: "#9A98A8", textTransform: "uppercase", letterSpacing: 0.5,
                          marginTop: i === 0 ? 0 : 12, marginBottom: 2,
                        }}>
                          {AVAILABILITY_GROUP_LABEL[item.group]}
                        </div>
                      )}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
                        borderBottom: i < AVAILABILITY_ITEMS.length - 1 && AVAILABILITY_ITEMS[i + 1]?.group === item.group ? `1px solid ${BORDER}` : "none",
                        fontSize: 12.5,
                      }}>
                        <span style={{
                          flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2.5px 7px", borderRadius: 999,
                          background: item.brand === "im3" ? YELLOW : PINK_DK, color: item.brand === "im3" ? "#5C4300" : "#fff",
                        }}>
                          {item.brand === "im3" ? "IM3" : "3ID"}
                        </span>
                        <span style={{ color: INK, flex: 1, fontWeight: 500 }}>{item.label.replace(" ?", "").replace("?", "")}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, flexShrink: 0,
                          background: val ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.1)",
                          color: val ? "#16A34A" : "#DC2626",
                        }}>
                          {val ? "Ya" : "Tidak"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </ReviewSection>
            </SectionCard>

            {err && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "11px 13px", borderRadius: 11, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", marginBottom: 16 }}>
                <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: "#DC2626" }}>{err}</div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomBar>
        {step > 0 && <GhostBtn onClick={() => setStep((s) => s - 1)}><ChevronLeft size={16} /> Kembali</GhostBtn>}
        {step === 0 && (
          <PrimaryBtn onClick={goNextFromData}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 1 && (
          <PrimaryBtn onClick={goNextFromFoto}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 2 && (
          <PrimaryBtn onClick={goNextFromAvailability}>Selanjutnya <ChevronRight size={16} /></PrimaryBtn>
        )}
        {step === 3 && (
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
    </div>
  );
}

function ReviewSection({ icon, title, onUbah, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9, flexShrink: 0,
          background: `linear-gradient(135deg, rgba(236,11,111,0.12), rgba(247,148,29,0.1))`,
          border: "1px solid rgba(236,11,111,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: INK, letterSpacing: -0.1 }}>{title}</div>
        <button onClick={onUbah} style={{
          border: "1px solid rgba(236,11,111,0.22)", background: "rgba(236,11,111,0.06)", borderRadius: 999,
          color: PINK_DK, fontSize: 11.5, fontWeight: 800, padding: "5px 10px",
          display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flexShrink: 0,
        }}>
          <Pencil size={11} /> Ubah
        </button>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, last }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline",
      padding: "9px 0", borderBottom: last ? "none" : `1px solid ${BORDER}`, fontSize: 12.5,
    }}>
      <div style={{ color: "#8A8795", flexShrink: 0 }}>{label}</div>
      <div style={{ color: INK, fontWeight: 700, textAlign: "right" }}>{value || "-"}</div>
    </div>
  );
}
