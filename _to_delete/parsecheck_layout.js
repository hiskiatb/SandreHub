const babel = require("@babel/core");
try {
  babel.transformFileSync("app/layout.js", { presets: ["next/babel"], filename: "app/layout.js" });
  console.log("PARSE_OK");
} catch (e) {
  console.error("PARSE_FAIL:", e.message);
  process.exit(1);
}
