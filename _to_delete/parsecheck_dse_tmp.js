const babel = require("@babel/core");
const fs = require("fs");
const f = "app/dashboard/components/DSE_ProdAR.jsx";
try {
  babel.parse(fs.readFileSync(f, "utf8"), { presets: ["next/babel"], filename: f });
  console.log(f, "PARSE OK");
} catch (e) { console.log(f, "PARSE FAIL", e.message); }
