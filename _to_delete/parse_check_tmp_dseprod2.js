const babel = require("@babel/core");
const fs = require("fs");
const file = process.argv[2];
const code = fs.readFileSync(file, "utf8");
try {
  babel.transform(code, { filename: file, presets: ["next/babel"] });
  console.log("PARSE_OK");
} catch (e) {
  console.log("PARSE_ERROR");
  console.log(e.message);
}
