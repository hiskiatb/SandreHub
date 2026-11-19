const babel = require("@babel/core");
try {
  babel.transformFileSync("app/dashboard/components/DSE_ControlCenter.jsx", {
    presets: ["next/babel"],
    filename: "app/dashboard/components/DSE_ControlCenter.jsx",
  });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
