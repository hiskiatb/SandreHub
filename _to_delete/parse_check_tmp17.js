const babel = require("@babel/core");
const fs = require("fs");
const file = process.argv[1];
const code = fs.readFileSync(file, "utf-8");
try {
  babel.parse(code, {
    presets: ["next/babel"],
    filename: file,
  });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL", e.message);
  process.exit(1);
}
