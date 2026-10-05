"use client";
/**
 * /fitrahub/m/users - User Management FitraHub.
 * Daftar seluruh user (via RPC fh_list_users, digerbangi role superadmin
 * di sisi DB) + aksi approve/ubah role-status per user (via RPC
 * fh_update_user_role). Siapa pun yang authState-nya 'active' boleh MELIHAT
 * halaman ini (backend tetap menggerbangi siapa yang datanya benar-benar
 * kepulang/bisa diubah - non-admin akan melihat list kosong & aksi approve
 * gagal dgn pesan jelas).
 */
import { useEffect, useState, useMemo } from "react";
import { Search, ShieldCheck, Clock, ShieldOff, ChevronRight, X, Loader2, RefreshCw, Users2 } from "lucide-react";
import MobileShell, { useFitraSession, ShellSpinner, FF, ACCENT } from "../_shared/MobileShell";
import { listFitraUsers, updateFitraUserRole } from "../../../../lib/fitraScope";

const ROLE_LABEL = { pending: "Pending", staff: "Staff", finance_admin: "Finance Admin", superadmin: "Superadmin" };
const STATUS_META = {
  pending: { label: "Pending", color: "#B45309", bg: "rgba(180,83,9,0.10)", Icon: Clock },
  active:  { label: "Active",  color: "#15803D", bg: "rgba(21,128,61,0.10)", Icon: ShieldCheck },
  revoked: { label: "Revoked", color: "#DC2626", bg: "rgba(220,38,38,0.10)", Icon: ShieldOff },
};
const ROLE_OPTIONS = ["pending", "staff", "finance_admin", "superadmin"];
const STATUS_OPTIONS = ["pending", "active", "revoked"];

function initials(nameOrEmail) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.Icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 800 }}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const isAdmin = role === "superadmin";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999,
      background: isAdmin ? "rgba(237,28,36,0.12)" : "#F0F1F3",
      color: isAdmin ? ACCENT : "#5A5A68", fontSize: 11, fontWeight: 800,
    }}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

function UserCard({ user, onTap }) {
  return (
    <button onClick={() => onTap(user)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      padding: "14px 15px", borderRadius: 16, background: "#FFFFFF", border: "1px solid #EDEEF1",
      boxShadow: "0 1px 4px rgba(23,24,28,0.04)", cursor: "pointer", fontFamily: FF,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800,
      }}>
        {initials(user.full_name || user.email)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.full_name || user.email}
        </div>
        <div style={{ fontSize: 11.5, color: "#9A9AA6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
          {user.email}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
          <RoleBadge role={user.role} />
          <StatusPill status={user.status} />
          {(user.region || user.branch) && (
            <span style={{ fontSize: 11, color: "#B0B0BA", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
              {[user.branch, user.region].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} color="#C4C4CE" style={{ flexShrink: 0 }} />
    </button>
  );
}

function EditUserSheet({ user, onClose, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const updated = await updateFitraUserRole(user.email, role, status);
      onSaved(updated);
    } catch (e) {
      setErr(e.message || "Gagal menyimpan. Anda mungkin bukan Superadmin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FF }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(23,24,28,0.45)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "relative", width: "100%", maxWidth: 480, boxSizing: "border-box",
        background: "#FFFFFF", borderRadius: "24px 24px 0 0",
        padding: "22px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        boxShadow: "0 -10px 32px rgba(17,17,20,0.16)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C" }}>{user.full_name || user.email}</div>
            <div style={{ fontSize: 12, color: "#9A9AA6", marginTop: 2 }}>{user.email}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96", padding: 4 }}><X size={18} /></button>
        </div>

        {err && (
          <div style={{ marginTop: 14, padding: "10px 13px", borderRadius: 11, background: "#FDECEC", border: "1px solid #F5C2C2", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
        )}

        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8A96" }}>Role</label>
          <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {ROLE_OPTIONS.map((r) => (
              <button key={r} onClick={() => setRole(r)} style={{
                padding: "8px 13px", borderRadius: 11, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF,
                border: role === r ? "1.5px solid #ED1C24" : "1.5px solid #E4E5EA",
                background: role === r ? "rgba(237,28,36,0.08)" : "#FFFFFF",
                color: role === r ? "#ED1C24" : "#5A5A68",
              }}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8A96" }}>Status</label>
          <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((s) => {
              const meta = STATUS_META[s];
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding: "8px 13px", borderRadius: 11, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF,
                  border: status === s ? `1.5px solid ${meta.color}` : "1.5px solid #E4E5EA",
                  background: status === s ? meta.bg : "#FFFFFF",
                  color: status === s ? meta.color : "#5A5A68",
                }}>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          style={{ marginTop: 24, width: "100%", height: 50, borderRadius: 13, border: "none", cursor: saving ? "default" : "pointer",
            background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(237,28,36,0.18)" }}>
          {saving ? <Loader2 size={16} style={{ animation: "fhspin .85s linear infinite" }} /> : "Simpan Perubahan"}
        </button>
      </div>
    </div>
  );
}

export default function FitraUsersPage() {
  const { loading: sessionLoading } = useFitraSession();
  const [users, setUsers] = useState(null); // null = belum dimuat
  const [loadErr, setLoadErr] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    listFitraUsers()
      .then((rows) => { if (alive) { setLoadErr(""); setUsers(rows); } })
      .catch((e) => { if (alive) { setLoadErr(e.message || "Gagal memuat daftar user."); setUsers([]); } });
    return () => { alive = false; };
  }, [sessionLoading, refreshKey]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const v = q.trim().toLowerCase();
    if (!v) return users;
    return users.filter((u) =>
      (u.full_name || "").toLowerCase().includes(v) ||
      (u.email || "").toLowerCase().includes(v)
    );
  }, [users, q]);

  const counts = useMemo(() => {
    const c = { pending: 0, active: 0, revoked: 0 };
    for (const u of users || []) c[u.status] = (c[u.status] || 0) + 1;
    return c;
  }, [users]);

  if (sessionLoading) return <ShellSpinner />;

  return (
    <MobileShell active="users">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 4px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8A96" }}>FitraHub</div>
        <h1 style={{ marginTop: 4, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#17181C" }}>User Management</h1>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 13, background: "rgba(180,83,9,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#B45309" }}>{counts.pending || 0}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#B45309" }}>Pending</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 13, background: "rgba(21,128,61,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#15803D" }}>{counts.active || 0}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#15803D" }}>Active</div>
          </div>
          <div style={{ flex: 1, padding: "10px 12px", borderRadius: 13, background: "rgba(220,38,38,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#DC2626" }}>{counts.revoked || 0}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#DC2626" }}>Revoked</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 13px", borderRadius: 13, background: "#FFFFFF", border: "1.5px solid #ECEDF0", marginTop: 14 }}>
          <Search size={15} color="#9A9AA6" style={{ flexShrink: 0 }} />
          <input type="text" placeholder="Cari nama atau email..." value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 13.5, fontWeight: 500, color: "#17181C", fontFamily: FF }} />
          <button onClick={() => setRefreshKey((k) => k + 1)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9AA6", display: "flex" }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {users === null && (
          <div style={{ padding: "40px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Loader2 size={22} color="#9A9AA6" style={{ animation: "fhspin .85s linear infinite" }} />
            <span style={{ fontSize: 12.5, color: "#9A9AA6", fontWeight: 600 }}>Memuat daftar user...</span>
          </div>
        )}

        {loadErr && (
          <div style={{ padding: "11px 14px", borderRadius: 12, background: "#FDECEC", border: "1px solid #F5C2C2", color: "#C62828", fontSize: 12.5, fontWeight: 600, textAlign: "center" }}>{loadErr}</div>
        )}

        {users !== null && users.length === 0 && !loadErr && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <Users2 size={30} color="#C4C4CE" style={{ margin: "0 auto" }} />
            <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#5A5A68" }}>Belum ada user, atau Anda belum punya akses Superadmin</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#9A9AA6" }}>Daftar ini hanya terlihat penuh oleh Superadmin FitraHub.</div>
          </div>
        )}

        {filtered.map((u) => (
          <UserCard key={u.id} user={u} onTap={setEditing} />
        ))}

        {users !== null && users.length > 0 && filtered.length === 0 && (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12.5, color: "#9A9AA6" }}>Tidak ada hasil untuk &quot;{q}&quot;</div>
        )}
      </div>

      {editing && (
        <EditUserSheet
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setUsers((prev) => prev.map((u) => (u.email === updated.email ? updated : u)));
            setEditing(null);
          }}
        />
      )}
    </MobileShell>
  );
}
