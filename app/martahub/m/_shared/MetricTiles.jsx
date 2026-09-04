"use client";
/**
 * MetricTiles - komponen Target/Actual (MetricTile, RebuyTile+RebuyRow) &
 * banner Estimasi Revenue/Cost Ratio, DIPUSATKAN di sini supaya halaman
 * Detail Aktivitas (activities/[id]/page.jsx) dan kartu breakdown di list
 * Aktivitas (activities/page.jsx) pakai KODE YANG SAMA PERSIS - dulu list
 * punya salinan gaya sendiri (StatChip "Plan → Actual" satu baris) yg
 * beda dari detail, sekarang satu sumber kebenaran jadi tidak akan lagi
 * diam-diam berbeda kalau salah satu diubah.
 */
import { RefreshCw } from "lucide-react";
import { FF } from "./MobileShell";

/** Tile Target/Actual - label+ikon di atas, 2 kolom Target/Actual
 * berdampingan dipisah garis vertikal tipis. */
export function MetricTile({ icon: Icon, accent, label, target, actual, pending }) {
  return (
    <div style={{ borderRadius: 14, background: "#F8F8FA", border: "1px solid #EFEFF2", padding: "12px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 9, background: `${accent}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={accent} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "stretch", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "#B0B0BA" }}>Target</div>
          <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: "#5A5A68", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target}</div>
        </div>
        <div style={{ width: 1, background: "#E9EAEE", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "#B0B0BA" }}>Actual</div>
          <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800, color: actual === "-" ? "#B0B0BA" : accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actual}</div>
        </div>
      </div>
      {pending > 0 && (
        <div style={{ marginTop: 6, fontSize: 9.5, fontWeight: 700, color: "#B45309" }}>+{pending} menunggu validasi</div>
      )}
    </div>
  );
}

/** Rebuy SP & FWA digabung 1 tile lebar penuh - 1 ikon Rebuy (RefreshCw) +
 * header Target/Actual + 2 baris ringkas SP/FWA. */
export function RebuyTile({ spTarget, spActual, fwaTarget, fwaActual }) {
  return (
    <div style={{ borderRadius: 14, background: "#F8F8FA", border: "1px solid #EFEFF2", padding: "12px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 9, background: "rgba(180,83,9,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RefreshCw size={14} color="#B45309" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>Rebuy</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, padding: "0 0 6px" }}>
        <span style={{ flexShrink: 0, width: 30 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 8.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Target</span>
        <span style={{ width: 1, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 8.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Actual</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <RebuyRow label="SP" target={spTarget} actual={spActual} accent="#B45309" />
        <div style={{ height: 1, background: "#E9EAEE" }} />
        <RebuyRow label="FWA" target={fwaTarget} actual={fwaActual} accent="#0D9488" />
      </div>
    </div>
  );
}

export function RebuyRow({ label, target, actual, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
      <span style={{ flexShrink: 0, width: 30, fontSize: 10.5, fontWeight: 800, color: "#8A8A96", display: "flex", alignItems: "center" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "#5A5A68", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{target}</span>
      <div style={{ width: 1, flexShrink: 0, background: "#E9EAEE" }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: actual === "-" ? "#B0B0BA" : accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{actual}</span>
    </div>
  );
}

/** Banner gelap "Estimasi Total Revenue" + "Cost Ratio" - dipakai persis
 * sama di bawah grid tile Target vs Actual, baik di Detail Aktivitas
 * maupun kartu breakdown list. */
export function RevenueCostBanner({ revenueLabel, revenueValue, costRatioValue }) {
  return (
    <div style={{ marginTop: 10, borderRadius: 14, background: "linear-gradient(135deg,#17181C,#2A2B33)", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontFamily: FF }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{revenueLabel || "Estimasi Total Revenue"}</div>
        <div style={{ marginTop: 2, fontSize: 15, fontWeight: 800, color: "#fff" }}>{revenueValue}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Cost Ratio</div>
        <div style={{ marginTop: 2, fontSize: 15, fontWeight: 800, color: "#F5A3CB" }}>{costRatioValue}</div>
      </div>
    </div>
  );
}
