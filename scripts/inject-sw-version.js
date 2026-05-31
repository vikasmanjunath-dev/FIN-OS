#!/usr/bin/env node
/**
 * inject-sw-version.js
 * Stamps the current git SHA into sw.js as __CACHE_VERSION__ before deploy.
 * Run via: node scripts/inject-sw-version.js
 * Or add to package.json: "prebuild": "node scripts/inject-sw-version.js"
 */
const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

const swPath = path.join(__dirname, '..', 'sw.js');

let sha;
try {
  sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  sha = Date.now().toString(36);  // fallback when git not available
}

const version   = `finos-${sha}`;
let   swContent = fs.readFileSync(swPath, 'utf8');

// Replace the __CACHE_VERSION__ reference or the fallback string
swContent = swContent.replace(
  /typeof __CACHE_VERSION__ !== 'undefined'\) \? __CACHE_VERSION__ : '[^']+'/,
  `typeof __CACHE_VERSION__ !== 'undefined') ? __CACHE_VERSION__ : '${version}'`
);

fs.writeFileSync(swPath, swContent);
console.log(`✅ sw.js cache version stamped: ${version}`);
