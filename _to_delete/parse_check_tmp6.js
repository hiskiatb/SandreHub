const fs = require('fs');
const babel = require('@babel/core');
const file = process.argv[1];
const code = fs.readFileSync(file, 'utf8');
try {
  babel.transformSync(code, { filename: file, presets: ["next/babel"] });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
