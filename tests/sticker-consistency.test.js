const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
global.window = {};
require(path.join(projectRoot, "src", "stickers.js"));

const packs = window.BAND_STICKER_PACKS || [];
const allowedExtensions = new Set([".webp", ".png", ".jpg", ".jpeg"]);
const errors = [];

function fail(message) {
  errors.push(message);
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath));
}

function hasPngSignature(buffer) {
  return (
    buffer.length > 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function getPngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function hasJpegSignature(buffer) {
  return buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function hasWebpSignature(buffer) {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

function assertSupportedImage(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const buffer = readFile(relativePath);

  if (buffer.length === 0) {
    fail(`${relativePath}: file is empty`);
    return;
  }

  if (extension === ".png" && !hasPngSignature(buffer)) {
    fail(`${relativePath}: invalid PNG signature`);
  }
  if ((extension === ".jpg" || extension === ".jpeg") && !hasJpegSignature(buffer)) {
    fail(`${relativePath}: invalid JPEG signature`);
  }
  if (extension === ".webp" && !hasWebpSignature(buffer)) {
    fail(`${relativePath}: invalid WebP signature`);
  }
}

if (packs.length === 0) {
  fail("No sticker packs registered");
}

const packIds = new Set();
const stickerIds = new Set();

for (const pack of packs) {
  if (!pack.id || !pack.title || !Array.isArray(pack.stickers)) {
    fail(`Invalid pack shape: ${JSON.stringify(pack)}`);
    continue;
  }

  if (packIds.has(pack.id)) {
    fail(`Duplicate pack id: ${pack.id}`);
  }
  packIds.add(pack.id);

  for (const sticker of pack.stickers) {
    if (!sticker.id || !sticker.title || !sticker.path || !sticker.smallPath) {
      fail(`${pack.id}: invalid sticker shape: ${JSON.stringify(sticker)}`);
      continue;
    }

    if (stickerIds.has(sticker.id)) {
      fail(`Duplicate sticker id: ${sticker.id}`);
    }
    stickerIds.add(sticker.id);

    for (const key of ["path", "smallPath"]) {
      const filePath = sticker[key];
      const extension = path.extname(filePath).toLowerCase();

      if (!allowedExtensions.has(extension)) {
        fail(`${sticker.id}: unsupported ${key} extension: ${filePath}`);
        continue;
      }

      if (!fs.existsSync(path.join(projectRoot, filePath))) {
        fail(`${sticker.id}: missing ${key}: ${filePath}`);
        continue;
      }

      assertSupportedImage(filePath);
    }

    const smallBuffer = readFile(sticker.smallPath);
    if (!hasPngSignature(smallBuffer)) {
      fail(`${sticker.id}: smallPath must be PNG: ${sticker.smallPath}`);
      continue;
    }

    const size = getPngSize(smallBuffer);
    if (size.width !== 128 || size.height !== 128) {
      fail(`${sticker.id}: smallPath must be 128x128, got ${size.width}x${size.height}`);
    }
  }
}

const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
const docs = fs.readFileSync(path.join(projectRoot, "docs", "index.html"), "utf8");

for (const pack of packs) {
  if (!readme.includes(pack.title)) {
    fail(`README.md does not mention pack: ${pack.title}`);
  }
  if (!docs.includes(pack.title)) {
    fail(`docs/index.html does not mention pack: ${pack.title}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Sticker consistency OK: ${packs.length} packs, ${stickerIds.size} stickers`);
