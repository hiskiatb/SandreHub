const fs = require('fs');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const code = fs.readFileSync('app/dashboard/components/DSE_ProdAR.jsx', 'utf8');
try {
  babel.transform(code, { presets: [presetReact], filename: 'DSE_ProdAR.jsx' });
  console.log('PARSE_OK');
} catch (e) {
  console.error('PARSE_FAIL', e.message);
  process.exit(1);
}
