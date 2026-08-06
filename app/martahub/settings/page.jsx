"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, regionLabel } from "../../../lib/martaScope";

const ROLE_LABEL = {
  admin: "Admin", spm_sumatera: "SPM Sumatera (Superadmin Nasional)",
  head: "Head TMV (per Region)", tmv: "Brand TMV (Region × Brand)",
  bme: "BME", rge: "RGE", tl_dsf: "TL DSF", dsf: "DSF", md: "MD",
};

// Role yang boleh mengubah setting radius (lihat mh_set_setting di database -
// harus disamakan kalau daftar role di sana berubah).
const CAN_EDIT_SETTINGS_ROLES = ["head", "tmv", "spm_sumatera", "admin"];

export default function SettingsPage() {
  return (
    <MartaShell active="settings" title="System Settings" subtitle="Informasi akun, akses & status sistem MartaHub.">
      {(ctx) => <Body email={ctx?.session?.user?.email} profile={ctx?.profile} />}
    </MartaShell>
  );
}

function Body({ email, profile }) {
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, gridColumn: "1 / -1", borderColor: T.warning, background: T.warningBg, color: "#7a5b00" }}>
          Supabase MartaHub belum dikonfigurasi (env <code>NEXT_PUBLIC_MARTA_SUPABASE_URL</code> / project paused) - beberapa fitur tidak akan berfungsi.
        </div>
      )}
      {err && <div style={{ ...card, gridColumn: "1 / -1", borderColor: T.error, background: T.errorBg, color: T.error }}>{err}</div>}

      {/* Akun */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Akun</div>
        <Row label="Email" value={email || "-"} />
        <Row label="Login via" value="SandraHub (auth gate bersama)" />
        <Row label="Role akses admin panel" value={profile?.role || "-"} />
      </div>

      {/* Scope MartaHub */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Scope Data MartaHub</div>
        {loading ? (
          <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
        ) : !scope || !scope.found ? (
          <div style={{ fontSize: 12.5, color: T.warning }}>Email ini belum terdaftar sebagai profil di <code>mh_profiles</code> - dashboard/monitoring akan tampil kosong sampai ditambahkan Admin MartaHub.</div>
        ) : (
          <>
            <Row label="Nama" value={scope.fullName || "-"} />
            <Row label="Role MartaHub" value={ROLE_LABEL[scope.role] || scope.role || "-"} />
            <Row label="Cakupan" value={scope.unscoped ? "Semua Region × Brand" : `${regionLabel(scope.region)} · ${(scope.brand || "-").toUpperCase()}`} />
            {scope.branchName && <Row label="Cabang" value={scope.branchName} />}
          </>
        )}
      </div>

      {/* Radius Validasi - §0.2 Lapis 1 (Check-In) & §8.2 poin 7 (MD Activities) */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <RadiusSettings canEdit={CAN_EDIT_SETTINGS_ROLES.includes(scope?.role)} email={email} />
      </div>

      {/* Bobot Skor Leaderboard */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <LeaderboardWeightsSettings canEdit={CAN_EDIT_SETTINGS_ROLES.includes(scope?.role)} email={email} />
      </div>

      {/* Jenis SP & Daftar Harga */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <ProductTypesSettings canEdit={CAN_EDIT_SETTINGS_ROLES.includes(scope?.role)} email={email} />
      </div>

      {/* Tentang sistem */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Tentang Sistem</div>
        <Row label="Modul" value="MartaHub - Admin & TMV Console" />
        <Row label="Sumber data" value="Supabase (mh_activities, mh_profiles, mh_branches, mh_assignments)" last />
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: "#F0F4FA", fontSize: 12, color: T.mid, lineHeight: 1.5 }}>
          Pengaturan RBAC penuh (kelola role/region/brand per pengguna) belum tersedia di halaman ini - dikerjakan pada iterasi berikutnya. Gunakan Master Data / User Management untuk pengelolaan saat ini.
        </div>
      </div>
    </div>
  );
}

function RadiusSettings({ canEdit, email }) {
  const [values, setValues] = useState({ checkin_radius_meters: "", md_activity_radius_meters: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // key sedang disimpan, atau null
  const [err, setErr] = useState("");
  const [savedKey, setSavedKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_get_settings");
      if (error) throw error;
      setValues({
        checkin_radius_meters: data?.checkin_radius_meters ?? "",
        md_activity_radius_meters: data?.md_activity_radius_meters ?? "",
      });
    } catch (e) { setErr(e.message || "Gagal memuat setting"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(key) {
    const raw = values[key];
    const num = Number(raw);
    if (!raw || Number.isNaN(num) || num <= 0) { setErr("Radius harus angka lebih dari 0"); return; }
    setSaving(key); setErr(""); setSavedKey("");
    try {
      // p_caller_email: web tidak punya sesi Supabase Auth asli ke project
      // MartaHub (login lewat SandraHub) - auth.uid() di server SELALU null
      // utk panggilan web, jadi role diverifikasi lewat email sesi SandraHub
      // yang sudah nyata terautentikasi (pola sama dgn getMartaScope(email)).
      const { error } = await supabaseMarta.rpc("mh_set_setting", { p_key: key, p_value: num, p_caller_email: email });
      if (error) throw error;
      setSavedKey(key);
      setTimeout(() => setSavedKey(""), 2000);
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(null); }
  }

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Radius Validasi Lokasi</div>
      <div style={{ fontSize: 12, color: T.mid, marginBottom: 14, lineHeight: 1.5 }}>
        Dipakai untuk Check-In (evidence vs titik event Plan) dan validasi lokasi MD Activities (evidence pemasangan vs Site) - lihat MARTAHUB_ACTIVITY_USER_SPEC.md §0.2 &amp; §8.2. Dua radius ini independen satu sama lain.
      </div>
      {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 10 }}>{err}</div>}
      {loading ? (
        <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <RadiusField
            label="Radius Check-In (meter)"
            fieldKey="checkin_radius_meters"
            value={values.checkin_radius_meters}
            onChange={(v) => setValues((s) => ({ ...s, checkin_radius_meters: v }))}
            onSave={() => save("checkin_radius_meters")}
            saving={saving === "checkin_radius_meters"}
            saved={savedKey === "checkin_radius_meters"}
            canEdit={canEdit}
          />
          <RadiusField
            label="Radius POSM (meter)"
            fieldKey="md_activity_radius_meters"
            value={values.md_activity_radius_meters}
            onChange={(v) => setValues((s) => ({ ...s, md_activity_radius_meters: v }))}
            onSave={() => save("md_activity_radius_meters")}
            saving={saving === "md_activity_radius_meters"}
            saved={savedKey === "md_activity_radius_meters"}
            canEdit={canEdit}
          />
        </div>
      )}
      {!canEdit && !loading && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: T.lo }}>
          Hanya Head TMV, Brand TMV, SPM Sumatera, atau Admin yang bisa mengubah nilai ini.
        </div>
      )}
    </>
  );
}

function RadiusField({ label, value, onChange, onSave, saving, saved, canEdit }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: T.mid, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="number"
          min="1"
          value={value}
          disabled={!canEdit}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`,
            fontSize: 13, fontFamily: FONT, background: canEdit ? T.card : "#F0F2F5", color: T.hi,
          }}
        />
        {canEdit && (
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
              background: saved ? T.success : T.primary, color: "#fff", cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "..." : saved ? "Tersimpan" : "Simpan"}
          </button>
        )}
      </div>
    </div>
  );
}

// Bobot skor leaderboard - 4 bobot pertama menyusun "achievement_pct" (idealnya
// jumlah = 1), 3 bobot terakhir menyusun "final_score" dari achievement/produktivitas/geo
// (idealnya jumlah = 1 juga). Dipakai langsung oleh view mh_leaderboard_summary.
const WEIGHT_FIELDS = [
  { group: "Komposisi Achievement (per metrik target)", keys: [
    { key: "w_sp", label: "SP" },
    { key: "w_fwa", label: "FWA" },
    { key: "w_rebuy", label: "Rebuy" },
    { key: "w_revenue", label: "Revenue 3M" },
  ] },
  { group: "Komposisi Skor Akhir (final_score)", keys: [
    { key: "w_achievement", label: "Achievement" },
    { key: "w_productivity", label: "Produktivitas" },
    { key: "w_geo", label: "Geo Compliance" },
  ] },
];
const DEFAULT_WEIGHTS = { w_sp: 0.3, w_fwa: 0.3, w_rebuy: 0.2, w_revenue: 0.2, w_achievement: 0.6, w_productivity: 0.2, w_geo: 0.2 };

function LeaderboardWeightsSettings({ canEdit, email }) {
  const [values, setValues] = useState(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_get_settings");
      if (error) throw error;
      setValues({ ...DEFAULT_WEIGHTS, ...(data?.leaderboard_weights || {}) });
    } catch (e) { setErr(e.message || "Gagal memuat bobot"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function setField(key, raw) {
    setValues((s) => ({ ...s, [key]: raw }));
  }

  async function save() {
    const cleaned = {};
    for (const g of WEIGHT_FIELDS) for (const f of g.keys) {
      const n = Number(values[f.key]);
      if (Number.isNaN(n) || n < 0) { setErr(`Bobot ${f.label} harus angka >= 0`); return; }
      cleaned[f.key] = n;
    }
    setSaving(true); setErr(""); setSaved(false);
    try {
      const { error } = await supabaseMarta.rpc("mh_set_setting", {
        p_key: "leaderboard_weights", p_value: cleaned, p_caller_email: email,
      });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e.message || "Gagal menyimpan bobot"); }
    finally { setSaving(false); }
  }

  const sumOf = (keys) => keys.reduce((acc, f) => acc + (Number(values[f.key]) || 0), 0);

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Bobot Skor Leaderboard</div>
      <div style={{ fontSize: 12, color: T.mid, marginBottom: 14, lineHeight: 1.5 }}>
        Menentukan seberapa besar tiap metrik memengaruhi peringkat BME di halaman Leaderboard. Idealnya jumlah bobot dalam satu kelompok = 1 (100%).
      </div>
      {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 10 }}>{err}</div>}
      {loading ? (
        <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {WEIGHT_FIELDS.map((g) => (
            <div key={g.group}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                <span>{g.group}</span>
                <span style={{ color: Math.abs(sumOf(g.keys) - 1) < 0.001 ? T.success : T.warning }}>
                  Total: {sumOf(g.keys).toFixed(2)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${g.keys.length}, 1fr)`, gap: 12 }}>
                {g.keys.map((f) => (
                  <div key={f.key}>
                    <div style={{ fontSize: 11.5, color: T.mid, marginBottom: 4 }}>{f.label}</div>
                    <input
                      type="number" step="0.05" min="0" max="1"
                      value={values[f.key]}
                      disabled={!canEdit}
                      onChange={(e) => setField(f.key, e.target.value)}
                      style={{
                        width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`,
                        fontSize: 13, fontFamily: FONT, background: canEdit ? T.card : "#F0F2F5", color: T.hi,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {canEdit && (
            <div>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
                  background: saved ? T.success : T.primary, color: "#fff", cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "..." : saved ? "Tersimpan" : "Simpan Bobot"}
              </button>
            </div>
          )}
        </div>
      )}
      {!canEdit && !loading && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: T.lo }}>
          Hanya Head TMV, Brand TMV, SPM Sumatera, atau Admin yang bisa mengubah bobot ini.
        </div>
      )}
    </>
  );
}

// Jenis SP (dan produk lain seperti FWA ke depannya) beserta harga satuannya.
// Harga di sini dipakai untuk menghitung revenue yang digenerate tiap activity
// (lihat view mh_activity_revenue_summary) - TIDAK memengaruhi skor leaderboard.
function ProductTypesSettings({ canEdit, email }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ id: null, category: "sp", brand: "", name: "", unit_price: "", active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.from("mh_product_types").select("*").order("category").order("name");
      if (error) throw error;
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat jenis produk"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function edit(row) {
    setForm({ id: row.id, category: row.category, brand: row.brand || "", name: row.name, unit_price: String(row.unit_price), active: row.active });
  }
  function resetForm() {
    setForm({ id: null, category: "sp", brand: "", name: "", unit_price: "", active: true });
  }

  async function save() {
    const price = Number(form.unit_price);
    if (!form.category.trim() || !form.name.trim()) { setErr("Kategori dan nama wajib diisi"); return; }
    if (Number.isNaN(price) || price < 0) { setErr("Harga harus angka >= 0"); return; }
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_upsert_product_type", {
        p_id: form.id, p_category: form.category, p_brand: form.brand || null,
        p_name: form.name, p_unit_price: price, p_active: form.active, p_caller_email: email,
      });
      if (error) throw error;
      resetForm();
      await load();
    } catch (e) { setErr(e.message || "Gagal menyimpan jenis produk"); }
    finally { setSaving(false); }
  }

  async function toggleActive(row) {
    setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_set_product_type_active", {
        p_id: row.id, p_active: !row.active, p_caller_email: email,
      });
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || "Gagal mengubah status"); }
  }

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Jenis SP &amp; Daftar Harga</div>
      <div style={{ fontSize: 12, color: T.mid, marginBottom: 14, lineHeight: 1.5 }}>
        Daftar jenis produk (SP, dan ke depannya FWA) beserta harga satuan. Dipakai untuk menghitung revenue tiap activity, bukan untuk skor leaderboard.
      </div>
      {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 10 }}>{err}</div>}

      <div style={{ overflowX: "auto", marginBottom: canEdit ? 16 : 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
            {["Kategori", "Brand", "Nama", "Harga", "Status", ""].map((h) => (
              <th key={h} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada jenis produk.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 10px", textTransform: "uppercase", fontWeight: 700 }}>{r.category}</td>
                <td style={{ padding: "8px 10px", color: T.mid }}>{r.brand || "-"}</td>
                <td style={{ padding: "8px 10px" }}>{r.name}</td>
                <td style={{ padding: "8px 10px" }}>Rp{Number(r.unit_price).toLocaleString("id-ID")}</td>
                <td style={{ padding: "8px 10px", color: r.active ? T.success : T.lo }}>{r.active ? "Aktif" : "Nonaktif"}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  {canEdit && (
                    <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => edit(r)} style={linkBtn}>Edit</button>
                      <button onClick={() => toggleActive(r)} style={linkBtn}>{r.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 11.5, color: T.mid, marginBottom: 4 }}>Kategori</div>
            <input value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} placeholder="sp / fwa" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: T.mid, marginBottom: 4 }}>Brand</div>
            <input value={form.brand} onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))} placeholder="im3 / 3" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: T.mid, marginBottom: 4 }}>Nama</div>
            <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="SP 3GB" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: T.mid, marginBottom: 4 }}>Harga (Rp)</div>
            <input type="number" min="0" value={form.unit_price} onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))} placeholder="30000" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving} style={{
              padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700,
              background: T.primary, color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            }}>{saving ? "..." : form.id ? "Update" : "Tambah"}</button>
            {form.id && <button onClick={resetForm} style={linkBtn}>Batal</button>}
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: FONT };
const linkBtn = { background: "none", border: "none", color: T.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 };

function Row({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${T.line}`, fontSize: 12.5 }}>
      <span style={{ color: T.mid, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.hi, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13, fontFamily: FONT };
