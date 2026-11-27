path = "PNL_FormPengeluaranV2.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new, n)

OLD = '{showDepoManager && <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />}'

NEW = '''{showDepoManager && (
                    <div
                      onClick={() => setShowDepoManager(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    >
                      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, maxHeight: "86vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
                        <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />
                      </div>
                    </div>
                  )}'''

do(OLD, NEW, n=2, label="Kelola Depo -> modal popup")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK: patch applied")
