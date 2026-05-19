// Bundle src/main.js for jsdom — outputs to verify/bundle.js
const { execSync } = require('child_process');
const path = require('path');
const proj = path.resolve(__dirname, '..');
const esbuild = path.join(proj, 'node_modules', 'esbuild', 'bin', 'esbuild');
const cmd = `node "${esbuild}" "${path.join(proj,'src','main.js')}" --bundle --format=iife --loader:.css=empty --outfile="${path.join(proj,'verify','bundle.js')}" --target=es2020 --log-level=warning`;
console.log('Bundling...');
execSync(cmd, { stdio: 'inherit' });
console.log('Bundle written to verify/bundle.js');
