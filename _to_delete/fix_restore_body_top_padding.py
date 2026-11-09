import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()
old = '''                <div style={{ overflowY: "auto", padding: "0 18px 14px", flex: 1 }}>'''
assert s.count(old) == 1
new = '''                <div style={{ overflowY: "auto", padding: "12px 18px 14px", flex: 1 }}>'''
s = s.replace(old, new, 1)
with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK restore_padding")
