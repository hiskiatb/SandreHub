"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { MapPin, ChevronRight, ChevronLeft, Users, Info } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════════
// Skor Geo Compliance (§8.3, Fase 8) - dihitung ON-THE-FLY di database (bukan
// tabel tersimpan), pooled SAMA RATA (tanpa bobot beda) dari 3 sumber evidence
// yang SUDAH direkonsiliasi: status "event tervalidasi" (§0.2/§9.2), MD
// Activities mode Activity/Outlet (§8.2), dan review manual Street Branding
// (§8.2 poin 3). Berjenjang: skor tiap level = skor sendiri + agregat tim di
// bawahnya (via RPC mh_geo_compliance_for_email, drill-down per node).
// ═════════════════════════════════════════════════════════════════════════════

const ROLE_LABEL = {
  md: "MD", dsf: "DSF", tl_dsf: "TL DSF", bme_rge: "BME/RGE",
  tmv: "Brand TMV", head: "Head TMV", spm_sumatera: "SPM Sumatera", admin: "Admin",
};

function pctColor(pct) {
  if (pct === null || pct === undefined) return T.lo;
  if (pct >= 100) return T.success;
  if (pct >= 60) return T.warning;
  return T.error;
}

export default function GeoCompliancePage() {
  return (
    <MartaShell active="geo-compliance" title="Skor Geo Compliance" subtitle="Kepatuhan lokasi evidence - berjenjang dari lapangan sampai nasional (§8.3).">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  // Tumpukan breadcrumb: node pertama = diri sendiri (assignment_id caller),
  // node berikutnya = hasil drill-down klik anak di tabel breakdown.
  const [path, setPath] = useState([{ id: null, name: "Saya", role: null }]);
  const [node, setNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const current = path[path.length - 1];

  const periodRange = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = new Date(y, m, 0); // hari terakhir bulan
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    return { start, end: endStr };
  }, [ym]);

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_geo_compliance_for_email", {
        p_caller_email: email,
        p_period_start: periodRange.start,
        p_period_end: periodRange.end,
        p_assignment_id: current.id,
      });
      if (error) throw new Error(error.message);
      setNode(data);
      // Isi assignment_id "Saya" (node root) begitu diketahui, supaya breadcrumb
      // pertama konsisten kalau nanti kembali ke sana lewat klik breadcrumb.
      if (path.length === 1 && data?.assignment_id) {
        setPath([{ id: data.assignment_id, name: "Saya", role: null }]);
      }
    } catch (e) {
      setErr(e.message || "Gagal memuat skor Geo Compliance");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, periodRange.start, periodRange.end, current.id]);
  useEffect(() => { load(); }, [load]);

  function drillInto(child) {
    setPath((p) => [...p, { id: child.assignment_id, name: child.full_name || child.assignment_id, role: child.role }]);
  }
  function goToBreadcrumb(i) {
    setPath((p) => p.slice(0, i + 1));
  }
  function shiftMonth(delta) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div style={{ ...card, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Info size={18} color={T.primaryD} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.6 }}>
          <b style={{ color: T.hi }}>§8.3:</b> persentase evidence berstatus <b>valid</b> dari total evidence yang <b>sudah direkonsiliasi</b> (belum direkonsiliasi tidak dihitung). Ketiga sumber (event tervalidasi, MD Activities, Street Branding) digabung sama rata. Klik baris di tabel untuk melihat breakdown ke level di bawahnya.
        </div>
      </div>

      {/* Month picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => shiftMonth(-1)} className="mh-btn" style={iconBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.hi, minWidth: 110, textAlign: "center" }}>
          {new Date(`${ym}-01T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => shiftMonth(1)} className="mh-btn" style={iconBtn}><ChevronRight size={16} /></button>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 14 }}>
        {path.map((p, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <ChevronRight size={13} color={T.lo} />}
            <button
              onClick={() => goToBreadcrumb(i)}
              disabled={i === path.length - 1}
              style={{
                border: "none", background: "none", cursor: i === path.length - 1 ? "default" : "pointer",
                fontSize: 12.5, fontWeight: 700,
                color: i === path.length - 1 ? T.hi : T.primaryD,
                textDecoration: i === path.length - 1 ? "none" : "underline",
              }}>
              {p.name}{p.role ? ` (${ROLE_LABEL[p.role] || p.role})` : ""}
            </button>
          </span>
        ))}
      </div>

      {/* Skor node saat ini */}
      <div style={{ ...card, marginBottom: 16, padding: 20 }}>
        {loading ? (
          <div style={{ color: T.lo, fontSize: 13 }}>Memuat…</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
              <svg viewBox="0 0 84 84" style={{ width: 84, height: 84, transform: "rotate(-90deg)" }}>
                <circle cx="42" cy="42" r="36" fill="none" stroke={T.line} strokeWidth="9" />
                <circle cx="42" cy="42" r="36" fill="none" stroke={pctColor(node?.pct)} strokeWidth="9"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - (node?.pct ?? 0) / 100)}`}
                  strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: T.hi }}>
                {node?.pct == null ? "-" : `${node.pct}%`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.lo, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                <MapPin size={12} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
                Geo Compliance - {current.name}
              </div>
              <div style={{ fontSize: 13, color: T.mid }}>
                {node ? <><b style={{ color: T.hi }}>{node.valid_count}</b> valid dari <b style={{ color: T.hi }}>{node.total_count}</b> evidence direkonsiliasi bulan ini.</> : "Tidak ada data."}
              </div>
              {node && node.total_count === 0 && (
                <div style={{ fontSize: 12, color: T.lo, marginTop: 4 }}>Belum ada evidence yang direkonsiliasi pada periode ini.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Breakdown anak langsung */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={15} color={T.mid} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: T.hi }}>Breakdown Tim di Bawah</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Nama", "Role", "Valid/Total", "Skor", ""].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ padding: 22, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && (!node?.children || node.children.length === 0) && (
                <tr><td colSpan={5} style={{ padding: 22, textAlign: "center", color: T.lo }}>Tidak ada tim di bawah level ini (sudah level paling bawah, atau belum ada assignment).</td></tr>
              )}
              {!loading && node?.children?.map((c) => (
                <tr key={c.assignment_id} onClick={() => drillInto(c)} style={{ borderTop: `1px solid ${T.line}`, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F7F9FC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: T.hi }}>{c.full_name || "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{ROLE_LABEL[c.role] || c.role}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{c.valid_count}/{c.total_count}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: pctColor(c.pct), background: `${pctColor(c.pct)}1A`, padding: "2px 8px", borderRadius: 999 }}>
                      {c.pct == null ? "-" : `${c.pct}%`}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}><ChevronRight size={15} color={T.lo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const iconBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", cursor: "pointer", color: T.mid };
