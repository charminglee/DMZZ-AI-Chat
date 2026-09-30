/**
 * 模拟 AI 后端：根据关键词挑选预设回答，并按“打字机”节奏流式输出。
 * 真实场景中，把 streamMockReply 替换为对 SSE / fetch ReadableStream 的消费即可。
 */

export interface MockStreamHandle {
  cancel: () => void
}

type OnChunk = (chunk: string) => void

interface CannedReply {
  keywords: RegExp
  reply: (prompt: string) => string
}

const CANNED_REPLIES: CannedReply[] = [
  {
    keywords: /^(你好|您好|hi|hello|嗨|哈喽)/i,
    reply: () =>
      "你好！我是 **DMZZ AI**，一个运行在你浏览器里的演示助手 😊\n\n我可以帮你：\n\n- 撰写与润色文案、邮件\n- 解释技术概念、排查代码问题\n- 做头脑风暴、列计划大纲\n\n有什么想聊的，尽管说！",
  },
  {
    keywords: /react|前端|组件|hook/i,
    reply: () =>
      "## React 学习建议\n\n**核心概念**按这个顺序理解最顺畅：\n\n1. **JSX 与渲染**：组件是返回 UI 的函数\n2. **State 与 Props**：数据向下流动，事件向上传递\n3. **副作用**：用 `useEffect` 处理订阅、请求等\n4. **派生状态**：能用普通函数算出来的，就不要放进 state\n\n```tsx\nfunction Counter() {\n  const [count, setCount] = useState(0)\n\n  useEffect(() => {\n    document.title = `当前计数：${count}`\n  }, [count])\n\n  return <button onClick={() => setCount(c => c + 1)}>{count}</button>\n}\n```\n\n> 小提示：现代 React 推荐用函数组件 + Hooks，类组件只在维护老代码时才会遇到。",
  },
  {
    keywords: /防抖|节流|debounce|throttle/i,
    reply: () =>
      "## 防抖与节流的区别\n\n两者都用于限制函数触发频率，但策略不同：\n\n| | 防抖 (debounce) | 节流 (throttle) |\n|---|---|---|\n| 思路 | 停下来才执行 | 固定间隔执行一次 |\n| 场景 | 搜索框输入、窗口 resize | 滚动监听、按钮防连点 |\n\n一个简洁的防抖实现：\n\n```ts\nfunction debounce<T extends (...args: never[]) => void>(fn: T, delay = 300) {\n  let timer: ReturnType<typeof setTimeout>\n  return (...args: Parameters<T>) => {\n    clearTimeout(timer)\n    timer = setTimeout(() => fn(...args), delay)\n  }\n}\n```\n\n需要节流版本的话告诉我，我再给你写一个～",
  },
  {
    keywords: /诗|吟|作诗|写首诗/i,
    reply: () =>
      "好呀，为你即兴一首小诗：\n\n> 屏前灯火夜微凉，\n> 代码千行落指尖。\n> 借问归途何处是，\n> 一轮明月照心间。\n\n如果想要别的题材或风格（豪放、婉约、现代诗），随时告诉我！",
  },
  {
    keywords: /你是谁|介绍|what are you/i,
    reply: () =>
      "我是 **DMZZ AI**，一个用 React + shadcn/ui 搭建的聊天演示应用。\n\n当前的所有回复都来自本地预设脚本，**不依赖任何真实模型 API**——所以你可以随意把玩，不用担心费用 😄\n\n界面特性包括：\n\n- 左侧会话边栏（支持折叠、搜索、重命名、删除）\n- 流式打字机效果与 Markdown 渲染\n- 本地持久化（刷新页面对话不丢失）\n- 明暗主题切换",
  },
]

const DEFAULT_REPLY = (prompt: string) => {
  const brief = prompt.length > 24 ? `${prompt.slice(0, 24)}…` : prompt
  return `关于「${brief}」，我说点自己的想法：\n\n### 思路拆解\n\n1. **先明确目标**——搞清楚“做成什么样”比“怎么做”更优先\n2. **拆成小步骤**——每一步都足够小，小到半小时内能验证对错\n3. **快速迭代**——先做出最粗糙的版本，再逐步打磨\n\n### 一个通用模板\n\n\`\`\`\n目标 → 拆解 → 最小可行版本 → 反馈 → 迭代\n\`\`\`\n\n> 这是一条演示回复。接入真实模型后，这里会返回模型生成的内容。\n\n还想深入哪个部分？我可以继续展开。`
}

function pickReply(prompt: string): string {
  for (const canned of CANNED_REPLIES) {
    if (canned.keywords.test(prompt)) return canned.reply(prompt)
  }
  return DEFAULT_REPLY(prompt)
}

/** [0, 1) 的均匀随机数，来自 CSPRNG */
function random(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

/** 把回答切成小块，模拟 token 级别的流式输出 */
function tokenize(text: string): string[] {
  return text
    .split(/(\s+)/)
    .flatMap((piece) => {
      if (piece === "") return []
      if (/^[\u4e00-\u9fff]+$/.test(piece)) {
        // 中文按单字推送
        return piece.split("")
      }
      return [piece]
    })
}

export function streamMockReply(
  prompt: string,
  onChunk: OnChunk,
  onDone: () => void,
): MockStreamHandle {
  const tokens = tokenize(pickReply(prompt))
  let index = 0
  let cancelled = false
  let timer: ReturnType<typeof setTimeout>

  const tick = () => {
    if (cancelled) return
    if (index >= tokens.length) {
      onDone()
      return
    }
    // 每次推送 1~2 个 token，营造自然的输出节奏
    const take = random() < 0.3 ? 2 : 1
    onChunk(tokens.slice(index, index + take).join(""))
    index += take
    timer = setTimeout(tick, 18 + random() * 42)
  }

  // 模拟思考延迟
  timer = setTimeout(tick, 400 + random() * 600)

  return {
    cancel() {
      cancelled = true
      clearTimeout(timer)
    },
  }
}
