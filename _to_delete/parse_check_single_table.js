const parser = require("@babel/parser");
const fs = require("fs");
const code = fs.readFileSync("app/dashboard/components/DSE_ProdAR.jsx", "utf8");
try {
  parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL", e.message);
  process.exit(1);
}
