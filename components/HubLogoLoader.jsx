"use client";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,sans-serif`;

// Single stylesheet — dark handled via [data-theme="dark"] selector.
// Class names never change between SSR and client → no hydration mismatch.
const ANIMS = `
  @keyframes hl-spring-in {
    0%   { transform: scale(0.22) rotate(-8deg); opacity: 0; }
    60%  { transform: scale(1.07) rotate(1deg);  opacity: 1; }
    80%  { transform: scale(0.96) rotate(-0.3deg); }
    100% { transform: scale(1.00) rotate(0deg);  opacity: 1; }
  }
  @keyframes hl-breathe {
    0%, 100% { transform: scale(1.00); }
    50%       { transform: scale(1.04); }
  }
  @keyframes hl-name-up {
    0%   { transform: translateY(14px); opacity: 0; }
    100% { transform: translateY(0px);  opacity: 1; }
  }
  @keyframes hl-bar {
    0%, 100% { transform: scaleX(0.18); opacity: 0.30; }
    50%       { transform: scaleX(1.00); opacity: 1.00; }
  }
  @keyframes hl-shimmer {
    0%   { left: -120%; }
    100% { left:  130%; }
  }

  /* ── base (light) ── */
  .hl-logo-box {
    animation:
      hl-spring-in 0.75s cubic-bezier(0.34,1.56,0.64,1) both,
      hl-breathe   2.8s ease-in-out 0.9s infinite;
  }
  .hl-shimmer-wrap { position:relative; overflow:hidden; display:inline-flex; border-radius:16px; }
  .hl-shimmer-wrap::after {
    content:""; position:absolute; inset:0;
    background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.60) 50%,transparent 70%);
    left:-120%;
    animation:hl-shimmer 1.8s ease-out 0.85s 1 forwards;
  }
  .hl-name  { animation:hl-name-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.55s both; }
  .hl-sub   { animation:hl-name-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.70s both; }
  .hl-name-text  { color:#1A1A1D; }
  .hl-sub-text   { color:#AEAEB8; }
  .hl-bar-track  { width:52px; height:3px; border-radius:99px; background:rgba(237,28,36,0.12); overflow:hidden; position:relative; }
  .hl-bar-fill   { position:absolute; inset:0; border-radius:99px; background:#ED1C24; transform-origin:left center; animation:hl-bar 1.4s cubic-bezier(0.4,0,0.6,1) 0.9s infinite; }
  .hl-loader     { animation:hl-name-up 0.4s ease 1.0s both; }

  /* ── dark overrides (no keyframe redeclaration needed — same animations) ── */
  [data-theme="dark"] .hl-shimmer-wrap::after {
    background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.45) 50%,transparent 70%);
  }
  [data-theme="dark"] .hl-name-text  { color:#F2F2F3; }
  [data-theme="dark"] .hl-sub-text   { color:#6A6A78; }
  [data-theme="dark"] .hl-bar-track  { background:rgba(237,28,36,0.15); }
`;

/**
 * Unified animated loading screen — works for both light and dark themes.
 * CSS [data-theme="dark"] selectors handle dark styling, so SSR and client
 * always render the same class names → no hydration mismatch.
 */
export function HubLogoLoader({ variant = "marta", logoSize = 88 }) {
  const isMarta  = variant === "marta";
  const src      = isMarta ? "/logos/marta-icon.png" : "/logos/sandra-icon.png";
  const accent   = "#ED1C24";
  const subtitle = isMarta ? "Marketing Sumatera" : "S&D Sumatera";
  return (
    <>
      <style suppressHydrationWarning>{ANIMS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0, fontFamily:FONT }}>
        <div className="hl-logo-box">
          <div className="hl-shimmer-wrap">
            <img
              src={src}
              alt={isMarta ? "MartaHub" : "SandraHub"}
              style={{ height:logoSize, width:logoSize, display:"block", borderRadius:logoSize*0.225 }}
              draggable={false}
            />
          </div>
        </div>
        <div className="hl-name">
          <span className="hl-name-text" style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.04em" }}>
            {isMarta ? <>Marta<span style={{color:accent}}>Hub</span></> : <>Sandra<span style={{color:accent}}>Hub</span></>}
          </span>
        </div>
        <div className="hl-sub" style={{ marginTop:5 }}>
          <span className="hl-sub-text" style={{ fontSize:11, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase" }}>
            {subtitle}
          </span>
        </div>
        <div className="hl-loader" style={{ marginTop:32 }}>
          <div className="hl-bar-track"><div className="hl-bar-fill"/></div>
        </div>
      </div>
    </>
  );
}

/** @deprecated Use HubLogoLoader — it handles dark mode automatically via CSS */
export function HubLogoLoaderDark({ variant = "marta", logoSize = 88 }) {
  return <HubLogoLoader variant={variant} logoSize={logoSize} />;
}

export default HubLogoLoader;
