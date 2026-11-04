const fs = require("fs");
const parser = require("@babel/parser");
const code = fs.readFileSync("app/dashboard/page.jsx", "utf8");
try {
  parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  console.log("PARSE_OK");
} catch (e) {
  console.log("PARSE_ERROR: " + e.message);
}
