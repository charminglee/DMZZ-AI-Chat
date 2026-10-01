/**
 * 桌面打包脚本：
 * 1. 在工作区外的临时目录执行 electron-builder（工作区内的文件监控会锁定
 *    新解压的 electron.exe，导致 win-unpacked.tmp 重命名失败 EPERM）
 * 2. 把成品移入项目 release/ 目录
 * 3. 清理临时目录
 *
 * 关于 release/win-unpacked 的锁定：工作区监控会持有该目录本体的句柄，
 * 使其无法被重命名/删除，但目录内的文件与子目录可以任意增删。
 * 因此当目标目录已存在且无法删除时，退化为「清空内容 → 逐项复制新内容」。
 */
import { execSync } from "node:child_process"
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const TEMP_OUT = "../dzmm-build-tmp" // 相对项目根，位于工作区外
const releaseDir = path.join(root, "release")
const src = path.join(root, TEMP_OUT, "win-unpacked")
const dst = path.join(releaseDir, "win-unpacked")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function removeWithRetry(target, label, tries = 3, delayMs = 2000) {
  for (let i = 1; i <= tries; i++) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (e) {
      if (!existsSync(target)) return
      if (i === tries) throw new Error(`无法删除 ${label}: ${e.message}`)
      console.log(`  ${label} 被占用，${delayMs / 1000} 秒后重试 (${i}/${tries})...`)
      await sleep(delayMs)
    }
  }
}

console.log("==> 在临时目录执行 electron-builder ...")
execSync(`npx electron-builder --win --config.directories.output=${TEMP_OUT}`, {
  cwd: root,
  stdio: "inherit",
})
if (!existsSync(src)) throw new Error(`构建产物不存在: ${src}`)

console.log("==> 移入 release/ ...")
await mkdir(releaseDir, { recursive: true })
await rm(dst, { recursive: true, force: true }).catch(() => {})

if (!existsSync(dst)) {
  // 快路径：旧目录已清掉，整体重命名即可
  try {
    await rename(src, dst)
  } catch {
    // 跨设备等情况下退化为复制
    await cp(src, dst, { recursive: true })
  }
} else {
  // 慢路径：目录本体被工作区监控锁定，无法删除，只能替换内容
  console.log("  release/win-unpacked 被锁定，改为就地替换内容 ...")
  for (const entry of await readdir(dst)) {
    await removeWithRetry(path.join(dst, entry), `release/win-unpacked/${entry}`)
  }
  for (const entry of await readdir(src)) {
    await cp(path.join(src, entry), path.join(dst, entry), { recursive: true, force: true })
  }
}

await removeWithRetry(path.join(root, TEMP_OUT), "临时构建目录", 6, 3000)

console.log(`\n完成！可执行程序位于: release/win-unpacked/DZMM AI Chat.exe`)
