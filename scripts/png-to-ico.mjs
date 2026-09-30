/**
 * 把 256x256 的 PNG 封装成单图像 ICO（PNG 内嵌格式，Windows Vista+ 支持）。
 * 用法: node scripts/png-to-ico.mjs build/icon.png build/icon.ico
 */
import { readFileSync, writeFileSync } from "node:fs"

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error("用法: node scripts/png-to-ico.mjs <input.png> <output.ico>")
  process.exit(1)
}

const png = readFileSync(input)
const width = png.readUInt32BE(16)
const height = png.readUInt32BE(20)
if (width !== 256 || height !== 256) {
  console.error(`需要 256x256 的 PNG，实际 ${width}x${height}`)
  process.exit(1)
}

// ICONDIR: 保留字(2) + 类型=1图标(2) + 数量(2)
// ICONDIRENTRY: 宽(1, 256 记为 0) + 高(1) + 调色板数(1) + 保留(1)
//               + 色彩平面(2) + 位深(2) + 数据大小(4) + 数据偏移(4)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)

const entry = Buffer.alloc(16)
entry.writeUInt8(0, 0) // 256px
entry.writeUInt8(0, 1) // 256px
entry.writeUInt8(0, 2)
entry.writeUInt8(0, 3)
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(22, 12)

writeFileSync(output, Buffer.concat([header, entry, png]))
console.log(`已生成 ${output} (${png.length + 22} 字节)`)
