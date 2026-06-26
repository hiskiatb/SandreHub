"use client";

/**
 * HubLogo — real PNG image logos
 *
 * Props:
 *   variant : "sandra" | "marta"
 *   size    : number (px) — height of the logo box
 *   dark    : boolean — dark background context (Sandra uses dark-slate bg, Marta stays white)
 *   shadow  : boolean — drop-shadow (default true)
 *   inBox   : boolean — wrap in rounded-square box (default true)
 *   markOnly: boolean — show wide wordmark instead of square icon (default false)
 */

/** Background colours */
const BG = {
  light: "linear-gradient(160deg,#FFFFFF 0%,#F5F6F8 100%)",
  dark:  "linear-gradient(160deg,#23262F 0%,#1A1D24 100%)",   // Sandra dark-mode
};

const BORDER = {
  light: "1px solid rgba(0,0,0,0.07)",
  dark:  "1px solid rgba(255,255,255,0.06)",
};

export function HubLogo({
  variant  = "marta",
  size     = 40,
  dark     = false,
  shadow   = true,
  inBox    = true,
  markOnly = false,
  pad      = 0,   // extra padding inside the box (px)
}) {
  const isMarta = variant === "marta";

  // Square icon — Sandra always light bg; Marta respects dark prop
  const iconSrc = (dark && isMarta)
    ? "/logos/marta-icon-dark.png"
    : (isMarta ? "/logos/marta-icon.png" : "/logos/sandra-icon.png");

  // Wide wordmark files (no background, used for large headers)
  // Sandra always uses light mark; Marta respects dark prop
  const markSrc = (dark && isMarta)
    ? "/logos/marta-mark-dark.png"
    : (isMarta ? "/logos/marta-mark.png" : "/logos/sandra-mark.png");

  const alt = isMarta ? "MartaHub" : "SandraHub";

  /* ── Wide wordmark mode — no box ───────────────────────────────────── */
  if (markOnly) {
    return (
      <img
        src={markSrc}
        alt={alt}
        style={{
          height:         size,
          width:          "auto",
          display:        "block",
          objectFit:      "contain",
          filter:         shadow
            ? "drop-shadow(0px 2px 8px rgba(0,0,0,0.15)) drop-shadow(0px 6px 20px rgba(0,0,0,0.09))"
            : undefined,
          userSelect:     "none",
          pointerEvents:  "none",
          WebkitUserDrag: "none",
        }}
        draggable={false}
      />
    );
  }

  /* ── Square icon — with or without box ─────────────────────────────── */
  const radius = size * 0.225;
  const shadowFilter = shadow
    ? "drop-shadow(0px 2px 8px rgba(0,0,0,0.14)) drop-shadow(0px 6px 22px rgba(0,0,0,0.09))"
    : undefined;

  if (!inBox) {
    // No box — icon PNG already has baked-in bg, just show with shadow
    return (
      <img
        src={iconSrc}
        alt={alt}
        style={{
          width:          size,
          height:         size,
          display:        "block",
          objectFit:      "contain",
          borderRadius:   radius,
          filter:         shadowFilter,
          userSelect:     "none",
          pointerEvents:  "none",
          WebkitUserDrag: "none",
        }}
        draggable={false}
      />
    );
  }

  /* inBox=true: CSS box around the icon — always light bg */
  const bg     = BG.light;
  const border = BORDER.light;

  return (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   radius,
        background:     bg,
        border:         border,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        filter:         shadowFilter,
        overflow:       "hidden",
      }}
    >
      <img
        src={iconSrc}
        alt={alt}
        style={{
          width:         `calc(100% - ${pad * 2}px)`,
          height:        `calc(100% - ${pad * 2}px)`,
          display:       "block",
          objectFit:     "contain",
          userSelect:    "none",
          pointerEvents: "none",
        }}
        draggable={false}
      />
    </div>
  );
}

/** Convenience alias — square icon only */
export function HubIcon({
  variant = "marta",
  size    = 40,
  dark    = false,
  shadow  = true,
}) {
  return <HubLogo variant={variant} size={size} dark={dark} shadow={shadow} inBox={false} />;
}

export default HubLogo;
