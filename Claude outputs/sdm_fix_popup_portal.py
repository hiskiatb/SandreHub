p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# Import createPortal.
do(
    'import { motion, AnimatePresence } from "framer-motion";',
    'import { motion, AnimatePresence } from "framer-motion";\nimport { createPortal } from "react-dom";',
    1, "import createPortal",
)

# FIX (permintaan user - "untuk pop up jangan terpotong, dia selalu
# paling depan, dan juga untuk scrollbar itu tidak tampil"): popover
# lama posisinya `position:absolute` relatif ke tombolnya SENDIRI, jadi
# kalau tombolnya ada di baris atas sebuah Card dgn banyak baris di
# bawahnya, popover²nya ketutup/kepotong sama baris berikutnya (z-index
# cuma menang di dalam stacking context yg sama, bukan "selalu paling
# depan" beneran) - dan karena overflow-nya nambah tinggi konten,
# ancestor container yg punya overflow:auto jadi nampilin scrollbar yg
# ga perlu. FIX: portal popover-nya LANGSUNG ke <body>, posisi `fixed`
# dihitung dari posisi tombol (getBoundingClientRect) - jadi beneran
# selalu di lapisan paling atas, ga pernah kepotong container manapun,
# dan ga memicu scrollbar di container manapun. Ikut auto-close kalau
# discroll/resize (posisi fixed-nya ga ngikut scroll) + clamp biar ga
# keluar tepi layar.
old_button = '''function SdmLevelMenuButton({ currentLevel, onPick, t }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Pindahkan level"
        style={{ width: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${open ? t.blueBd : "transparent"}`, background: open ? t.blueBg : "transparent", color: t.mid, cursor: "pointer" }}
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 401, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.20)", minWidth: 190, padding: 5 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 7px 6px" }}>Pindahkan ke level</div>
            {SDM_LEVEL_ORDER.map((lvl) => {
              const isCurrent = lvl === currentLevel;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => { onPick(lvl); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", fontSize: 12.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? t.blue : t.hi, background: "transparent", border: "none", borderRadius: 6, cursor: isCurrent ? "default" : "pointer" }}
                  onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = t.hoverBg || t.blueBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {SDM_LEVEL_LABEL[lvl]}{isCurrent ? " • sekarang" : ""}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}'''
new_button = '''const SDM_MENU_W = 196;
const SDM_MENU_H_EST = 46 + SDM_LEVEL_ORDER.length * 34;
function SdmLevelMenuButton({ currentLevel, onPick, t }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(r.left, window.innerWidth - SDM_MENU_W - 10);
      const top = Math.min(r.bottom + 4, window.innerHeight - SDM_MENU_H_EST - 10);
      setPos({ top: Math.max(10, top), left: Math.max(10, left) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        title="Pindahkan level"
        style={{ width: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${open ? t.blueBd : "transparent"}`, background: open ? t.blueBg : "transparent", color: t.mid, cursor: "pointer" }}
      >
        <MoreVertical size={13} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9000 }} />
          <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9001, width: SDM_MENU_W, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.28)", padding: 5 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 7px 6px" }}>Pindahkan ke level</div>
            {SDM_LEVEL_ORDER.map((lvl) => {
              const isCurrent = lvl === currentLevel;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => { onPick(lvl); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", fontSize: 12.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? t.blue : t.hi, background: "transparent", border: "none", borderRadius: 6, cursor: isCurrent ? "default" : "pointer" }}
                  onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = t.hoverBg || t.blueBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {SDM_LEVEL_LABEL[lvl]}{isCurrent ? " • sekarang" : ""}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}'''
do(old_button, new_button, 1, "SdmLevelMenuButton -> portal ke body, posisi fixed")

open(p, "w").write(S["s"])
print("POPUPFIX_OK")
