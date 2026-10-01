import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"

// 2026-10 项目全局改名 DMZZ→DZMM：localStorage 键前缀从 dmzz- 换成 dzmm-。
// 旧键数据一次性搬到对应新键（新键已存在时以新键为准），搬完删除旧键。
for (let i = localStorage.length - 1; i >= 0; i--) {
  const key = localStorage.key(i)
  if (!key?.startsWith("dmzz-")) continue
  const nextKey = `dzmm-${key.slice(5)}`
  if (localStorage.getItem(nextKey) === null) {
    localStorage.setItem(nextKey, localStorage.getItem(key)!)
  }
  localStorage.removeItem(key)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
