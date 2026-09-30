import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // Electron 通过 file:// 加载 dist/index.html，资源必须用相对路径
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // 打包产物不进 HMR 监听：监听器会锁住 release/ 下新写入的 exe，
      // 导致 electron-builder 重命名失败（EPERM/EBUSY），也会让 dev server 崩溃
      ignored: ["**/release/**", "**/dist/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
