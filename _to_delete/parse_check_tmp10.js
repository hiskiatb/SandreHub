const parser = require("@babel/parser");
const fs = require("fs");
const code = fs.readFileSync(process.argv[2], "utf-8");
parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
console.log("PARSE_OK");
