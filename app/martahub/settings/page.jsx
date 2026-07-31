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

// Role yang boleh mengubah setting radius (lihat mh_set_setting di database —
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
          Supabase MartaHub belum dikonfigurasi (env <code>NEXT_PUBLIC_MARTA_SUPABASE_URL</code> / project paused) — beberapa fitur tidak akan berfungsi.
        </div>
      )}
      {err && <div style={{ ...card, gridColumn: "1 / -1", borderColor: T.error, background: T.errorBg, color: T.error }}>{err}</div>}

      {/* Akun */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Akun</div>
        <Row label="Email" value={email || "—"} />
        <Row label="Login via" value="SandraHub (auth gate bersama)" />
        <Row label="Role akses admin panel" value={profile?.role || "—"} />
      </div>

      {/* Scope MartaHub */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Scope Data MartaHub</div>
        {loading ? (
          <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
        ) : !scope || !scope.found ? (
          <div style={{ fontSize: 12.5, color: T.warning }}>Email ini belum terdaftar sebagai profil di <code>mh_profiles</code> — dashboard/monitoring akan tampil kosong sampai ditambahkan Admin MartaHub.</div>
        ) : (
          <>
            <Row label="Nama" value={scope.fullName || "—"} />
            <Row label="Role MartaHub" value={ROLE_LABEL[scope.role] || scope.role || "—"} />
            <Row label="Cakupan" value={scope.unscoped ? "Semua Region × Brand" : `${regionLabel(scope.region)} · ${(scope.brand || "—").toUpperCase()}`} />
            {scope.branchName && <Row label="Cabang" value={scope.branchName} />}
          </>
        )}
      </div>

      {/* Radius Validasi — §0.2 Lapis 1 (Check-In) & §8.2 poin 7 (MD Activities) */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <RadiusSettings canEdit={CAN_EDIT_SETTINGS_ROLES.includes(scope?.role)} email={email} />
      </div>

      {/* Tentang sistem */}
      <div style={{ ...card, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Tentang Sistem</div>
        <Row label="Modul" value="MartaHub — Admin & TMV Console" />
        <Row label="Sumber data" value="Supabase (mh_activities, mh_profiles, mh_branches, mh_assignments)" last />
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 9, background: "#F0F4FA", fontSize: 12, color: T.mid, lineHeight: 1.5 }}>
          Pengaturan RBAC penuh (kelola role/region/brand per pengguna) belum tersedia di halaman ini — dikerjakan pada iterasi berikutnya. Gunakan Master Data / User Management untuk pengelolaan saat ini.
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
      // MartaHub (login lewat SandraHub) — auth.uid() di server SELALU null
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
        Dipakai untuk Check-In (evidence vs titik event Plan) dan validasi lokasi MD Activities (evidence pemasangan vs Site) — lihat MARTAHUB_ACTIVITY_USER_SPEC.md §0.2 &amp; §8.2. Dua radius ini independen satu sama lain.
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
            label="Radius POSMAT (meter)"
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

function Row({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${T.line}`, fontSize: 12.5 }}>
      <span style={{ color: T.mid, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.hi, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13, fontFamily: FONT };
