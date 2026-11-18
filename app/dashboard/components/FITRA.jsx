"use client";
import { useState } from "react";
import { ChevronLeft, MapPin, Info } from "lucide-react";

// ─── Design notes ───────────────────────────────────────────────────────────
// Every number on this page carries two lines under it: FORMULA (how it's
// computed) and SOURCE (which system/table/policy it comes from). That's
// the whole point of this rebuild — nothing here is a number without a
// traceable origin. "(proposed)" marks a metric that doesn't exist as a
// report today — it's something I'm proposing to start tracking, not
// something already live in a dashboard.
//
// Filter bar (region + period) is a dummy, client-side multiplier — it makes
// every number on the page move together so this reads as "live" in a demo,
// but it is NOT backed by a real query. Clicking a metric card expands a
// small dummy trend strip under it (last 3 periods).

function Source({ formula, source, proposed }) {
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed currentColor", opacity: 0.55 }}>
      <div style={{ fontSize: 10.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{formula}</div>
      <div style={{ fontSize: 10.5, marginTop: 2 }}>
        {proposed && <span style={{ fontWeight: 700 }}>(proposed) </span>}
        {source}
      </div>
    </div>
  );
}

function Sparkline({ values, color, t }) {
  const max = Math.max(...values) * 1.15;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 28, marginTop: 10 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(8, (v / max) * 100)}%`, borderRadius: 3,
          background: i === values.length - 1 ? color : t.lineSoft,
          opacity: i === values.length - 1 ? 1 : 0.8,
        }} />
      ))}
    </div>
  );
}

function MetricCard({ id, label, value, formula, source, proposed, t, trend, trendLabels, color, expanded, onToggle }) {
  const open = !!expanded;
  return (
    <div
      onClick={() => onToggle(id)}
      style={{
        flex: 1, padding: 16, borderRadius: 12, border: `1px solid ${t.line}`, background: t.card,
        boxShadow: t.shadowSm, color: t.mid, cursor: "pointer", transition: "box-shadow .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
        <span style={{ fontSize: 10, color: t.mute }}>{open ? "▲" : "▾"}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: t.hi, marginTop: 5 }}>{value}</div>
      <Source formula={formula} source={source} proposed={proposed} />
      {open && trend && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.mute, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 12 }}>Last 3 periods (dummy trend)</div>
          <Sparkline values={trend} color={color || "#D42B39"} t={t} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.mute, marginTop: 4 }}>
            {trendLabels.map(l => <span key={l}>{l}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function BarRow({ label, pct, color, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
      <div style={{ width: 118, fontSize: 12, color: t.mid, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 10, borderRadius: 6, background: t.lineSoft, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 6, transition: "width .25s ease" }} />
      </div>
      <div style={{ width: 34, fontSize: 12, fontWeight: 700, color: t.hi, textAlign: "right" }}>{pct.toFixed(0)}%</div>
    </div>
  );
}

function Panel({ title, formula, source, proposed, t, children }) {
  return (
    <div style={{ padding: 18, borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 14 }}>{title}</div>
      {children}
      {(formula || source) && (
        <div style={{ marginTop: 14, color: t.mid }}>
          <Source formula={formula} source={source} proposed={proposed} />
        </div>
      )}
    </div>
  );
}

// ─── Filter bar ─────────────────────────────────────────────────────────────

const REGION_OPTIONS = [
  { id: "all", label: "Semua region" },
  { id: "sumbagut", label: "Sumbagut" },
  { id: "sumbagsel", label: "Sumbagsel" },
];
const PERIOD_OPTIONS = [
  { id: "1m", label: "Bulan ini" },
  { id: "3m", label: "3 bulan" },
  { id: "6m", label: "6 bulan" },
];
const REGION_MULT = { all: 1, sumbagut: 1.12, sumbagsel: 0.86 };
const PERIOD_MULT = { "1m": 1, "3m": 1.07, "6m": 1.16 };

function FilterBar({ region, period, onRegion, onPeriod, t }) {
  const group = (options, value, onChange) => (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card }}>
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          style={{
            border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            background: value === opt.id ? t.hi : "transparent",
            color: value === opt.id ? (t.appBg || "#fff") : t.mid,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
      {group(REGION_OPTIONS, region, onRegion)}
      {group(PERIOD_OPTIONS, period, onPeriod)}
      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: t.mute, padding: "5px 11px", borderRadius: 99, border: `1px solid ${t.line}` }}>
        Angka dummy · berubah ngikut filter
      </span>
    </div>
  );
}

// ─── Base data (period = 1m, region = all baseline) ───────────────────────

const TENURE_BUCKETS_BASE = [
  { label: "<10D", pct: 37, color: "#DC2626" },
  { label: "10-30D", pct: 24, color: "#F0903F" },
  { label: "31-90D", pct: 19, color: "#F2CE5A" },
  { label: "90-180D", pct: 12, color: "#267A72" },
  { label: ">180D", pct: 8, color: "#8A8A96" },
];

const REGIONS_BASE = [
  {
    id: "sumbagut", name: "Sumbagut", homes: 358, worstBucket: "<10D", worstPct: 41,
    note: "Skews toward point-of-sale — closely tracks the Rotational PA flag rate.",
  },
  {
    id: "sumbagsel", name: "Sumbagsel", homes: 254, worstBucket: "31-90D", worstPct: 28,
    note: "Skews toward the retention desk's window — less about the sale, more about the save.",
  },
];

const ROOT_CAUSES_BASE = [
  {
    label: "Rotation-flagged", pct: 18, color: "#8A8A96",
    formula: "PA count on same FAT/ODP point in last 30d ≥ 2",
    source: "i-Sales FAT/ODP point history, cross-checked against the Rotational PA policy (Nov'26)",
  },
  {
    label: "Payment", pct: 46, color: "#DC2626",
    formula: "First unpaid bill date − activation date ≤ 45d",
    source: "Billing system (arrears/hardblock status log)",
  },
  {
    label: "Network ticket", pct: 18, color: "#F0903F",
    formula: "Open NOC ticket on the account in the 14d before churn",
    source: "NOC ticketing system",
  },
  {
    label: "Residual / unexplained", pct: 18, color: "#267A72",
    formula: "Total early-life churn − (Rotation + Payment + Network)",
    source: "Derived (proposed) — would shrink once i-Sales captures a SPIN exit-reason field",
  },
];

const REASON_CODES_REACT_BASE = [
  { label: "Payment issue", pct: 46, color: "#DC2626" },
  { label: "Dissatisfaction", pct: 23, color: "#F0903F" },
  { label: "Competitor offer", pct: 14, color: "#C2407E" },
  { label: "Temporary need", pct: 9, color: "#267A72" },
  { label: "Rotation-flagged", pct: 8, color: "#8A8A96" },
];

export const FITRA_TABS = [
  { id: "overview", label: "Base Health" },
  { id: "rootcause", label: "Root Cause" },
  { id: "retention", label: "Retention" },
  { id: "reactivation", label: "Reactivation" },
];

// Normalizes a set of {pct} bars back to ~100 after scaling, so bars don't
// visually look "wrong" after a multiplier is applied.
function rescale(bars, mult) {
  const scaled = bars.map(b => ({ ...b, pct: b.pct * mult }));
  const total = scaled.reduce((s, b) => s + b.pct, 0);
  return scaled.map(b => ({ ...b, pct: (b.pct / total) * 100 }));
}

// Deterministic dummy trend: last 3 "periods" ending at the current value.
function trendFor(current, swing = 0.12) {
  const p2 = current * (1 - swing * 0.6);
  const p1 = current * (1 - swing * 0.25);
  return [p2, p1, current];
}

export default function FITRA({ t, onBack, activeTab: controlledTab, onTabChange, hideTabBar }) {
  const [internalTab, setInternalTab] = useState("overview");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const tabs = FITRA_TABS;

  const [region, setRegion] = useState("all");
  const [period, setPeriod] = useState("1m");
  const [expandedCards, setExpandedCards] = useState({});
  const toggleCard = (id) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));

  const rm = REGION_MULT[region];
  const pm = PERIOD_MULT[period];
  const mult = rm * pm;

  const homeChurn = 4.8 * mult;
  const trueOrganic = 3.9 * mult;
  const rotFlag = 18 * (region === "sumbagsel" ? 0.92 : region === "sumbagut" ? 1.06 : 1);

  const tenureShift = region === "sumbagut" ? 4 : region === "sumbagsel" ? -3 : 0;
  const tenureBuckets = TENURE_BUCKETS_BASE.map((b, i) => {
    if (i === 0) return { ...b, pct: b.pct + tenureShift };
    if (i === 2) return { ...b, pct: b.pct - tenureShift };
    return b;
  });

  const regions = region === "all" ? REGIONS_BASE : REGIONS_BASE.filter(r => r.id === region);
  const regionsShown = regions.map(r => ({ ...r, homes: Math.round(r.homes * pm) }));

  const rootCauses = rescale(ROOT_CAUSES_BASE, region === "sumbagut" ? 1.08 : region === "sumbagsel" ? 0.94 : 1);
  const reasonCodes = rescale(REASON_CODES_REACT_BASE, region === "sumbagut" ? 1.05 : region === "sumbagsel" ? 0.95 : 1);

  const saveRate = 31 * (region === "sumbagsel" ? 1.1 : region === "sumbagut" ? 0.92 : 1);
  const funnelBase = [
    { label: "D8-20 Hardblock", v: 100 },
    { label: "Saved, no discount", v: 22 * (region === "sumbagsel" ? 1.15 : 1) },
    { label: "Saved, with offer", v: 9 * (region === "sumbagsel" ? 1.2 : 1) },
    { label: "D45+ Terminated", v: 69 * (region === "sumbagut" ? 1.06 : 1) },
  ];

  const winSuspended = 58 * (region === "sumbagsel" ? 1.08 : region === "sumbagut" ? 0.95 : 1);
  const winTerminated = 27 * (region === "sumbagsel" ? 1.1 : region === "sumbagut" ? 0.93 : 1);
  const relapse = 11 * (region === "sumbagut" ? 1.1 : 0.95);
  const revenueRestored = 412 * mult;
  const lift = 19 * (region === "sumbagsel" ? 1.15 : region === "sumbagut" ? 0.9 : 1);

  return (
    <div style={{ maxWidth: 1080 }}>
      {onBack && (
        <button className="back-btn" onClick={onBack} style={{ marginBottom: 22 }}>
          <ChevronLeft size={15} /> Kembali
        </button>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.hi }}>FITRA — Fiber Sumatera Base Health</h1>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: t.mid, padding: "3px 9px", borderRadius: 99, border: `1px solid ${t.line}` }}>
          Illustrative figures
        </span>
      </div>
      <p style={{ fontSize: 13, color: t.mid, marginBottom: 10 }}>
        Early-life churn tracking for Sumatera FTTH, split by Sumbagut and Sumbagsel. Every number below shows
        its formula and the system it's pulled from — a dashed line under the figure. Klik kartu metrik untuk
        lihat tren 3 periode terakhir.
      </p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 10, background: t.redBg, marginBottom: 16, fontSize: 12, color: t.hi }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <div><strong>(proposed)</strong> on any card means this isn't a report that runs today — it's a metric I'm proposing to start tracking, not an existing dashboard number. Filter angka di atas juga dummy, bukan query sungguhan.</div>
      </div>

      <FilterBar region={region} period={period} onRegion={setRegion} onPeriod={setPeriod} t={t} />

      {!hideTabBar && (
        <div style={{ display: "inline-flex", gap: 2, padding: 4, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, marginBottom: 20 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-pill ${activeTab === tab.id ? "on" : "off"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "overview" && (
        <div>
          <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
            <MetricCard t={t} id="hc" label="Home Churn Rate" value={`${homeChurn.toFixed(1)}%`} proposed
              color="#DC2626" trend={trendFor(homeChurn)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.hc} onToggle={toggleCard}
              formula="Homes with ≥2 PA events / 12mo ÷ all homes with a PA / 12mo"
              source="i-Sales FAT/ODP point history — counts the home, not the customer name, so a re-registered home still shows up" />
            <MetricCard t={t} id="toc" label="True Organic Churn" value={`${trueOrganic.toFixed(1)}pp`} proposed
              color="#C2407E" trend={trendFor(trueOrganic)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.toc} onToggle={toggleCard}
              formula="Total early-life churn rate − Rotational-flagged churn rate"
              source="Early-life churn from billing + i-Sales; Rotational share from the Nov'26 Rotational PA weekly review" />
            <MetricCard t={t} id="rfs" label="Rotational-flagged Share" value={`${rotFlag.toFixed(0)}%`}
              color="#F0903F" trend={trendFor(rotFlag, 0.08)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.rfs} onToggle={toggleCard}
              formula="PAs flagged Rotational ÷ all new PAs, this period"
              source="Incentive Program Nov'26 — Rotational PA review (already a live weekly process)" />
          </div>

          <Panel t={t} title="Tenure at churn (days from activation to churn/suspend)"
            formula="For each churned/suspended account: churn date − activation date, bucketed"
            source="Billing status-change log joined to i-Sales activation date — same bucket convention used in the FWA-style tenure report">
            {tenureBuckets.map(b => <BarRow key={b.label} label={b.label} pct={b.pct} color={b.color} t={t} />)}
            <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: t.redBg, fontSize: 12.5, color: t.hi }}>
              <strong>Highlight:</strong> {tenureBuckets[0].pct.toFixed(0)}% of early churn happens before day 10 — before most retention touchpoints even fire.
            </div>
          </Panel>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {regionsShown.map(r => (
              <div key={r.id} style={{ flex: 1, minWidth: 220, padding: 16, borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: t.hi }}>
                  <MapPin size={13} /> {r.name}
                </div>
                <div style={{ fontSize: 12, color: t.mid, marginTop: 4 }}>{r.homes} homes · worst bucket {r.worstBucket} ({r.worstPct}%)</div>
                <div style={{ fontSize: 12, color: t.mid, marginTop: 8 }}>{r.note}</div>
                <Source t={t} formula="Count of distinct FAT/ODP points per region, bucketed by tenure at churn" source="i-Sales region field + billing status-change log" />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "rootcause" && (
        <div>
          <Panel t={t} title="Early-life churn, sorted into root causes"
            source="Classification runs as a sequential filter, strongest signal first — see formula under each row">
            {rootCauses.map(c => <BarRow key={c.label} label={c.label} pct={c.pct} color={c.color} t={t} />)}
          </Panel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rootCauses.map((c, i) => (
              <div key={c.label} style={{ padding: 14, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{c.label} — {c.pct.toFixed(0)}%</div>
                <Source t={t} formula={ROOT_CAUSES_BASE[i].formula} source={ROOT_CAUSES_BASE[i].source} proposed={c.label.includes("Residual")} />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "retention" && (
        <div>
          <Panel t={t} title="D1–45 hardblock funnel"
            formula="Count of accounts at each stage ÷ accounts entering hardblock that period"
            source="Billing status-change log (D8 hardblock → payment or churn events)">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {funnelBase.map(s => (
                <div key={s.label} style={{ flex: "1 1 120px", padding: 12, borderRadius: 8, background: t.lineSoft, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.hi }}>{s.v.toFixed(0)}%</div>
                  <div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </Panel>
          <MetricCard t={t} id="savrate" label="D1–45 Save Rate" value={`${saveRate.toFixed(0)}%`}
            color="#267A72" trend={trendFor(saveRate, 0.1)} trendLabels={["P-2", "P-1", "Now"]}
            expanded={expandedCards.savrate} onToggle={toggleCard}
            formula="(Saved, no discount + Saved, with offer) ÷ D8-20 Hardblock"
            source="Same billing status-change log as the funnel above" />
          <div style={{ height: 18 }} />
          <Panel t={t} title="Exit reason, when known"
            formula="Count per reason code ÷ all early-life churn with a recorded reason"
            source="H+3 satisfaction call notes + CX exit survey; 'Temporary need' and 'Dissatisfaction' depend on an agent actually logging the reason — weakest-coverage source on this page">
            {reasonCodes.map(r => <BarRow key={r.label} label={r.label} pct={r.pct} color={r.color} t={t} />)}
          </Panel>
        </div>
      )}

      {activeTab === "reactivation" && (
        <div>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
            <MetricCard t={t} id="winsus" label="Win Rate — Suspended" value={`${winSuspended.toFixed(0)}%`}
              color="#267A72" trend={trendFor(winSuspended, 0.09)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.winsus} onToggle={toggleCard}
              formula="Reactivated PAs ÷ suspended accounts contacted"
              source="CX reactivation log (suspended = D8-45, still has an ONT on-site)" />
            <MetricCard t={t} id="winterm" label="Win Rate — Terminated" value={`${winTerminated.toFixed(0)}%`}
              color="#F0903F" trend={trendFor(winTerminated, 0.1)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.winterm} onToggle={toggleCard}
              formula="Reactivated PAs ÷ terminated accounts contacted"
              source="CX reactivation log (terminated = D45+, ONT already retrieved, needs a fresh SO)" />
            <MetricCard t={t} id="relapse" label="Re-lapse within 90d" value={`${relapse.toFixed(0)}%`} proposed
              color="#8A8A96" trend={trendFor(relapse, 0.08)} trendLabels={["P-2", "P-1", "Now"]}
              expanded={expandedCards.relapse} onToggle={toggleCard}
              formula="Reactivated accounts that churn again within 90d ÷ all reactivated accounts"
              source="Billing status-change log, replayed 90d forward from each reactivation date" />
          </div>
          <Panel t={t} title="Revenue Restored" formula="Σ monthly ARPU of all accounts reactivated this period" source="Billing system ARPU field, summed at the reactivation date">
            <div style={{ fontSize: 26, fontWeight: 700, color: t.hi }}>Rp{Math.round(revenueRestored)}jt</div>
          </Panel>
          <Panel t={t} title="Lift vs. control" proposed
            formula="Win rate of contacted accounts − win rate of a held-out control group given no offer"
            source="Requires running CX outreach against a sampled control group — not possible to compute from current logs alone">
            <div style={{ fontSize: 26, fontWeight: 700, color: t.hi }}>+{lift.toFixed(0)}pt</div>
          </Panel>
        </div>
      )}
    </div>
  );
}
