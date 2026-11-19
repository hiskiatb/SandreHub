const babel = require("@babel/core");
try {
  babel.transformFileSync("app/dashboard/components/PNL_DataProvidedBulkUpload.jsx", { presets: ["next/babel"], filename: "app/dashboard/components/PNL_DataProvidedBulkUpload.jsx" });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
