const babel = require("@babel/core");
const fs = require("fs");
for (const f of [
  "app/dashboard/components/PNL_PivotSummary.jsx",
  "app/dashboard/components/PNL_ControlCenter.jsx",
]) {
  try {
    babel.parse(fs.readFileSync(f, "utf8"), { presets: ["next/babel"], filename: f });
    console.log(f, "PARSE OK");
  } catch (e) {
    console.log(f, "PARSE FAIL", e.message);
  }
}
