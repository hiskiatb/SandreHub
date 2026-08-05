"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope, regionLabel } from "../../../lib/martaScope";

const MD_PHOTO_BUCKET = "mh-photos";
function mdPhotoUrl(path) {
  return supabaseMarta.storage.from(MD_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Hierarki approval MartaHub (bottom-up) ──────────────────────────────────
//   BME/RGE (lapangan)  → mengajukan plan (status: plan_submitted)
//   Brand TMV           → menyetujui/menolak, TERBATAS ke brand & region miliknya
//   Head TMV / Admin     → menyetujui/menolak SEMUA brand & region
// Otorisasi nyata (bukan sekadar UI) ditegakkan di RPC mh_web_decide_plan /
// mh_web_decide_plans_bulk (SECURITY DEFINER).
//
// ⚠️ HANYA SATU FASE approval manusia sekarang — fase PLAN, lewat
// mh_web_decide_plan (satu-satu) atau mh_web_decide_plans_bulk (Approve All).
// Fase ACTUAL (dulu status 'submitted', diputuskan manual lewat
// mh_web_decide_activity) SUDAH DIHAPUS dari alur manusia — begitu BME
// submit laporan actual, trigger server mh_validate_activity_actual otomatis
// memvalidasi check-in terhadap site-site event ini dan langsung menuntaskan
// status jadi 'approved' (lolos) atau 'revision_actual' (perlu ditinjau/
// direvisi BME) — TANPA klik approve/reject manusia. Approver di sini hanya
// jadi katup pengaman manual (mh_activity_manual_override) utk status
// 'revision_actual' yang sebenarnya valid (mis. GPS meleset).

const ROLE_LABEL = { admin: "Admin", head: "Head TMV", tmv: "Brand TMV", bme: "BME", rge: "RGE", pending: "Pending" };
const CAT_LABEL = { directSelling: "Direct Selling", jointEvent: "Joint Event", openBooth: "Open Booth", project: "Project", sponsorship: "Sponsorship", thematic: "Thematic" };

const fmtDate = (s) => {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${mo} ${d.getFullYear()} · ${hh}:${mm}`;
};
const catLabel = (r) => {
  const arr = Array.isArray(r.event_categories) ? r.event_categories : [];
  if (!arr.length) return "—";
  return arr.map((c) => CAT_LABEL[c] || c).join(", ");
};

const PENDING_COLS = "id, event_name, brand, mc, site_id, plan_date_start, plan_date, event_categories, status, target_sp, target_fwa, created_at";
const REVISION_COLS = "id, event_name, brand, mc, site_id, actual_sp, actual_fwa, target_sp, target_fwa, validation_status, validation_note, validated_at";
const HISTORY_COLS = "id, event_name, brand, mc, site_id, status, actual_sp, approved_by_name, approved_by_email, approved_at, approval_notes, override_by_name, override_note";

export default function ApprovalPage() {
  return (
    <MartaShell active="approval" title="Approval Center" subtitle="Alur persetujuan bottom-up: BME/RGE mengajukan → Brand TMV / Head TMV menyetujui.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [scope, setScope] = useState(null);
  const [planRows, setPlanRows] = useState([]);
  const [revisionRows, setRevisionRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // MD Activities (§8.2/§8.3) — antrean Street Branding (mode='street',
  // review manual, BUKAN geofencing — beda dgn mode Activity/Outlet yang
  // direkonsiliasi otomatis di menu Validasi Lokasi).
  const [mdStreetRows, setMdStreetRows] = useState([]);
  // dialog: { row, kind: 'plan'|'override'|'md_street', type: 'approved'|'revision_needed'|'revision_actual'|'rejected' }
  const [dialog, setDialog] = useState(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState("");
  // Multi-select untuk "Approve All" — fase plan saja.
  const [selectedPlanIds, setSelectedPlanIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);

      let planQ = supabaseMarta.from("mh_activities").select(PENDING_COLS).eq("status", "plan_submitted").order("created_at", { ascending: true });
      planQ = await applyMartaScope(planQ, sc);

      // Fase Actual TIDAK LAGI diputuskan manusia — daftar di bawah ini
      // hanyalah katup pengaman utk item yang gagal validasi otomatis
      // (status 'revision_actual'), bukan antrean approval biasa.
      let revisionQ = supabaseMarta.from("mh_activities").select(REVISION_COLS).eq("status", "revision_actual").order("validated_at", { ascending: true });
      revisionQ = await applyMartaScope(revisionQ, sc);

      let historyQ = supabaseMarta.from("mh_activities").select(HISTORY_COLS).in("status", ["approved", "rejected", "revision_needed", "revision_actual"]).order("approved_at", { ascending: false }).limit(15);
      historyQ = await applyMartaScope(historyQ, sc);

      const [{ data: plans, error: e0 }, { data: revisions, error: e1 }, { data: hist, error: e2 }] = await Promise.all([planQ, revisionQ, historyQ]);
      if (e0) throw new Error(e0.message);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setPlanRows(plans || []);
      setRevisionRows(revisions || []);
      setHistory(hist || []);
      setSelectedPlanIds(new Set());

      // MD Activities — Street Branding (§8.3), review manual TERPISAH dari
      // rekonsiliasi otomatis mode Activity/Outlet (menu Validasi Lokasi).
      const { data: mdStreet, error: e3 } = await supabaseMarta.rpc("mh_md_list_street_pending");
      if (e3) throw new Error(e3.message);
      setMdStreetRows(mdStreet || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  // ✅ spm_sumatera ikut approver — superadmin nasional (§4.5) yang sudah jadi
  // approver di jalur POSMAT/rekonsiliasi, tapi dulu justru tidak bisa approve
  // Activity Plan/Laporan. Ditegakkan juga server-side di mh_web_decide_plan /
  // mh_web_decide_plans_bulk / mh_activity_manual_override.
  const canApprove = !!(scope && scope.found && ["admin", "head", "tmv", "spm_sumatera"].includes(scope.role));

  function openDialog(row, kind, type) {
    setDialog({ row, kind, type });
    setNotes("");
    setActionErr("");
  }
  function closeDialog() {
    if (submitting) return;
    setDialog(null);
  }

  function togglePlanSelect(id) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAllPlans() {
    setSelectedPlanIds((prev) => (prev.size === planRows.length ? new Set() : new Set(planRows.map((r) => r.id))));
  }

  async function approveAllPlans() {
    if (selectedPlanIds.size === 0 || bulkBusy) return;
    if (!confirm(`Setujui ${selectedPlanIds.size} plan sekaligus?`)) return;
    setBulkBusy(true); setBulkErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_web_decide_plans_bulk", {
        p_activity_ids: Array.from(selectedPlanIds),
        p_email: email,
        p_decision: "approved",
        p_notes: null,
      });
      if (error) throw new Error(error.message);
      const failed = (data || []).filter((r) => r.ok !== true).length;
      if (failed > 0) setBulkErr(`${failed} plan gagal diproses (di luar scope Anda).`);
      await load();
    } catch (e) { setBulkErr(e.message || "Gagal memproses"); }
    finally { setBulkBusy(false); }
  }

  async function confirmDecision() {
    if (!dialog) return;
    setSubmitting(true); setActionErr("");
    try {
      let error;
      if (dialog.kind === "md_street") {
        // RPC ini pakai p_id/p_caller_email (bukan p_activity_id/p_email —
        // pola baru §8.2 utk semua RPC MD Activities, konsisten dgn
        // mh_md_reconcile_batch di menu Validasi Lokasi).
        ({ error } = await supabaseMarta.rpc("mh_web_decide_md_installation", {
          p_id: dialog.row.id,
          p_decision: dialog.type,
          p_notes: notes.trim() || null,
          p_caller_email: email,
        }));
      } else if (dialog.kind === "override") {
        // Katup pengaman manual utk laporan Actual berstatus 'revision_actual'
        // — PENGECUALIAN, bukan jalur approval normal (yang sudah dihapus).
        ({ error } = await supabaseMarta.rpc("mh_activity_manual_override", {
          p_activity_id: dialog.row.id,
          p_final_status: dialog.type === "approved" ? "approved" : "revision_actual",
          p_note: notes.trim() || null,
          p_caller_email: email,
        }));
      } else {
        ({ error } = await supabaseMarta.rpc("mh_web_decide_plan", {
          p_activity_id: dialog.row.id,
          p_email: email,
          p_decision: dialog.type,
          p_notes: notes.trim() || null,
        }));
      }
      if (error) throw new Error(error.message);
      setDialog(null);
      await load();
    } catch (e) { setActionErr(e.message || "Gagal memproses"); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {/* Access banner */}
      {!loading && scope && (
        <div style={{
          ...card, marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
          borderColor: canApprove ? T.primaryBd : T.line,
          background: canApprove ? T.primaryBg : "#F7F9FC",
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: canApprove ? T.primary : T.lo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{canApprove ? "✓" : "i"}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi }}>
              {!scope.found
                ? "Email Anda belum terdaftar sebagai profil MartaHub"
                : canApprove
                  ? `Anda login sebagai ${ROLE_LABEL[scope.role] || scope.role}${scope.unscoped ? " — akses semua region & brand" : ` — terbatas ${regionLabel(scope.region)} · ${(scope.brand || "—").toUpperCase()}`}`
                  : `Role Anda (${ROLE_LABEL[scope.role] || scope.role || "—"}) tidak memiliki izin approval`}
            </div>
            <div style={{ fontSize: 11.5, color: T.mid, marginTop: 2 }}>
              {canApprove
                ? "Anda dapat menyetujui / menolak pengajuan di bawah ini."
                : "Hanya Head TMV (semua brand) atau Brand TMV (brand & region miliknya) yang dapat menyetujui pengajuan. Anda tetap dapat memantau daftar di bawah."}
            </div>
          </div>
        </div>
      )}

      {/* Plan approval queue — SATU-SATUNYA fase approval manusia sekarang */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>
            Menunggu Persetujuan Plan <span style={{ color: T.mid, fontWeight: 500 }}>· {planRows.length}</span>
          </div>
          {canApprove && planRows.length > 0 && (
            <>
              <button onClick={toggleSelectAllPlans} style={{ ...btn }}>{selectedPlanIds.size === planRows.length ? "Batal pilih" : "Pilih semua"}</button>
              <button onClick={approveAllPlans} disabled={selectedPlanIds.size === 0 || bulkBusy}
                style={{ ...btn, background: T.success, color: "#fff", borderColor: T.success, opacity: selectedPlanIds.size === 0 || bulkBusy ? 0.5 : 1 }}>
                {bulkBusy ? "Memproses…" : `Setujui Semua (${selectedPlanIds.size})`}
              </button>
            </>
          )}
        </div>
        {bulkErr && <div style={{ padding: "8px 16px", fontSize: 12, color: T.error, background: T.errorBg }}>{bulkErr}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {[canApprove ? "" : null, "Event", "Brand", "MC", "Site", "Kategori", "Target SP/FWA", "Tanggal", "Diajukan", ""].filter((h) => h !== null).map((h, i) => <th key={h || `sel-${i}`} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && planRows.length === 0 && <tr><td colSpan={10} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada plan yang perlu disetujui</td></tr>}
              {!loading && planRows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}`, background: selectedPlanIds.has(r.id) ? T.primaryBg : "transparent" }}>
                  {canApprove && (
                    <td style={{ padding: "10px 14px" }}>
                      <input type="checkbox" checked={selectedPlanIds.has(r.id)} onChange={() => togglePlanSelect(r.id)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                    </td>
                  )}
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span> : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{catLabel(r)}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.target_sp ?? 0}/{r.target_fwa ?? 0}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date_start || r.plan_date)}</td>
                  <td style={{ padding: "10px 14px", color: T.lo, fontSize: 11.5 }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {canApprove && (
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <button onClick={() => openDialog(r, "plan", "approved")} style={{ ...btn, background: T.success, color: "#fff", borderColor: T.success }}>Setujui</button>
                        <button onClick={() => openDialog(r, "plan", "revision_needed")} style={{ ...btn, color: T.error, borderColor: `${T.error}44` }}>Perlu Revisi</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Katup pengaman manual — laporan Actual yang GAGAL validasi otomatis
          (status 'revision_actual'). Bukan antrean approval biasa: sebagian
          besar laporan actual sudah lolos/ditolak otomatis lewat trigger
          server begitu BME submit — ini hanya utk kasus mis. GPS meleset. */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 14 }}>
          Perlu Ditinjau Manual (Validasi Gagal) <span style={{ color: T.mid, fontWeight: 500 }}>· {revisionRows.length}</span>
        </div>
        {loading && <div style={{ padding: 26, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Memuat…</div>}
        {!loading && revisionRows.length === 0 && <div style={{ padding: 26, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Tidak ada laporan yang perlu ditinjau manual 🎉</div>}
        {revisionRows.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{r.event_name || "—"}</span>
                  {r.brand && <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span>}
                </div>
                <div style={{ fontSize: 12, color: T.mid, marginTop: 2 }}>{r.mc || "—"} · {r.site_id || "—"} · Actual SP/FWA {r.actual_sp ?? 0}/{r.actual_fwa ?? 0} (target {r.target_sp ?? 0}/{r.target_fwa ?? 0})</div>
                {r.validation_note && <div style={{ fontSize: 11.5, color: T.warning, marginTop: 6, fontStyle: "italic" }}>&ldquo;{r.validation_note}&rdquo;</div>}
                <div style={{ fontSize: 11, color: T.lo, marginTop: 4 }}>Divalidasi otomatis {fmtDateTime(r.validated_at)}</div>
              </div>
              {canApprove && (
                <span style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openDialog(r, "override", "approved")} style={{ ...btn, background: T.success, color: "#fff", borderColor: T.success }}>Setujui (Override)</button>
                  <button onClick={() => openDialog(r, "override", "revision_actual")} style={{ ...btn, color: T.error, borderColor: `${T.error}44` }}>Tetap Revisi</button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Street Branding queue (§8.3) — MD Activities mode='street', ditinjau
          MANUAL (bukan geofencing, karena tidak ada outlet/site referensi).
          Stok baru berkurang setelah keputusan approve/reject di sini
          (§8.2 poin 4-5), terlepas hasilnya disetujui atau ditolak. */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 14 }}>
          Menunggu Persetujuan Street Branding <span style={{ color: T.mid, fontWeight: 500 }}>· {mdStreetRows.length}</span>
        </div>
        {loading && <div style={{ padding: 26, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Memuat…</div>}
        {!loading && mdStreetRows.length === 0 && <div style={{ padding: 26, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Tidak ada Street Branding yang perlu ditinjau</div>}
        {mdStreetRows.map((r) => (
          <div key={r.id} style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.md_full_name || r.md_email || "—"}</div>
                <div style={{ fontSize: 12, color: T.mid, marginTop: 2 }}>{r.street_description || "(tanpa deskripsi lokasi)"}</div>
                <div style={{ fontSize: 11, color: T.lo, marginTop: 2 }}>{fmtDateTime(r.created_at)} · {r.latitude}, {r.longitude}</div>
                {Array.isArray(r.items) && r.items.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {r.items.map((it, i) => (
                      <span key={i} style={{ fontSize: 11, fontWeight: 600, color: T.mid, background: "#F5F6F9", borderRadius: 8, padding: "3px 8px" }}>
                        {it.type_name} · {it.qty} {it.unit}
                      </span>
                    ))}
                  </div>
                )}
                {Array.isArray(r.photos) && r.photos.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {r.photos.map((p, i) => (
                      <a key={i} href={mdPhotoUrl(p.storage_path)} target="_blank" rel="noreferrer">
                        <img src={mdPhotoUrl(p.storage_path)} alt={p.caption || "dokumentasi"} style={{ width: 62, height: 62, objectFit: "cover", borderRadius: 8, border: `1px solid ${T.line}` }} />
                      </a>
                    ))}
                  </div>
                )}
                {r.note && <div style={{ fontSize: 11.5, color: T.mid, marginTop: 6, fontStyle: "italic" }}>&ldquo;{r.note}&rdquo;</div>}
              </div>
              {canApprove && (
                <span style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openDialog(r, "md_street", "approved")} style={{ ...btn, background: T.success, color: "#fff", borderColor: T.success }}>Setujui</button>
                  <button onClick={() => openDialog(r, "md_street", "rejected")} style={{ ...btn, color: T.error, borderColor: `${T.error}44` }}>Tolak</button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Decision history */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 14 }}>
          Riwayat Keputusan Terbaru <span style={{ color: T.mid, fontWeight: 500 }}>· {history.length}</span>
        </div>
        {!loading && history.length === 0 && <div style={{ padding: 22, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Belum ada keputusan.</div>}
        {history.map((h) => {
          // 'approved' dipakai dua kali di siklus hidup activity yang sama:
          // plan disetujui (belum ada actual_sp, siap dieksekusi) VS report
          // disetujui (sudah ada actual_sp, benar-benar selesai). Dibedakan
          // di sini murni dari tampilan, bukan status mentahnya sendiri.
          const label = h.status === "approved"
            ? (h.actual_sp == null ? "Plan Disetujui" : (h.override_by_name ? "Selesai (Override)" : "Selesai"))
            : h.status === "revision_needed"
              ? "Revisi Plan"
              : h.status === "revision_actual"
                ? "Revisi Laporan"
                : "Ditolak";
          const positive = h.status === "approved";
          return (
          <div key={h.id} style={{ padding: "12px 16px", borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{
              flexShrink: 0, marginTop: 1, fontSize: 10.5, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
              color: positive ? T.success : T.error,
              background: positive ? T.successBg : T.errorBg,
            }}>
              {label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>{h.event_name || "—"}</span>
                {h.brand && <span style={{ fontSize: 10, fontWeight: 800, color: h.brand === "tri" ? T.tri : T.im3 }}>{h.brand === "tri" ? "3ID" : "IM3"}</span>}
                <span style={{ fontSize: 11.5, color: T.mid }}>{h.mc || "—"} · {h.site_id || "—"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.lo, marginTop: 3 }}>
                oleh <strong style={{ color: T.mid, fontWeight: 700 }}>{h.approved_by_name || h.approved_by_email || "—"}</strong> · {fmtDateTime(h.approved_at)}
              </div>
              {(h.approval_notes || h.override_note) && <div style={{ fontSize: 12, color: T.mid, marginTop: 4, fontStyle: "italic" }}>&ldquo;{h.approval_notes || h.override_note}&rdquo;</div>}
            </div>
          </div>
          );
        })}
      </div>

      {/* Confirm dialog — judul/label menyesuaikan kind (plan/override/md_street)
          & type (approved/revision_needed/revision_actual/rejected) */}
      {dialog && (
        <div onClick={closeDialog} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.45)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 420, fontFamily: FONT, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, marginBottom: 4 }}>
              {dialog.kind === "md_street"
                ? (dialog.type === "approved" ? "Setujui Street Branding ini?" : "Tolak Street Branding ini?")
                : dialog.kind === "override"
                  ? (dialog.type === "approved" ? "Override: setujui laporan ini?" : "Tetap tandai perlu revisi?")
                  : dialog.type === "approved"
                    ? "Setujui plan ini?"
                    : "Minta revisi plan ini?"}
            </div>
            <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 16 }}>
              {dialog.kind === "md_street" ? (dialog.row.md_full_name || dialog.row.md_email || "—") : `${dialog.row.event_name} · ${dialog.row.mc || "—"}`}
            </div>
            {dialog.kind === "override" && (
              <div style={{ fontSize: 12, color: T.warning, marginBottom: 12, background: T.warningBg, borderRadius: 8, padding: "8px 10px" }}>
                Ini katup pengaman manual — laporan ini sudah gagal validasi otomatis (mis. GPS check-in meleset dari site). Pastikan Anda sudah memverifikasi kehadiran BME sebelum override.
              </div>
            )}
            <label style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, textTransform: "uppercase", letterSpacing: "0.03em" }}>Catatan (opsional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder={dialog.type === "approved" ? "Catatan tambahan untuk BME/RGE…" : dialog.kind === "override" ? "Alasan tetap perlu revisi…" : "Apa yang perlu direvisi dari plan ini…"}
              style={{ width: "100%", marginTop: 6, padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 12.5, fontFamily: FONT, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            {actionErr && <div style={{ marginTop: 10, fontSize: 12, color: T.error }}>{actionErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={closeDialog} disabled={submitting} style={{ ...btn, flex: 1, justifyContent: "center" }}>Batal</button>
              <button onClick={confirmDecision} disabled={submitting}
                style={{ ...btn, flex: 1, justifyContent: "center", background: dialog.type === "approved" ? T.success : T.error, color: "#fff", borderColor: dialog.type === "approved" ? T.success : T.error, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Memproses…" : dialog.type === "approved" ? "Ya, Setujui" : dialog.kind === "override" ? "Ya, Tetap Revisi" : dialog.kind === "md_street" ? "Ya, Tolak" : "Ya, Minta Revisi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center" };
