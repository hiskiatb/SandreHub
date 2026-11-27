p = "app/dashboard/components/PNL_DepoManager.jsx"
s = open(p).read()

def do(old, new, n, label):
    c = s_holder["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    s_holder["s"] = s_holder["s"].replace(old, new)

s_holder = {"s": s}

# 1) Import ChevronDown utk selector Area.
old_import = '''import { Building2, GripVertical, Info, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X } from "lucide-react";'''
new_import = '''import { Building2, ChevronDown, GripVertical, Info, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X } from "lucide-react";'''
do(old_import, new_import, 1, "import ChevronDown")

# 2) State areaFilter - default ikut Area aktif (contextBranch), tapi
#    bisa diganti bebas ke Area lain / "Semua Area" (permintaan user -
#    "seharusnya bisa pilih area atau susun untuk semua area gitu,
#    karena ini login di level masing-masing partner" - 1 Partner bisa
#    punya District di lebih dari 1 Area, jadi Kelola Depo ga boleh
#    terkunci cuma ke 1 Area yg kebetulan lagi aktif di filter atas).
old_anchor = '''  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});'''
new_anchor = '''  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

  // "" = Semua Area (tampilkan District dari SEMUA Area milik Partner
  // ini sekaligus, dikelompokkan per Area) - default ikut Area yg lagi
  // aktif di filter halaman supaya tetap familiar, tapi user bebas ganti.
  const [areaFilter, setAreaFilter] = useState(contextBranch || "");
  const allAreas = useMemo(() => {
    const seen = new Set();
    const list = [];
    (mcList || []).forEach((m) => {
      const b = m.branch || "";
      if (!b || seen.has(b)) return;
      seen.add(b);
      list.push(b);
    });
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [mcList]);'''
do(old_anchor, new_anchor, 1, "areaFilter state")

# 3) unassigned & unassignedBranches pakai areaFilter, bukan contextBranch.
old_unassigned = '''  const unassigned = useMemo(
    () => (mcList || []).filter((m) => !assignedMcSet.has(m.mc) && (!contextBranch || m.branch === contextBranch)),
    [mcList, assignedMcSet, contextBranch],
  );'''
new_unassigned = '''  const unassigned = useMemo(
    () => (mcList || []).filter((m) => !assignedMcSet.has(m.mc) && (!areaFilter || m.branch === areaFilter)),
    [mcList, assignedMcSet, areaFilter],
  );'''
do(old_unassigned, new_unassigned, 1, "unassigned areaFilter")

old_branches = '''    list.sort((a, b) => a.localeCompare(b));
    if (contextBranch && list.includes(contextBranch)) {
      return [contextBranch, ...list.filter((b) => b !== contextBranch)];
    }
    return list;
  }, [unassigned, contextBranch]);'''
new_branches = '''    list.sort((a, b) => a.localeCompare(b));
    if (areaFilter && list.includes(areaFilter)) {
      return [areaFilter, ...list.filter((b) => b !== areaFilter)];
    }
    return list;
  }, [unassigned, areaFilter]);'''
do(old_branches, new_branches, 1, "unassignedBranches areaFilter")

# 4) Badge statis "Area {contextBranch}" di header diganti jadi dropdown
#    beneran (Semua Area / per Area) yg mengontrol areaFilter.
old_header_badge = '''            {contextBranch && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "3px 10px" }}>
                Area {contextBranch}
              </span>
            )}'''
new_header_badge = '''            {allAreas.length > 0 && (
              <div style={{ position: "relative", display: "inline-flex" }}>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  title="Pilih Area yang ditampilkan di kolom &ldquo;Belum Masuk Depo&rdquo;"
                  style={{
                    appearance: "none", WebkitAppearance: "none",
                    fontSize: 10.5, fontWeight: 700, color: t.blue, background: t.blueBg,
                    border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "3px 24px 3px 10px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <option value="">Semua Area</option>
                  {allAreas.map((a) => <option key={a} value={a}>Area {a}</option>)}
                </select>
                <div style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", color: t.blue, pointerEvents: "none", display: "flex" }}>
                  <ChevronDown size={11} />
                </div>
              </div>
            )}'''
do(old_header_badge, new_header_badge, 1, "header area selector")

# 5) Label "Belum Masuk Depo" & pesan kosong ikut areaFilter (bukan
#    contextBranch) - kalau areaFilter "" (Semua Area), label jadi polos
#    tanpa suffix Area, krn memang nampilin semua.
old_label = '''            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Belum Masuk Depo{contextBranch ? ` · ${contextBranch}` : ""} ({unassigned.length})
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>
                Semua District{contextBranch ? ` di Area ${contextBranch}` : ""} sudah masuk ke salah satu Depo di rencana.
              </div>'''
new_label = '''            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Belum Masuk Depo{areaFilter ? ` · ${areaFilter}` : " · Semua Area"} ({unassigned.length})
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>
                Semua District{areaFilter ? ` di Area ${areaFilter}` : ""} sudah masuk ke salah satu Depo di rencana.
              </div>'''
do(old_label, new_label, 1, "pool label areaFilter")

open(p, "w").write(s_holder["s"])
print("PATCH_OK")
