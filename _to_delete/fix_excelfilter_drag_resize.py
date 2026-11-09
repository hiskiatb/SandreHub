import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/ExcelFilter.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "untuk setiap pop up filter ini, tambahkan opsi
# untuk drag tapi dibatasi di area yang terlihat saja untuk setiap sisinya,
# dan juga bisa di resize dengan sangat mudah"): drag & resize sebenernya
# udah ada sebelumnya, tapi (1) drag/resize ga pernah di-clamp ke viewport -
# popup bisa diseret/di-resize sampe KELUAR layar (ketutup/ilang), (2) hit
# area handle resize kecil banget (cuma garis 4px di tiap sisi, cuma pojok
# kanan-bawah yg agak gedean 10x10) - susah di-grab dgn presisi. Sekarang:
# - Drag: posisi akhir selalu di-clamp 8px dari tiap tepi viewport.
# - Resize: lebar/tinggi & posisi akhir SELALU di-clamp biar seluruh popup
#   tetep keliatan penuh di dalam viewport, ga peduli arah resize-nya.
# - Hit area tiap handle tepi diperbesar (4px -> 8px) & ditambah handle di
#   KEEMPAT pojok (dulu cuma "se") masing2 14x14, biar resize jauh lebih
#   gampang di-grab drpd cuma garis tipis.
old1 = '''      if (interaction.type === "drag") {
        setPos({ x: sPos.x + dx, y: sPos.y + dy });
      } else if (interaction.type === "resize") {
        let nW = sSize.w, nH = sSize.h, nX = sPos.x, nY = sPos.y;
        const dir = interaction.dir;

        if (dir.includes("e")) nW = Math.max(200, sSize.w + dx);
        if (dir.includes("s")) nH = Math.max(240, sSize.h + dy);
        if (dir.includes("w")) {
          const delta = Math.min(sSize.w - 200, dx);
          nW = sSize.w - delta; nX = sPos.x + delta;
        }
        if (dir.includes("n")) {
          const delta = Math.min(sSize.h - 240, dy);
          nH = sSize.h - delta; nY = sPos.y + delta;
        }
        setPos({ x: nX, y: nY });
        setSize({ w: nW, h: nH });
      }'''
assert s.count(old1) == 1
new1 = '''      if (interaction.type === "drag") {
        let nX = sPos.x + dx, nY = sPos.y + dy;
        // Clamp drag: popup selalu full keliatan di dalam viewport (margin 8px).
        nX = Math.max(8, Math.min(nX, window.innerWidth - sSize.w - 8));
        nY = Math.max(8, Math.min(nY, window.innerHeight - sSize.h - 8));
        setPos({ x: nX, y: nY });
      } else if (interaction.type === "resize") {
        let nW = sSize.w, nH = sSize.h, nX = sPos.x, nY = sPos.y;
        const dir = interaction.dir;

        if (dir.includes("e")) nW = Math.max(200, Math.min(sSize.w + dx, window.innerWidth - sPos.x - 8));
        if (dir.includes("s")) nH = Math.max(240, Math.min(sSize.h + dy, window.innerHeight - sPos.y - 8));
        if (dir.includes("w")) {
          const delta = Math.min(sSize.w - 200, dx);
          nW = sSize.w - delta; nX = sPos.x + delta;
          if (nX < 8) { nW -= (8 - nX); nX = 8; }
        }
        if (dir.includes("n")) {
          const delta = Math.min(sSize.h - 240, dy);
          nH = sSize.h - delta; nY = sPos.y + delta;
          if (nY < 8) { nH -= (8 - nY); nY = 8; }
        }
        setPos({ x: nX, y: nY });
        setSize({ w: nW, h: nH });
      }'''
assert s.count(new1) == 0
s = s.replace(old1, new1, 1)

old2 = '''      {/* Resize Handles */}
      <div onMouseDown={e => onMouseDown(e, "resize", "n")} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, cursor: "n-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "s")} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, cursor: "s-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "w")} style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, cursor: "w-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "e")} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 4, cursor: "e-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "se")} style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, cursor: "se-resize" }} />'''
assert s.count(old2) == 1
new2 = '''      {/* Resize Handles - edge hit-area diperbesar (4px -> 8px) & ditambah
          handle di KEEMPAT pojok (dulu cuma "se") biar resize gampang digrab */}
      <div onMouseDown={e => onMouseDown(e, "resize", "n")} style={{ position: "absolute", top: -2, left: 12, right: 12, height: 8, cursor: "n-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "s")} style={{ position: "absolute", bottom: -2, left: 12, right: 12, height: 8, cursor: "s-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "w")} style={{ position: "absolute", top: 12, bottom: 12, left: -2, width: 8, cursor: "w-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "e")} style={{ position: "absolute", top: 12, bottom: 12, right: -2, width: 8, cursor: "e-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "nw")} style={{ position: "absolute", top: -2, left: -2, width: 14, height: 14, cursor: "nw-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "ne")} style={{ position: "absolute", top: -2, right: -2, width: 14, height: 14, cursor: "ne-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "sw")} style={{ position: "absolute", bottom: -2, left: -2, width: 14, height: 14, cursor: "sw-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "se")} style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, cursor: "se-resize" }} />'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK excelfilter_drag_resize")
