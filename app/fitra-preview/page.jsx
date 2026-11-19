"use client";
import { useState } from "react";
import { Sun, Moon, LayoutGrid, Search, CreditCard, PhoneCall } from "lucide-react";
import FITRA, { FITRA_TABS } from "../dashboard/components/FITRA";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

const tk = (d) => ({
  appBg:     d ? "#0D0D0E" : "#F7F8FC",
  sidebar:   d ? "#141416" : "#FFFFFF",
  card:      d ? "#1A1A1D" : "#FFFFFF",
  line:      d ? "#2A2A2F" : "#EEF0F5",
  lineSoft:  d ? "#222226" : "#EBEBEF",
  hi:        d ? "#F2F2F3" : "#1A1A2E",
  mid:       d ? "#8A8A96" : "#5B6273",
  mute:      d ? "#6B6B76" : "#9BA3B4",
  redBg:     d ? "#2A1414" : "#FEEDEC",
  shadowSm:  d ? "0 1px 2px rgba(0,0,0,0.55)" : "0 1px 2px rgba(26,26,46,.04)",
});

// Satu ikon outline-stroke per tab, dipinjam gaya WeskaHub (svg stroke, bukan
// filled/emoji) supaya konsisten dgn sidebar aslinya.
const TAB_ICONS = {
  overview:     LayoutGrid,
  rootcause:    Search,
  retention:    CreditCard,
  reactivation: PhoneCall,
};

// /fitra-preview - mockup mandiri FITRA (Fiber Sumatera) untuk bahan
// presentasi, sengaja TIDAK lewat SandraHub / tanpa login sama sekali.
// Layout sidebar dirapikan mengikuti konsep /weskahub (fixed left sidebar +
// scrollable content pane, brand block di atas, nav grouped, foot avatar).
export default function FitraPreviewPage() {
  const [d, setD] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const t = tk(d);

  return (
    <div style={{ display: "flex", height: "100svh", fontFamily: FONT, background: t.appBg }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 248, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.line}`,
        display: "flex", flexDirection: "column", padding: "20px 14px", gap: 4, overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: "linear-gradient(135deg,#ED1C24 0%,#C2187C 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 14,
          }}>F</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>FITRA</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: t.mute, textTransform: "uppercase" }}>Fiber Sumatera</div>
          </div>
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mute, letterSpacing: 0.5, textTransform: "uppercase", padding: "10px 10px 6px" }}>
          Analysis
        </div>
        {FITRA_TABS.map(tab => {
          const Icon = TAB_ICONS[tab.id];
          const active = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                color: active ? t.hi : t.mid,
                background: active ? (d ? "linear-gradient(90deg,#2A0F18,#2A1606)" : "linear-gradient(90deg,#FFF0F5,#FFF7EC)") : "transparent",
                border: `1px solid ${active ? t.line : "transparent"}`,
              }}
            >
              <Icon size={17} strokeWidth={2} style={{ flexShrink: 0, opacity: active ? 1 : 0.8 }} />
              {tab.label}
            </div>
          );
        })}

        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: t.lineSoft,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11.5, fontWeight: 700, color: t.hi,
          }}>HS</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>Hiskia S.</div>
            <div style={{ fontSize: 10.5, color: t.mute }}>SPM · Sumatera</div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "0 24px", borderBottom: `1px solid ${t.line}`, background: t.card,
        }}>
          <button
            onClick={() => setD(v => !v)}
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`,
              background: t.appBg, color: t.hi, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {d ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 48px" }}>
          <FITRA t={t} activeTab={activeTab} onTabChange={setActiveTab} hideTabBar />
        </div>
      </div>
    </div>
  );
}
