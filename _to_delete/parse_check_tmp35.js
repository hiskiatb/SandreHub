const parser = require("@babel/parser");
const fs = require("fs");
const file = process.argv[2];
const code = fs.readFileSync(file, "utf-8");
try {
  parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
