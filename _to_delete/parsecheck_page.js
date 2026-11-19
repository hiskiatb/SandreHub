const babel = require("@babel/core");
try {
  babel.transformFileSync("app/dashboard/page.jsx", { presets: ["next/babel"], filename: "app/dashboard/page.jsx" });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
