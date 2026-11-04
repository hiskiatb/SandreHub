const fs = require("fs");
const parser = require("@babel/parser");
const code = fs.readFileSync("app/dashboard/components/DSE_ProdAR.jsx", "utf8");
try {
  parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  console.log("PARSE_OK");
} catch (e) {
  console.log("PARSE_ERROR: " + e.message);
}
