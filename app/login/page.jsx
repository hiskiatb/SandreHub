"use client";
/**
 * /login — Hub Picker
 * User harus pilih SandraHub atau MartaHub sebelum lanjut.
 * WeskaHub sengaja tidak ditampilkan di sini — diakses lewat Settings
 * (gear icon, password gated) di sebelah toggle dark/light mode.
 * Tidak ada form login di sini; form ada di /sandra/login, /marta/login, dst.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, ChevronRight, Settings, Lock, X, Eye, EyeOff } from "lucide-react";
import { HubLogo } from "../../components/HubLogo";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const SETTINGS_PASSWORD = "696069"; // hardcoded on purpose — gear icon must not be openable by sembarang orang

const mk = (d) => ({
  bg:    d ? "#0A0A0B" : "#F4F4F6",
  hi:    d ? "#F0F0F2" : "#111116",
  mid:   d ? "#7A7A88" : "#5A5A68",
  lo:    d ? "#4A4A58" : "#D0CDD6",
  card:  d ? "#141417" : "#FFFFFF",
  line:  d ? "#22222A" : "#E4E2EA",
  card$: d ? "0 20px 60px rgba(0,0,0,0.7)" : "0 8px 48px rgba(0,0,0,0.10)",
});

const HUBS = [
  {
    id:       "sandra",
    variant:  "sandra",
    name:     "SandraHub",
    desc:     "S&D Sumatera",
    sub:      "Sales and Distribution Sumatera Hub",
    path:     "/sandra/login",
    gradient: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
    border:   "rgba(237,28,36,0.35)",
    glow:     "rgba(237,28,36,0.12)",
    accent:   "#ED1C24",
  },
  {
    id:       "marta",
    variant:  "marta",
    name:     "MartaHub",
    desc:     "Marketing Sumatera",
    sub:      "Marketing Sumatera Hub",
    path:     "/marta/login",
    gradient: "linear-gradient(135deg,#ED1C24 0%,#C2187C 100%)",
    border:   "rgba(194,24,124,0.35)",
    glow:     "rgba(194,24,124,0.12)",
    accent:   "#C2187C",
  },
];

// Tidak ikut HUBS — tidak dirender di kartu utama, hanya muncul di dalam
// Settings setelah password benar.
const WESKAHUB = {
  id:       "weskahub",
  variant:  "weskahub",
  name:     "WeskaHub",
  desc:     "Region SFM Kalbar",
  sub:      "Western Kalimantan Intelligence Hub",
  path:     "/weskahub",
  gradient: "linear-gradient(135deg,#E8488E 0%,#FF8033 100%)",
  border:   "rgba(232,72,142,0.35)",
  glow:     "rgba(232,72,142,0.12)",
  accent:   "#E8488E",
};

export default function HubPickerPage() {
  const router     = useRouter();
  const [d, setD]  = useState(true);
  const [hover, setHover] = useState(null);
  const t = mk(d);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
  }, []);

  const toggleTheme = () => {
    const next = !d;
    setD(next);
    localStorage.setItem("hub-theme", next ? "dark" : "light");
  };

  const pick = (hub) => {
    localStorage.setItem("hub-choice", hub.id);
    router.push(hub.path);
  };

  const openSettings = () => {
    setSettingsOpen(true);
    setUnlocked(false);
    setPwInput("");
    setPwError(false);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  const submitPassword = (e) => {
    e.preventDefault();
    if (pwInput === SETTINGS_PASSWORD) {
      setUnlocked(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const openWeskaHub = () => {
    localStorage.setItem("hub-choice", WESKAHUB.id);
    router.push(WESKAHUB.path);
  };

  return (
    <div style={{
      minHeight: "100svh", fontFamily: FONT, background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "32px 20px", position: "relative",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* Mesh bg */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", inset: 0, background: d ? "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)" : "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      {/* Top-right controls: theme toggle + settings */}
      <div style={{ position: "fixed", top: 18, right: 18, zIndex: 50, display: "flex", gap: 10 }}>
        <button onClick={toggleTheme} style={{
          width: 36, height: 36, borderRadius: 10,
          border: `1px solid ${t.line}`,
          background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.mid, cursor: "pointer",
        }}>
          {d ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button onClick={openSettings} title="Settings" style={{
          width: 36, height: 36, borderRadius: 10,
          border: `1px solid ${t.line}`,
          background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.mid, cursor: "pointer",
        }}>
          <Settings size={15} />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ width: "100%", maxWidth: 480, position: "relative", zIndex: 1 }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: t.mid, marginBottom: 14 }}>
            IOH Sumatera · Platform
          </div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>
            Pilih Platform<br />
            <span style={{ background: "linear-gradient(90deg,#ED1C24,#C2187C)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>yang kamu gunakan</span>
          </h1>
          <p style={{ margin: "14px 0 0", fontSize: 14, color: t.mid, lineHeight: 1.6 }}>
            Setiap platform terhubung ke sistem yang berbeda.<br />Pastikan memilih yang benar.
          </p>
        </div>

        {/* Hub cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {HUBS.map((hub, i) => (
            <motion.button
              key={hub.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
              onClick={() => pick(hub)}
              onMouseEnter={() => setHover(hub.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                width: "100%", border: "none", background: "none",
                padding: 0, cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{
                background: t.card,
                border: `1.5px solid ${hover === hub.id ? hub.border : t.line}`,
                borderRadius: 18,
                padding: "22px 24px",
                boxShadow: hover === hub.id
                  ? `0 0 0 4px ${hub.glow}, ${t.card$}`
                  : t.card$,
                transition: "border-color 0.18s, box-shadow 0.18s, transform 0.16s",
                transform: hover === hub.id ? "translateY(-2px)" : "translateY(0)",
                display: "flex", alignItems: "center", gap: 18,
              }}>

                {/* Logo */}
                <div style={{ flexShrink: 0 }}>
                  <HubLogo variant={hub.variant} size={60} dark={d} shadow inBox />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, marginBottom: 4 }}>
                    {hub.name}
                  </div>
                  <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5 }}>
                    {hub.sub}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: hover === hub.id ? hub.gradient : t.lo + "33",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.18s",
                }}>
                  <ChevronRight size={18} color={hover === hub.id ? "#fff" : t.mid} strokeWidth={2.5} />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 28, textAlign: "center", fontSize: 11, color: t.lo }}>
          Tidak tahu harus pilih yang mana? Hubungi admin atau supervisor kamu.
        </div>
      </motion.div>

      {/* Settings modal — password gated */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSettings}
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 360,
                background: t.card, border: `1px solid ${t.line}`,
                borderRadius: 18, padding: 26,
                boxShadow: t.card$, position: "relative",
              }}
            >
              <button onClick={closeSettings} style={{
                position: "absolute", top: 14, right: 14,
                width: 28, height: 28, borderRadius: 8, border: "none",
                background: "transparent", color: t.mid, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <X size={16} />
              </button>

              {!unlocked ? (
                <>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: "linear-gradient(135deg,#ED1C24,#C2187C)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 16,
                  }}>
                    <Lock size={18} color="#fff" />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: t.hi, marginBottom: 4 }}>
                    Settings terkunci
                  </div>
                  <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5, marginBottom: 18 }}>
                    Masukkan password untuk mengubah pengaturan platform.
                  </div>
                  <form onSubmit={submitPassword}>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPw ? "text" : "password"}
                        value={pwInput}
                        onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
                        placeholder="Password"
                        autoFocus
                        style={{
                          width: "100%", padding: "11px 40px 11px 14px",
                          borderRadius: 10, fontSize: 14,
                          border: `1.5px solid ${pwError ? "#ED1C24" : t.line}`,
                          background: d ? "#0A0A0B" : "#F8F8FA",
                          color: t.hi, outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        style={{
                          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                          border: "none", background: "transparent", color: t.mid, cursor: "pointer",
                          display: "flex", alignItems: "center",
                        }}
                      >
                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {pwError && (
                      <div style={{ fontSize: 12, color: "#ED1C24", marginTop: 8, fontWeight: 600 }}>
                        Password salah. Coba lagi.
                      </div>
                    )}
                    <button type="submit" style={{
                      width: "100%", marginTop: 14, padding: "11px 0",
                      borderRadius: 10, border: "none", cursor: "pointer",
                      background: "linear-gradient(135deg,#ED1C24,#C2187C)",
                      color: "#fff", fontWeight: 700, fontSize: 14,
                    }}>
                      Buka Settings
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, color: t.hi, marginBottom: 4 }}>
                    Settings Platform
                  </div>
                  <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5, marginBottom: 18 }}>
                    Akses khusus — tidak ditampilkan di halaman pilih platform.
                  </div>
                  <button
                    onClick={openWeskaHub}
                    onMouseEnter={() => setHover(WESKAHUB.id)}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      width: "100%", border: "none", background: "none",
                      padding: 0, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", borderRadius: 12,
                      border: `1.5px solid ${hover === WESKAHUB.id ? WESKAHUB.border : t.line}`,
                      background: d ? "#0A0A0B" : "#F8F8FA",
                      transition: "border-color 0.18s",
                    }}>
                      <HubLogo variant={WESKAHUB.variant} size={32} dark={d} shadow={false} inBox />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: t.hi }}>
                          {WESKAHUB.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: t.mid }}>
                          {WESKAHUB.sub}
                        </div>
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: hover === WESKAHUB.id ? WESKAHUB.gradient : t.lo + "33",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.18s",
                      }}>
                        <ChevronRight size={14} color={hover === WESKAHUB.id ? "#fff" : t.mid} strokeWidth={2.5} />
                      </div>
                    </div>
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
        body { margin: 0 }
      `}</style>
    </div>
  );
}
