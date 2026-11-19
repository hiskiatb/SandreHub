const babel = require("@babel/core");
const files = ["app/dashboard/components/PNL_V2Shared.jsx", "app/dashboard/components/PNL_FormPendapatanV2.jsx"];
let ok = true;
for (const f of files) {
  try { babel.transformFileSync(f, { presets: ["next/babel"], filename: f }); console.log("PARSE_OK:", f); }
  catch (e) { console.error("PARSE_FAIL:", f, e.message); ok = false; }
}
process.exit(ok ? 0 : 1);
