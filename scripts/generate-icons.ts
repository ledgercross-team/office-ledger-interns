/**
 * Generates every raster icon + the default Open Graph image from one SVG logo.
 * Usage: pnpm icons
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const BRAND = "#4256d6";
const mark = (stroke = "#fff") =>
  `<path d="M10 8.5v15h12" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 13.5h7M15 18.5h5" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>`;
const logo = (size: number, rx = 9) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="${rx}" fill="${BRAND}"/>${mark()}</svg>`,
  );
// Maskable: full-bleed background, mark inside the 80% safe zone.
const maskable = (size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BRAND}"/><g transform="translate(5.6 5.6) scale(0.65)">${mark()}</g></svg>`,
  );

const png = (svg: Buffer, size: number) =>
  sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO container holding PNG images (supported by every modern browser). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images.map((i) => i.data)]);
}

const og =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef1ff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#dfe3f3" stroke-width="1"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#grid)" opacity=".7"/>
  <g transform="translate(96 96) scale(3)"><rect width="32" height="32" rx="9" fill="${BRAND}"/>${mark()}</g>
  <text x="96" y="300" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="72" font-weight="700" fill="#181c2e">Office Ledger</text>
  <text x="96" y="370" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" fill="#4a5168">Attendance, leave, tasks and end-of-day reports</text>
  <text x="96" y="416" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="34" fill="#4a5168">for growing offices.</text>
  <g font-family="Inter, Segoe UI, Arial, sans-serif" font-size="24" font-weight="600">
    <rect x="96" y="470" width="150" height="48" rx="24" fill="#dcf3e4"/><text x="121" y="502" fill="#1d6b3c">Present</text>
    <rect x="262" y="470" width="110" height="48" rx="24" fill="#fdefd3"/><text x="287" y="502" fill="#8a5300">Late</text>
    <rect x="388" y="470" width="140" height="48" rx="24" fill="#dcecfb"/><text x="413" y="502" fill="#1f5c96">Remote</text>
    <rect x="544" y="470" width="160" height="48" rx="24" fill="#ece3fd"/><text x="569" y="502" fill="#5b2fb0">On leave</text>
  </g>
</svg>`);

await writeFile(
  "public/apple-touch-icon.png",
  await sharp(logo(180, 0), { density: 512 }).resize(180, 180).png().toBuffer(),
);
await writeFile("public/icon-192.png", await png(logo(192), 192));
await writeFile("public/icon-512.png", await png(logo(512), 512));
await writeFile("public/icon-maskable-512.png", await png(maskable(512), 512));
await writeFile(
  "public/favicon.ico",
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(logo(size), size) })))),
);
await writeFile("public/og-default.png", await sharp(og).png({ compressionLevel: 9 }).toBuffer());
console.log(
  "Icons generated: favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png, og-default.png",
);
