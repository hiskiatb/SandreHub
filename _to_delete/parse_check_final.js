const babel = require("@babel/core");
const fs = require("fs");
const file = process.argv[2];
const code = fs.readFileSync(file, "utf-8");
try {
  babel.parse(code, { presets: ["next/babel"], filename: file, sourceType: "unambiguous" });
  console.log("PARSE_OK", file);
} catch (e) {
  console.error("PARSE_FAIL", file, e.message);
  process.exit(1);
}
