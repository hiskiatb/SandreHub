const babel = require("@babel/core");
try {
  babel.transformFileSync("app/dashboard/components/PNL_V2Shared.jsx", { presets: ["next/babel"], filename: "app/dashboard/components/PNL_V2Shared.jsx" });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
