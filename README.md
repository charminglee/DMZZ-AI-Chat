# DMZZ AI Chat

使用 **React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui** 搭建的 AI 聊天应用，主流左侧边栏布局，可打包为 Windows 桌面程序。接入真实 AI 服务：OpenAI 兼容接口与角色卡 API（v2），流式输出。

## 环境要求

- Node.js ≥ 20
- npm ≥ 10

## 常用命令

```bash
# 安装依赖
npm install

# 启动网页开发服务器（http://localhost:5173，支持热更新）
npm run dev

# 一键打包：构建前端 → electron-builder 打包 → 移入 release/
npm run build

# 本地预览生产构建
npm run preview
```

> 打包流程说明：Vite dev server 的文件监听会锁住 `release/` 下新写入的 exe
> （导致 electron-builder 重命名失败 EPERM，严重时 dev server 自身崩溃 EBUSY），
> 因此 [vite.config.ts](vite.config.ts) 已将 `release/` 与 `dist/` 排除出 HMR 监听。
> 打包脚本 [scripts/build-desktop.mjs](scripts/build-desktop.mjs) 仍会先在工作区外的
> `../dmzz-build-tmp` 完成打包再移入 `release/`，作为对其它文件监控（杀软、索引器）的兜底；
> 若目标目录被锁，会自动退化为「就地替换内容」。全程自动，无需手动干预。

> 未签名的 exe 首次运行可能触发 SmartScreen 提示，选「仍要运行」即可。

## 工具脚本

### 图标生成（零依赖，以 SVG 为唯一源）

应用图标源文件是 [build/icon.svg](build/icon.svg)（同时作为网页 favicon 和界面 Logo）。
脚本会解析该 SVG 的渐变、圆角、路径（含圆弧）与描边参数，用解析几何精确光栅化：

```bash
node scripts/generate-icon.mjs                          # 默认: build/icon.svg → build/icon.png
node scripts/generate-icon.mjs build/icon.svg build/icon.png   # 可指定源与输出
```

### PNG 转 ICO

把 256×256 的 PNG 封装成 Windows 图标（用于嵌入 exe）：

```bash
node scripts/png-to-ico.mjs build/icon.png build/icon.ico
```

> 换图标流程：编辑 `build/icon.svg`（改颜色/形状）→ 依次跑上面两个脚本
> → `npm run electron:build` 重新打包。界面上的 Logo、favicon、exe 图标会保持完全一致。
> 注意资源管理器有图标缓存，看新图标时把 exe 复制到别的目录。

### 桌面打包编排

即 `npm run electron:build` 内部调用的脚本，也可单独运行（前提 dist/ 已是最新）：

```bash
npm run build                # 先确保前端产物最新
node scripts/build-desktop.mjs
```

## 功能一览

- **左侧会话边栏**：新建对话、关键词搜索、按日期分组（今天 / 昨天 / 近 7 天 / 更早）、重命名、删除确认，可折叠为图标模式（点击左上角品牌 Logo，悬停时切换为收起/展开图标并带过渡动画；也支持 `Ctrl/Cmd + B`），移动端自动变为抽屉
- **聊天主区**：Markdown 渲染（标题、列表、表格、引用、行内代码、带复制按钮的代码块）、流式打字机输出、思考动画、停止生成、悬停复制全文、自动吸底滚动
- **输入框**：自适应高度、Enter 发送 / Shift+Enter 换行、中文输入法选词回车不误发
- **模型切换**：头部下拉按基础模型分组；容量变体（16K/32K/64K/128K）合并为**上下文长度开关**而非分别列出（50 个接口模型归并为 17 个基础模型），切换模型时自动沿用当前容量
- **明暗主题**：默认**跟随系统**自动切换（系统切换深/浅色时应用实时跟随）；底部用户菜单可选「跟随系统 / 浅色 / 深色」，头部另有快捷切换按钮；Electron 版的原生窗口标题栏与窗口底色同步跟随，加载/切换无闪白
- **本地持久化**：会话、模型、主题、API 配置存入 localStorage，刷新不丢失
- **单例运行**（桌面版）：重复启动不会开新窗口，而是唤醒并聚焦已有窗口

## 接入 AI 服务

在「设置」对话框（底部用户菜单 → 设置，或头部模型下拉 → 设置…）中配置，三种接入方式：

| 方式 | 说明 | 接口 |
|---|---|---|
| OpenAI 兼容 (v1) | 通用 Chat Completions，`messages` 请求体 | `POST /v1/chat/completions` |
| 角色卡 (v2) | 支持角色设定、用户称呼、开场白与系统提示 | `POST /v2/chat/completions` |

- **API Token**：默认已预填，可在设置中更换；模型列表从 `GET /v2/models` 拉取并本地缓存（点「刷新列表」更新）
- **角色卡编辑**：角色名、描述、性格、场景、开场白、系统提示，以及你的称呼
- **生成参数**：温度与最大回复长度
- **测试连接**：一键验证 Token 与网络是否可用
- 请求与响应走标准 SSE 流式（OpenAI `delta.content` 分块格式），支持中途「停止生成」（中止请求）；失败时错误信息直接显示在对话里

协议实现见 [src/lib/api.ts](src/lib/api.ts)：SSE 流式解析（带行缓冲，处理跨 chunk 分割）、`AbortController` 中止、错误信息提取，v1/v2 共用同一套回调签名。

## 目录结构

```
├── electron/
│   ├── main.cjs             # Electron 主进程
│   ├── preload.cjs          # contextBridge 桥接（主题同步）
│   ├── theme.cjs            # nativeTheme 同步：原生标题栏 + 窗口底色
│   └── theme-test.cjs       # 主题同步的端到端验证脚本（含窗口截图）
├── electron-builder.yml     # 打包配置（win / dir 目标）
├── scripts/
│   ├── generate-icon.mjs    # logo.svg → 图标 PNG（解析几何光栅化）
│   ├── png-to-ico.mjs       # PNG → ICO 封装
│   └── build-desktop.mjs    # 打包编排（外部构建 + 移入 release）
├── release/win-unpacked/    # 打包产物（.gitignore）
└── src/
    ├── components/
    │   ├── ui/                    # shadcn/ui 基础组件
    │   ├── app-sidebar.tsx        # 左侧边栏（Logo 即折叠开关）
    │   ├── chat-header.tsx        # 顶部栏（模型选择、主题、设置入口）
    │   ├── chat-input.tsx         # 底部输入区
    │   ├── settings-dialog.tsx    # 设置：接入方式 / Token / 模型 / 角色卡 / 参数
    │   ├── markdown.tsx           # 轻量 Markdown 渲染器
    │   ├── message-list.tsx       # 消息流
    │   └── welcome-screen.tsx
    ├── hooks/
    │   ├── use-chat.ts            # 会话状态、流式发送、持久化
    │   └── use-settings.ts        # API 配置与模型列表缓存
    └── lib/
        ├── api.ts                 # AI 服务客户端（v1 / v2，SSE 流式）
        └── types.ts               # 类型与默认配置
```
