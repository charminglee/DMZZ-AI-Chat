/**
 * 纯 Node 生成应用图标 PNG（256x256 RGBA，零依赖）：
 * 紫罗兰→品红对角渐变的圆角方块 + 白色四角星（与 index.html 的 favicon 同款）。
 * 用法: node scripts/generate-icon.mjs [输出路径]
 */
import { writeFileSync } from "node:fs"
import zlib from "node:zlib"

const SIZE = 256
const RADIUS = 56
const SS = 3 // 每像素子采样数（抗锯齿）

// 渐变色（与 favicon 一致）
const C1 = [0x8b, 0x5c, 0xf6] // 左上 violet
const C2 = [0xd9, 0x46, 0xef] // 右下 fuchsia

// 四角星几何：尖角在轴向上距中心 72，凹点在 45° 方向距中心 30（由 SVG 路径反推）
// 星形直边的极坐标方程 r(θ) = K / (a·cosθ + b·sinθ)，θ∈[0°,45°]
const STAR_R_OUT = 72
const STAR_R_IN = 30 / Math.SQRT2 // 21.213
const STAR_A = STAR_R_IN
const STAR_B = STAR_R_OUT - STAR_R_IN
const STAR_K = STAR_A * STAR_R_OUT

function sample(px, py) {
  const x = px - SIZE / 2 + 0.5
  const y = py - SIZE / 2 + 0.5

  // 圆角矩形 SDF（负值在内部），注意末尾要减去圆角半径
  const qx = Math.abs(x) - (SIZE / 2 - RADIUS)
  const qy = Math.abs(y) - (SIZE / 2 - RADIUS)
  const dist =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS

  if (dist > 0.5) return null // 完全透明

  // 对角线性渐变
  const t = Math.min(Math.max((px + py) / (2 * (SIZE - 1)), 0), 1)
  let r = C1[0] + (C2[0] - C1[0]) * t
  let g = C1[1] + (C2[1] - C1[1]) * t
  let b = C1[2] + (C2[2] - C1[2]) * t

  // 四角星判定：把极角折到 [0°,45°]
  const pr = Math.hypot(x, y)
  let angle = Math.abs(Math.atan2(y, x)) % (Math.PI / 2)
  if (angle > Math.PI / 4) angle = Math.PI / 2 - angle
  const edge = STAR_K / (STAR_A * Math.cos(angle) + STAR_B * Math.sin(angle))
  if (pr < edge) {
    r = 255
    g = 255
    b = 255
  }

  // 边缘 1px 内做柔和过渡
  const alpha = Math.min(Math.max(0.5 - dist, 0), 1)
  return [r, g, b, alpha]
}

// ---- 逐像素渲染（3x3 超采样）----
const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const s = sample(px + (sx + 0.5) / SS - 0.5, py + (sy + 0.5) / SS - 0.5)
        if (s) {
          r += s[0] * s[3]
          g += s[1] * s[3]
          b += s[2] * s[3]
          a += s[3]
        }
      }
    }
    const i = (py * SIZE + px) * 4
    if (a > 0) {
      pixels[i] = Math.round(r / a)
      pixels[i + 1] = Math.round(g / a)
      pixels[i + 2] = Math.round(b / a)
      pixels[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
}

// ---- 编码 PNG ----
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, "ascii")
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length)
  return out
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
// 每行加 filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let row = 0; row < SIZE; row++) {
  pixels.copy(raw, row * (SIZE * 4 + 1) + 1, row * SIZE * 4, (row + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
])

const output = process.argv[2] ?? "build/icon.png"
writeFileSync(output, png)
console.log(`已生成 ${output} (${png.length} 字节, ${SIZE}x${SIZE})`)
