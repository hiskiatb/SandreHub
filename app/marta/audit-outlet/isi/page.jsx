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
  { key: "spIm3", brand: "im3", no: 1, label: "Varian SP IM3 ≥ 2?", desc: "Tersedia minimal 2 varian Starter Pack IM3 (contoh: Freedom, IM3, Yellow)." },
  { key: "sp3id", brand: "3id", no: 2, label: "Varian SP 3ID ≥ 2?", desc: "Tersedia minimal 2 varian Starter Pack 3ID (contoh: AlwaysOn, Happy, AON)." },
  { key: "voucherIm3", brand: "im3", no: 3, label: "Varian Voucher IM3 ≥ 3?", desc: "Tersedia minimal 3 varian voucher / isi ulang IM3 (contoh: 5K, 10K, 25K, 50K)." },
  { key: "voucher3id", brand: "3id", no: 4, label: "Varian Voucher 3ID ≥ 3?", desc: "Tersedia minimal 3 varian voucher / isi ulang 3ID (contoh: 5K, 10K, 20K, 50K)." },
];

function Stepper({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "26px 18px 22px" }}>
      {STEPS.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
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
          </div>
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
    <div style={{ padding: "16px 18px 26px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", flex: 1, marginTop: 10, marginLeft: 6 }}>{title}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/audit-outlet/indosat-logo-white.png" alt="Indosat Ooredoo Hutchison" style={{ height: 68, width: "auto", display: "block", flexShrink: 0 }} />
    </div>
  );
}

function SectionCard({ icon, title, badge, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
          {icon && (
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(236,11,111,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {icon}
            </div>
          )}
          <div style={{ flex: 1, fontSize: 16.5, fontWeight: 800, color: INK }}>{title}</div>
          {badge && (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: PINK_DK, background: "rgba(236,11,111,0.1)", padding: "3px 9px", borderRadius: 7 }}>{badge}</span>
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
  border: `1.5px solid ${BORDER}`, fontSize: 14.5, fontFamily: FONT, outline: "none", background: "#FAFAFC",
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
function PhotoGuide({ title, desc, dos, donts, refs }) {
  const [open, setOpen] = useState(false); // tetap mounted selama animasi tutup jalan
  const [show, setShow] = useState(false); // true = sheet digeser ke posisi terbuka (translateY 0)
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startY: 0, lastY: 0 });
  const closeTimerRef = useRef(null);
  const hasBenarPhoto = !!refs?.benar;
  const hasSalahPhotos = (refs?.salah?.length || 0) > 0;
  const subject = title.replace(/^Panduan\s*/, "");

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
      <button onClick={openSheet} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", border: `1.5px solid ${PINK}`, background: "#fff",
        borderRadius: 11, padding: "10px 12px", cursor: "pointer", fontFamily: FONT,
      }}>
        <Store size={14} color={PINK} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: PINK, flex: 1, textAlign: "left" }}>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: PINK, display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          Lihat Panduan <ChevronRight size={13} />
        </span>
      </button>
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
                <img src={refs.benar} alt="" style={{ width: "100%", aspectRatio: "15/8", objectFit: "cover", borderRadius: "14px 14px 0 0", border: `1px solid ${BORDER}`, borderBottom: "none", display: "block" }} />
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
                display: "flex", alignItems: "center", gap: 7, background: "rgba(22,163,74,0.12)", padding: "9px 13px", marginBottom: 11,
                borderRadius: "0 0 10px 10px",
              }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={11} color="#fff" strokeWidth={3} />
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: "#16A34A" }}>
                  Contoh Foto {subject} yang Benar
                </span>
              </div>

              <div style={{ marginBottom: 4 }}>
                {dos.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <Check size={11} color="#fff" strokeWidth={3} />
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
                        <img src={r.url} alt="" style={{ width: "100%", aspectRatio: "0.85", objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}` }} />
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
              <button onClick={closeSheet} style={{
                width: "100%", border: "none", borderRadius: 12, padding: "13px 18px", cursor: "pointer", fontFamily: FONT,
                background: PINK, color: "#fff", fontSize: 14.5, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
                Tutup Panduan {subject}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 1 baris checklist Ya/Tidak di step "Cek Availability Produk" - badge
// nomor jadi lingkaran (konsisten dgn Stepper), seluruh kartu dikasih tint
// hijau/merah halus begitu dijawab biar progres kelihatan sekilas tanpa
// perlu baca teks, tombol Ya/Tidak full-fill + ikon begitu dipilih. ───────
function AvailabilityRow({ item, value, onChange, error }) {
  const answered = value !== null;
  const cardBg = value === true ? "rgba(22,163,74,0.045)" : value === false ? "rgba(220,38,38,0.035)" : "#fff";
  const cardBorder = error ? "#DC2626" : value === true ? "rgba(22,163,74,0.3)" : value === false ? "rgba(220,38,38,0.25)" : BORDER;
  return (
    <div style={{
      borderRadius: 14, border: `1.5px solid ${cardBorder}`, background: cardBg, padding: 14, marginBottom: 12,
      transition: "background .25s ease, border-color .25s ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, fontFamily: FONT, marginTop: 1,
          background: answered ? PINK : "#EFEDF4", color: answered ? "#fff" : "#9A98A8",
          transition: "background .25s ease",
        }}>
          {answered ? <Check size={12} strokeWidth={3} /> : item.no}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{
              flexShrink: 0, padding: "2.5px 7px", borderRadius: 999, fontSize: 9.5, fontWeight: 800,
              background: item.brand === "im3" ? YELLOW : PINK_DK, color: item.brand === "im3" ? "#5C4300" : "#fff",
            }}>
              {item.brand === "im3" ? "IM3" : "3ID"}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{item.label}</span>
          </div>
          <div style={{ fontSize: 11.5, color: MID, marginTop: 3, lineHeight: 1.45 }}>{item.desc}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => onChange(true)} style={{
          flex: 1, padding: "10px 10px", borderRadius: 10, border: `1.5px solid ${value === true ? "#16A34A" : BORDER}`,
          background: value === true ? "#16A34A" : "#fff", color: value === true ? "#fff" : MID,
          fontWeight: 800, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "background .2s ease, border-color .2s ease, color .2s ease",
        }}>
          <Check size={14} /> Ya
        </button>
        <button onClick={() => onChange(false)} style={{
          flex: 1, padding: "10px 10px", borderRadius: 10, border: `1.5px solid ${value === false ? "#DC2626" : BORDER}`,
          background: value === false ? "#DC2626" : "#fff", color: value === false ? "#fff" : MID,
          fontWeight: 800, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "background .2s ease, border-color .2s ease, color .2s ease",
        }}>
          <X size={14} /> Tidak
        </button>
      </div>
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
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 41,
            background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 13, boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            maxHeight: 280, display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: 10, borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ position: "relative" }}>
                <Search size={14} color={MID} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID Outlet..."
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px 9px 30px", borderRadius: 9, border: `1px solid ${BORDER}`, fontSize: 13.5, fontFamily: FONT, outline: "none" }} />
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
            <div style={{ overflowY: "auto" }}>
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
                    width: "100%", textAlign: "left", padding: "10px 12px", border: "none",
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
      <div style={{ position: "relative", borderRadius: 13, overflow: "hidden", border: `1.5px solid ${BORDER}`, aspectRatio: "1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={URL.createObjectURL(file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <button onClick={onRemove} disabled={disabled} style={{
          position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", border: "none",
          background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <X size={13} />
        </button>
      </div>
    );
  }
  return (
    <label style={{
      aspectRatio: "1", borderRadius: 13, border: `1.5px dashed ${error ? "#DC2626" : BORDER}`, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer", background: error ? "rgba(220,38,38,0.04)" : "#FAFAFC",
    }}>
      <input type="file" accept="image/*" capture="environment" onChange={onPick} disabled={disabled} style={{ display: "none" }} />
      <Camera size={20} color={error ? "#DC2626" : MID} />
      <span style={{ fontSize: 10.5, color: error ? "#DC2626" : MID, fontWeight: 700, textAlign: "center", padding: "0 6px" }}>{label}</span>
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

  const setEtalaseAt = (i, file) => setEtalaseFiles((prev) => { const n = [...prev]; n[i] = file; return n; });

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
        <Header title="Pendataan Outlet" />
        <div style={{ background: "#fff", borderRadius: "22px 22px 0 0", marginTop: -14, boxShadow: "0 -8px 20px rgba(0,0,0,0.06)" }}>
          <Stepper step={step} />
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
                Upload maksimal 3 foto etalase (outdoor / indoor / produk). <strong>{etalaseCount}/3</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                  <PhotoSlot key={i} file={etalaseFiles[i]} label={`Tambah Foto ${i + 1}`}
                    onPick={(e) => { const f = e.target.files?.[0]; if (f) setEtalaseAt(i, f); e.target.value = ""; }}
                    onRemove={() => setEtalaseAt(i, null)} error={attempted1 && etalaseCount < 1 && !etalaseFiles[i]} />
                ))}
              </div>
              <PhotoGuide title="Panduan Foto Etalase Outlet" refs={refsFor("etalase")}
                desc="Ambil foto etalase dengan jelas, menampilkan seluruh area etalase / interior outlet."
                dos={["Seluruh etalase terlihat jelas", "Produk & materi promosi terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Gelap / blur", "Terhalang orang atau objek lain"]} />
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
                desc="Ambil foto tampak depan outlet dari jarak yang cukup hingga seluruh fasad toko dan lingkungan sekitar terlihat."
                dos={["Seluruh tampak depan outlet terlihat", "Nama outlet / signage terlihat jelas", "Lingkungan sekitar terlihat", "Foto fokus dan tidak blur", "Pencahayaan cukup"]}
                donts={["Terlalu dekat (hanya sebagian)", "Sudut tidak lengkap (fasad tidak terlihat)", "Gelap / blur"]} />
            </SectionCard>
          </>
        )}

        {step === 2 && (
          <SectionCard icon={<CheckCircle2 size={16} color={PINK} />} title="Cek Availability Produk">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, marginTop: -8 }}>
              <div style={{ fontSize: 12, color: MID, flex: 1 }}>
                Pastikan ketersediaan varian produk berikut di outlet.
              </div>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 44, height: 5, borderRadius: 999, background: "#EFEDF4", overflow: "hidden" }}>
                  <div style={{
                    width: `${(availabilityAnsweredCount / AVAILABILITY_ITEMS.length) * 100}%`, height: "100%", borderRadius: 999,
                    background: availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "#16A34A" : PINK,
                    transition: "width .3s ease, background .3s ease",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: availabilityAnsweredCount === AVAILABILITY_ITEMS.length ? "#16A34A" : MID, whiteSpace: "nowrap" }}>
                  {availabilityAnsweredCount}/{AVAILABILITY_ITEMS.length}
                </span>
              </div>
            </div>
            {AVAILABILITY_ITEMS.map((item) => {
              const [val, setVal] = availabilityState[item.key];
              return (
                <AvailabilityRow key={item.key} item={item} value={val} onChange={setVal}
                  error={attempted2 && val === null} />
              );
            })}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "11px 13px", borderRadius: 11, background: "rgba(247,148,29,0.08)", border: "1px solid rgba(247,148,29,0.2)" }}>
              <AlertTriangle size={15} color={ORANGE} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: "#8A5A0F" }}>
                <strong>Catatan:</strong> Jika salah satu produk tidak tersedia, pastikan outlet mendapatkan arahan restock sesuai area coverage.
              </div>
            </div>
          </SectionCard>
        )}

        {step === 3 && (
          <>
            <SectionCard>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: INK, marginBottom: 3 }}>Review Data</div>
              <div style={{ fontSize: 12, color: MID, marginBottom: 16 }}>Pastikan semua data sudah benar sebelum dikirim.</div>

              <ReviewSection icon={<Store size={14} color={PINK} />} title="Informasi Outlet" onUbah={() => setStep(0)}>
                <SummaryRow label="Nama Sender" value={namaSender} />
                <SummaryRow label="Nama Outlet" value={namaOutlet} />
                <SummaryRow label="ID Outlet" value={idOutlet} />
                <SummaryRow label="Social Media" value={socialMedia || "-"} last />
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<ImageIcon size={14} color={PINK} />} title={`Foto Etalase Outlet (${etalaseCount}/3)`} onUbah={() => setStep(1)}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                  {etalaseFiles.filter(Boolean).map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={URL.createObjectURL(f)} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}` }} />
                  ))}
                </div>
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<Store size={14} color={PINK} />} title={`Foto Tampak Depan Outlet (${tapakFile ? 1 : 0}/1)`} onUbah={() => setStep(1)}>
                {tapakFile && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(tapakFile)} alt="" style={{ width: 120, aspectRatio: "1", objectFit: "cover", borderRadius: 10, border: `1px solid ${BORDER}`, marginTop: 10 }} />
                )}
              </ReviewSection>
            </SectionCard>

            <SectionCard>
              <ReviewSection icon={<CheckCircle2 size={14} color={PINK} />} title="Availability Produk" onUbah={() => setStep(2)}>
                {AVAILABILITY_ITEMS.map((item, i) => {
                  const [val] = availabilityState[item.key];
                  return (
                    <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < AVAILABILITY_ITEMS.length - 1 ? `1px solid ${BORDER}` : "none", fontSize: 12.5 }}>
                      {val ? <Check size={14} color="#16A34A" style={{ flexShrink: 0 }} /> : <X size={14} color="#DC2626" style={{ flexShrink: 0 }} />}
                      <span style={{ color: INK, flex: 1 }}>{item.label.replace(" ?", "").replace("?", "")}</span>
                      <span style={{ fontWeight: 800, color: val ? "#16A34A" : "#DC2626" }}>{val ? "Ya" : "Tidak"}</span>
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
    </div>
  );
}

function ReviewSection({ icon, title, onUbah, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {icon}
        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: INK }}>{title}</div>
        <button onClick={onUbah} style={{ border: "none", background: "transparent", color: PINK, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <Pencil size={11} /> Ubah
        </button>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, last }) {
  return (
    <div style={{ display: "flex", padding: "7px 0", borderBottom: last ? "none" : `1px solid ${BORDER}`, fontSize: 12.5 }}>
      <div style={{ width: 110, color: MID, flexShrink: 0 }}>{label}</div>
      <div style={{ color: INK, fontWeight: 600 }}>: {value || "-"}</div>
    </div>
  );
}
