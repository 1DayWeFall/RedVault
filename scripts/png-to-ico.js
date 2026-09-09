#!/usr/bin/env node
/**
 * png-to-ico.js — 将方形 PNG 转为多尺寸 Windows .ico
 *
 * 用法: node scripts/png-to-ico.js <in.png> <out.ico>
 *
 * 输出帧: 256(PNG 压缩帧, Vista+) / 48 / 32 / 16 (32bit BGRA DIB + 空 AND 掩码)
 * 缩放: sharp lanczos3
 */

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SIZES = [256, 48, 32, 16];

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/png-to-ico.js <in.png> <out.ico>');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  if (meta.width !== meta.height) {
    console.warn(`Warning: input is ${meta.width}x${meta.height}, not square; frames will be letterboxed by stretch.`);
  }

  const frames = [];
  for (const size of SIZES) {
    const png = await sharp(input)
      .resize(size, size, { kernel: 'lanczos3', fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (size === 256) {
      // 256 帧直接存 PNG（Vista+ 支持 PNG 压缩帧）
      const pngFrame = await sharp(input)
        .resize(256, 256, { kernel: 'lanczos3', fit: 'fill' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      frames.push({ size: 256, data: pngFrame });
    } else {
      frames.push({ size, data: buildDibFrame(png.data, size) });
    }
  }

  const ico = buildIco(frames);
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, ico);

  const head = ico.subarray(0, 6);
  const expected = Buffer.from([0x00, 0x00, 0x01, 0x00, SIZES.length & 0xff, 0x00]);
  if (!head.equals(expected)) {
    console.error('Header verification failed:', head.toString('hex'));
    process.exit(1);
  }
  console.log(`OK: wrote ${output} (${ico.length} bytes) frames=${SIZES.join(',')} header=${head.toString('hex')}`);
}

/**
 * 32bit BGRA 底朝上 DIB（BITMAPINFOHEADER + 像素 + 空 AND 掩码）
 */
function buildDibFrame(rgba, size) {
  const xorRow = size * 4;
  const xorSize = xorRow * size;
  const andRow = ((size + 31) >> 5) * 4; // 每行掩码按 4 字节对齐
  const andSize = andRow * size;

  const dib = Buffer.alloc(40 + xorSize + andSize);
  let o = 0;

  // BITMAPINFOHEADER
  dib.writeUInt32LE(40, o); o += 4;          // biSize
  dib.writeInt32LE(size, o); o += 4;         // biWidth
  dib.writeInt32LE(size * 2, o); o += 4;     // biHeight = XOR + AND
  dib.writeUInt16LE(1, o); o += 2;           // biPlanes
  dib.writeUInt16LE(32, o); o += 2;          // biBitCount
  dib.writeUInt32LE(0, o); o += 4;           // biCompression = BI_RGB
  dib.writeUInt32LE(xorSize + andSize, o); o += 4; // biSizeImage
  o += 16;                                   // biXPelsPerMeter/biYPelsPerMeter/biClrUsed/biClrImportant = 0

  // 像素：自底向上、RGBA -> BGRA
  for (let y = size - 1; y >= 0; y--) {
    const src = y * xorRow;
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      dib[o++] = rgba[s + 2]; // B
      dib[o++] = rgba[s + 1]; // G
      dib[o++] = rgba[s];     // R
      dib[o++] = rgba[s + 3]; // A
    }
  }
  // AND 掩码全 0（alpha 通道负责透明）
  return dib;
}

function buildIco(frames) {
  const headerSize = 6 + frames.length * 16;
  const entries = [];
  let offset = headerSize;

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);      // reserved
  dir.writeUInt16LE(1, 2);      // type: icon
  dir.writeUInt16LE(frames.length, 4);

  for (const f of frames) {
    const e = Buffer.alloc(16);
    e[0] = f.size >= 256 ? 0 : f.size; // width（256 记 0）
    e[1] = f.size >= 256 ? 0 : f.size; // height
    e[2] = 0;                          // color count
    e[3] = 0;                          // reserved
    e.writeUInt16LE(1, 4);             // planes
    e.writeUInt16LE(32, 6);            // bit count
    e.writeUInt32LE(f.data.length, 8); // bytes in resource
    e.writeUInt32LE(offset, 12);       // offset
    entries.push(e);
    offset += f.data.length;
  }

  return Buffer.concat([dir, ...entries, ...frames.map((f) => f.data)]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
