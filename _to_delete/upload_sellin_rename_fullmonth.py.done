path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# UPDATE (permintaan user - "ubah upload data sellin, jadi upload data
# pembanding dan ini hanya ada di fullmonth"): label tombol diganti jadi
# "Upload Data Pembanding" (lebih jelas fungsinya = banding data app vs
# Sell-in upload), DAN tombolnya cuma muncul di periodMode === "bulan"
# (Full Month) - sama kayak tombol "Bandingkan Data" di sebelahnya yg
# emang konsepnya cuma relevan utk Full Month.
do(
    '                <button onClick={() => setSellinCompareOpen(true)} title="Upload file DSE PROD (IM3 & 3ID) & bandingkan dgn penjualan di app"\n'
    '                  style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>\n'
    '                  <Upload size={13} /> {width >= 700 && "Upload Sellin DSE"}\n'
    '                </button>\n',

    '                {periodMode === "bulan" && (\n'
    '                  <button onClick={() => setSellinCompareOpen(true)} title="Upload data pembanding (Sell-in S100 IM3 & 3ID) & bandingkan dgn penjualan di app"\n'
    '                    style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>\n'
    '                    <Upload size={13} /> {width >= 700 && "Upload Data Pembanding"}\n'
    '                  </button>\n'
    '                )}\n',
    label="tombol Upload Sellin DSE -> Upload Data Pembanding (hanya Full Month)",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - tombol diganti jadi 'Upload Data Pembanding' & cuma muncul di Full Month")
