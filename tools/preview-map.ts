/**
 * Dev helper: composes the generated map + tileset into a PNG for a quick look
 * without a browser. Output: /tmp/logs/douala-preview.png
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas } from "./png";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Tiny PNG decoder for the non-interlaced RGBA files we generate ourselves. */
function decodePng(buf: Buffer) {
  let off = 8;
  let w = 0, h = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    out.set(line, y * stride);
    prev = line;
  }
  return { w, h, data: out };
}

const tiles = decodePng(readFileSync(resolve(ROOT, "apps/client/public/assets/tiles/cozy-tiles.png")));
const map = JSON.parse(readFileSync(resolve(ROOT, "apps/client/public/assets/maps/douala.json"), "utf8"));
const SCALE = 2;
const cv = new Canvas(map.width * 16 * SCALE, map.height * 16 * SCALE);
for (const layer of map.layers) {
  if (layer.type !== "tilelayer" || !layer.visible) continue;
  for (let ty = 0; ty < layer.height; ty++) for (let tx = 0; tx < layer.width; tx++) {
    const gid = layer.data[ty * layer.width + tx];
    if (!gid) continue;
    const idx = gid - 1, sx = (idx % 16) * 16, sy = Math.floor(idx / 16) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = ((sy + y) * tiles.w + (sx + x)) * 4;
      const a = tiles.data[i + 3];
      if (a === 0) continue;
      cv.fillRect((tx * 16 + x) * SCALE, (ty * 16 + y) * SCALE, SCALE, SCALE, [tiles.data[i], tiles.data[i + 1], tiles.data[i + 2], 255]);
    }
  }
}
// doors
for (const o of map.layers.find((l: any) => l.type === "objectgroup").objects) {
  if (o.type === "door") cv.fillRect(o.x * SCALE, o.y * SCALE, 16 * SCALE, 2 * SCALE, [255, 0, 255, 255]);
  if (o.type === "spawn") cv.fillRect((o.x - 3) * SCALE, (o.y - 3) * SCALE, 6 * SCALE, 6 * SCALE, [255, 255, 0, 255]);
}
mkdirSync("/tmp/logs", { recursive: true });
writeFileSync("/tmp/logs/douala-preview.png", cv.encode());
console.log("wrote /tmp/logs/douala-preview.png");
