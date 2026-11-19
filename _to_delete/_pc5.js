const babel = require("@babel/core");
const fs = require("fs");
["app/dashboard/page.jsx","app/dashboard/components/PNL_FormPendapatanV2.jsx"].forEach((file) => {
  const code = fs.readFileSync(file, "utf8");
  try {
    babel.transform(code, { presets: ["next/babel"], filename: file });
    console.log(file, "PARSE_OK");
  } catch (e) {
    console.log(file, "PARSE_FAIL:", e.message);
  }
});
