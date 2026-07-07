const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

if (manifest.manifest_version !== 3) {
  fail("Extension must use Manifest V3");
}

if (manifest.permissions && manifest.permissions.length > 0) {
  fail(`Unexpected broad permissions: ${manifest.permissions.join(", ")}`);
}

if (manifest.host_permissions && manifest.host_permissions.length > 0) {
  fail(`Unexpected host permissions: ${manifest.host_permissions.join(", ")}`);
}

const expectedMatch = "https://band.wb.ru/*";
for (const script of manifest.content_scripts || []) {
  const matches = script.matches || [];
  if (matches.length !== 1 || matches[0] !== expectedMatch) {
    fail(`Content script must be limited to ${expectedMatch}`);
  }
}

for (const resource of manifest.web_accessible_resources || []) {
  const matches = resource.matches || [];
  if (matches.length !== 1 || matches[0] !== expectedMatch) {
    fail(`Web accessible resources must be limited to ${expectedMatch}`);
  }
}

const manifestText = read("manifest.json");
if (/https?:\/\/(?!band\.wb\.ru\/\*)/i.test(manifestText)) {
  fail("manifest.json must not grant access to external HTTP(S) origins");
}

for (const sourcePath of ["src/content.js", "src/stickers.js"]) {
  const source = read(sourcePath);
  const forbiddenPatterns = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /document\.write\s*\(/,
    /innerHTML\s*=\s*[^;\n]*(?:sticker|pack|title|path)/i,
    /fetch\s*\(\s*["'`]https?:\/\//i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      fail(`${sourcePath}: forbidden security-sensitive pattern ${pattern}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Security checks OK");
