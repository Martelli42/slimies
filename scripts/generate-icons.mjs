/**
 * Renders the app icons.
 *
 * Writing a tiny PNG encoder here keeps the repo free of binary assets that
 * nobody can regenerate: `npm run icons` reproduces every icon from this one
 * file. The mark is an original ascending chevron stack over a dark field.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(HERE, "../public/icons");

const INK = [0x04, 0x05, 0x0a];
const ACCENT = [0x7c, 0x6c, 0xff];
const BEAM = [0x3f, 0xe0, 0xff];

/* ------------------------------------------------------------------ PNG ---- */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** `pixels` is RGBA, row-major, length = size * size * 4. */
function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- drawing -- */

const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * Coverage of a chevron stroke: an upward "^" whose apex sits at `apexY`, with
 * arms running out to `halfWidth`. `aa` is one pixel expressed in the same
 * normalised units, which is what gives the edges their antialiasing.
 */
function chevronCoverage(x, y, apexY, halfWidth, thickness, aa) {
  const dx = Math.abs(x);
  if (dx > halfWidth) return 0;

  const slope = 0.9;
  const lineY = apexY + dx * slope;
  // Perpendicular distance to the arm, not vertical distance.
  const distance = Math.abs(y - lineY) / Math.hypot(1, slope);
  return clamp01((thickness - distance) / aa + 0.5);
}

function renderIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  // Maskable icons must keep their mark inside the safe circle.
  const scale = maskable ? size / 1.5 : size / 1.05;
  const aa = 1.4 / scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - center) / scale;
      const ny = (y + 0.5 - center) / scale;

      // Background: dark field lit from the upper left.
      const glow = clamp01(1 - Math.hypot(nx + 0.16, ny + 0.22) * 1.6);
      let colour = mix(INK, ACCENT, glow * 0.45);

      // Two stacked chevrons — ascent, rendered brightest at the top.
      const lower = chevronCoverage(nx, ny + 0.04, 0.06, 0.34, 0.055, aa);
      const upper = chevronCoverage(nx, ny + 0.04, -0.20, 0.34, 0.055, aa);

      if (lower > 0) colour = mix(colour, mix(ACCENT, INK, 0.15), lower * 0.85);
      if (upper > 0) colour = mix(colour, mix(BEAM, [255, 255, 255], 0.35), upper);

      // Rounded-square silhouette so the icon reads without a platform mask.
      const edge = roundedSquare(nx, ny, 0.46, 0.14);
      const alpha = maskable ? 1 : clamp01(-edge / aa + 0.5);

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(colour[0]);
      pixels[offset + 1] = Math.round(colour[1]);
      pixels[offset + 2] = Math.round(colour[2]);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, pixels);
}

/** Signed distance to a rounded square centred on the origin. */
function roundedSquare(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/* ------------------------------------------------------------------ write -- */

mkdirSync(ICONS_DIR, { recursive: true });

const outputs = [
  ["icon-192.png", renderIcon(192)],
  ["icon-512.png", renderIcon(512)],
  ["icon-maskable-512.png", renderIcon(512, { maskable: true })],
  ["apple-touch-icon.png", renderIcon(180, { maskable: true })],
  ["favicon-32.png", renderIcon(32)],
];

for (const [name, buffer] of outputs) {
  writeFileSync(resolve(ICONS_DIR, name), buffer);
  console.log(`wrote public/icons/${name} (${buffer.length} bytes)`);
}

// Next.js picks this up automatically as the tab icon.
writeFileSync(resolve(HERE, "../src/app/icon.png"), renderIcon(64));
console.log("wrote src/app/icon.png");
