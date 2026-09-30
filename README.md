# DMZZ AI Chat

使用 **React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui** 搭建的 AI 聊天应用，主流左侧边栏布局，可打包为 Windows 桌面程序。AI 回复由本地脚本模拟（流式打字机效果），无需 API Key，开箱即用。

## 环境要求

- Node.js ≥ 20
- npm ≥ 10

## 常用命令

```bash
# 安装依赖
npm install

# 启动网页开发服务器（http://localhost:5173，支持热更新）
npm run dev

# 类型检查 + 生产构建（输出到 dist/）
npm run build

# 本地预览生产构建
npm run preview
```

## 桌面版打包（Electron）

```bash
# 一键打包：构建前端 → electron-builder 打包 → 移入 release/
npm run electron:build
```

产物位置：`release/win-unpacked/DMZZ AI Chat.exe`（解包目录版，双击运行，无需安装）。

```bash
# 开发调试 Electron 壳（先另开一个终端跑 npm run dev）
npm run electron:dev
```

> 打包流程说明：工作区内的文件监控会锁定新解压的 electron.exe 导致 EPERM 失败，
> 因此 [scripts/build-desktop.mjs](scripts/build-desktop.mjs) 会先在工作区外的
> `../dmzz-build-tmp` 完成打包，再自动把成品移入 `release/`，最后清理临时目录，全程自动。

> 未签名的 exe 首次运行可能触发 SmartScreen 提示，选「仍要运行」即可。

## 工具脚本

### 图标生成（零依赖，纯 Node 绘制）

生成 256×256 的应用图标 PNG（渐变圆角方块 + 四角星，几何参数在脚本开头调整）：

```bash
node scripts/generate-icon.mjs                    # 输出到 build/icon.png
node scripts/generate-icon.mjs build/icon.png     # 指定输出路径
```

### PNG 转 ICO

把 256×256 的 PNG 封装成 Windows 图标（用于嵌入 exe）：

```bash
node scripts/png-to-ico.mjs build/icon.png build/icon.ico
```

> 换图标流程：改好 `generate-icon.mjs` 开头的颜色/形状常量（或准备自己的 256×256 PNG）
> → 依次跑上面两个脚本 → `npm run electron:build` 重新打包。
> 注意资源管理器有图标缓存，看新图标时把 exe 复制到别的目录。

### 桌面打包编排

即 `npm run electron:build` 内部调用的脚本，也可单独运行（前提 dist/ 已是最新）：

```bash
npm run build                # 先确保前端产物最新
node scripts/build-desktop.mjs
```

## 功能一览

- **左侧会话边栏**：新建对话、关键词搜索、按日期分组（今天 / 昨天 / 近 7 天 / 更早）、重命名、删除确认，可折叠为图标模式（`Ctrl/Cmd + B`），移动端自动变为抽屉
- **聊天主区**：Markdown 渲染（标题、列表、表格、引用、行内代码、带复制按钮的代码块）、流式打字机输出、思考动画、停止生成、悬停复制全文、自动吸底滚动
- **输入框**：自适应高度、Enter 发送 / Shift+Enter 换行、中文输入法选词回车不误发
- **模型切换**：头部下拉选择（DMZZ 4.5 / Mini / Code）
- **明暗主题**：一键切换并持久化
- **本地持久化**：会话、模型、主题存入 localStorage，刷新不丢失

## 接入真实模型

[src/lib/mock-ai.ts](src/lib/mock-ai.ts) 中的 `streamMockReply()` 是回复来源的唯一样板：
把它的内部实现替换为对 SSE / `fetch` ReadableStream 的消费，保持
`(prompt, onChunk, onDone) => { cancel }` 的签名即可，上层 UI 无需改动。

## 目录结构

```
├── electron/main.cjs        # Electron 主进程
├── electron-builder.yml     # 打包配置（win / dir 目标）
├── build/icon.ico           # 应用图标（由脚本生成）
├── scripts/
│   ├── generate-icon.mjs    # 图标 PNG 生成器
│   ├── png-to-ico.mjs       # PNG → ICO 封装
│   └── build-desktop.mjs    # 打包编排（外部构建 + 移入 release）
├── release/win-unpacked/    # 打包产物（.gitignore）
└── src/
    ├── components/
    │   ├── ui/              # shadcn/ui 基础组件
    │   ├── app-sidebar.tsx  # 左侧边栏
    │   ├── chat-header.tsx  # 顶部栏（模型选择、主题）
    │   ├── chat-input.tsx   # 底部输入区
    │   ├── markdown.tsx     # 轻量 Markdown 渲染器
    │   ├── message-list.tsx # 消息流
    │   └── welcome-screen.tsx
    ├── hooks/use-chat.ts    # 会话状态、流式发送、持久化
    └── lib/
        ├── mock-ai.ts       # 模拟流式 AI 后端
        └── types.ts         # 类型与模型清单
```
