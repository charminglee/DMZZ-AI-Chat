/**
 * 桌面打包脚本：
 * 1. 在工作区外的临时目录执行 electron-builder（工作区内的文件监控会锁定
 *    新解压的 electron.exe，导致 win-unpacked.tmp 重命名失败 EPERM）
 * 2. 把成品 win-unpacked 移入项目 release/ 目录
 * 3. 清理临时目录
 */
import { execSync } from "node:child_process"
import { cp, mkdir, rm, rename } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const TEMP_OUT = "../dmzz-build-tmp" // 相对项目根，位于工作区外
const releaseDir = path.join(root, "release")
const src = path.join(root, TEMP_OUT, "win-unpacked")
const dst = path.join(releaseDir, "win-unpacked")

async function removeWithRetry(target, label) {
  for (let i = 0; i < 12; i++) {
    try {
      await rm(target, { recursive: true, force: true })
      return
    } catch (e) {
      if (!existsSync(target)) return
      if (i === 11) throw new Error(`无法删除 ${label}: ${e.message}`)
      console.log(`${label} 被占用，10 秒后重试...`)
      await new Promise((r) => setTimeout(r, 10_000))
    }
  }
}

console.log("==> 在临时目录执行 electron-builder ...")
execSync(`npx electron-builder --win --config.directories.output=${TEMP_OUT}`, {
  cwd: root,
  stdio: "inherit",
})

console.log("==> 移入 release/ ...")
await mkdir(releaseDir, { recursive: true })
await removeWithRetry(dst, "旧的 release/win-unpacked")
try {
  await rename(src, dst)
} catch {
  // 跨设备或被占用时的兜底：复制后删除
  await cp(src, dst, { recursive: true })
}
await removeWithRetry(path.join(root, TEMP_OUT), "临时构建目录")

console.log(`\n完成！可执行程序位于: release/win-unpacked/DMZZ AI Chat.exe`)
