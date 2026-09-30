/**
 * 从 build/icon.svg 渲染出 Windows 图标（256x256 RGBA PNG，零依赖）。
 *
 * SVG 是唯一事实来源：脚本解析其中的渐变、圆角、路径（含圆弧）与描边参数，
 * 用解析几何精确光栅化——描边用距离场（天然抗锯齿），填充用扫描线。
 * 用法: node scripts/generate-icon.mjs [svg路径] [输出png路径]
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

const svgPath = process.argv[2] ?? "build/icon.svg"
const outPath = process.argv[3] ?? "build/icon.png"
const SIZE = 256

// ---------- 解析 SVG ----------
const svg = readFileSync(svgPath, "utf8")
const num = (s) => parseFloat(s)

const stops = [...svg.matchAll(/<stop offset="([\d.]+)" stop-color="#([0-9a-fA-F]{6})"/g)].map(
  ([, off, hex]) => ({
    t: num(off),
    c: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)],
  }),
)
const rx = num(svg.match(/<rect[^>]*rx="([\d.]+)"/)?.[1] ?? "0")

const translate = svg.match(/<g[^>]*transform="translate\(([\d.]+)[\s,]+([\d.]+)\s*\)\s*scale\(([\d.]+)\)"/)
const TX = num(translate[1])
const TY = num(translate[2])
const SCALE = num(translate[3])
const STROKE = num(svg.match(/stroke-width="([\d.]+)"/)?.[1] ?? "2") * SCALE

// 坐标变换：24 网格 → 256 画布
const X = (x) => x * SCALE + TX
const Y = (y) => y * SCALE + TY

// ---------- SVG path 解析与圆弧展平 ----------
function arcToPoints(x1, y1, rx_, ry_, sweep, x2, y2, out) {
  // SVG 规范 F.6.5 端点参数化（本文件 rx==ry）
  const r = rx_
  const dx = (x2 - x1) / 2
  const dy = (y2 - y1) / 2
  const phi = Math.acos(Math.min(1, Math.hypot(dx, dy) / r))
  const h = r * Math.sin(phi)
  const sign = sweep ? 1 : -1
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const nx = (-dy / Math.hypot(dx, dy)) * h * sign
  const ny = (dx / Math.hypot(dx, dy)) * h * sign
  const cx = mx + nx
  const cy = my + ny
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  const a2 = Math.atan2(y2 - cy, x2 - cx)
  let sweepLen = a2 - a1
  if (sweep && sweepLen < 0) sweepLen += Math.PI * 2
  if (!sweep && sweepLen > 0) sweepLen -= Math.PI * 2
  const N = 16
  for (let i = 1; i <= N; i++) {
    const a = a1 + (sweepLen * i) / N
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
}

function parsePath(d) {
  const tokens = d.match(/[Mmlaz]|-?[\d.]+/g)
  const pts = []
  let cx = 0
  let cy = 0
  let i = 0
  const next = () => tokens[i++]
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (cmd === "M") {
      cx = num(next())
      cy = num(next())
      pts.push([cx, cy])
    } else if (cmd === "l") {
      cx += num(next())
      cy += num(next())
      pts.push([cx, cy])
    } else if (cmd === "a") {
      // a rx ry x轴旋转 大弧标志 顺逆标志 dx dy —— 共 7 个参数
      const r = num(next())
      num(next()) // ry（本文件恒等于 rx）
      num(next()) // x 轴旋转（恒为 0）
      num(next()) // 大弧标志（本文件恒为 0/小弧）
      const sweep = num(next())
      const dx = num(next())
      const dy = num(next())
      arcToPoints(cx, cy, r, r, sweep === 1, cx + dx, cy + dy, pts)
      cx += dx
      cy += dy
    } else if (cmd === "z") {
      break
    }
  }
  return pts.map(([x, y]) => [X(x), Y(y)])
}

// ---------- 几何求值 ----------
const star = parsePath(svg.match(/<path d="([^"]+)"[^>]*\/>/)[1])

// 两段小加号（M20 2v4 与 M22 4h-4）
const segments = [
  [
    [X(20), Y(2)],
    [X(20), Y(6)],
  ],
  [
    [X(22), Y(4)],
    [X(18), Y(4)],
  ],
]

const circleM = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/)
const dot = { x: X(num(circleM[1])), y: Y(num(circleM[2])), r: num(circleM[3]) * SCALE }

// 点到线段距离
function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)))
  return Math.hypot(px - ax - t * abx, py - ay - t * aby)
}

// 点到多边形边界距离
function polyDist(px, py, poly) {
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    min = Math.min(min, segDist(px, py, ax, ay, bx, by))
  }
  return min
}

// ---------- 渐变色 ----------
function gradientColor(px, py) {
  const t = Math.min(Math.max((px + py) / (2 * (SIZE - 1)), 0), 1)
  const s0 = stops[0]
  const s1 = stops[stops.length - 1]
  return [
    s0.c[0] + (s1.c[0] - s0.c[0]) * t,
    s0.c[1] + (s1.c[1] - s0.c[1]) * t,
    s0.c[2] + (s1.c[2] - s0.c[2]) * t,
  ]
}

// ---------- 逐像素渲染 ----------
// 白色图形覆盖度（0~1），d 为到图形中心线的像素距离，半宽 = STROKE/2
const pixels = Buffer.alloc(SIZE * SIZE * 4)
const half = STROKE / 2

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const x = px + 0.5
    const y = py + 0.5

    // 圆角矩形 SDF
    const qx = Math.abs(x - SIZE / 2) - (SIZE / 2 - rx)
    const qy = Math.abs(y - SIZE / 2) - (SIZE / 2 - rx)
    const rectD = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rx
    const rectA = Math.min(Math.max(0.5 - rectD, 0), 1)
    if (rectA === 0) continue

    // 白色图形的覆盖度
    let white = 0
    const dStar = polyDist(x, y, star)
    if (dStar <= half + 1) white = Math.max(white, Math.min(Math.max(half + 0.5 - dStar, 0), 1))
    for (const [[ax, ay], [bx, by]] of segments) {
      const d = segDist(x, y, ax, ay, bx, by)
      white = Math.max(white, Math.min(Math.max(half + 0.5 - d, 0), 1))
    }
    const dDot = Math.hypot(x - dot.x, y - dot.y)
    white = Math.max(white, Math.min(Math.max(dot.r + 0.5 - dDot, 0), 1))

    let [r, g, b] = gradientColor(px, py)
    if (white > 0) {
      r += (255 - r) * white
      g += (255 - g) * white
      b += (255 - b) * white
    }

    const i = (py * SIZE + px) * 4
    pixels[i] = Math.round(r)
    pixels[i + 1] = Math.round(g)
    pixels[i + 2] = Math.round(b)
    pixels[i + 3] = Math.round(rectA * 255)
  }
}

// ---------- PNG 编码 ----------
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
ihdr[8] = 8
ihdr[9] = 6
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

writeFileSync(outPath, png)
console.log(`已生成 ${outPath} (${SIZE}x${SIZE}, 源: ${svgPath})`)
console.log(`解析: rx=${rx}, 渐变=${stops.length}档, 星形${star.length}点, 加号${segments.length}段, 圆点r=${dot.r.toFixed(1)}`)
