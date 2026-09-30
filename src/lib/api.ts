import type { ApiSettings, ModelInfo } from "@/lib/types"

const BASE_URL = "https://api.sillytraven.dev/api/ai"

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  }
}

/** 拉取可用模型列表（GET /v2/models，带上下文窗口信息） */
export async function listApiModels(token: string): Promise<ModelInfo[]> {
  if (!token.trim()) throw new ApiError("未配置 API Token")
  const res = await fetch(`${BASE_URL}/v2/models`, { headers: authHeaders(token) })
  if (!res.ok) {
    throw new ApiError(`模型列表获取失败（HTTP ${res.status}）`, res.status)
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; name?: string; context_window?: number }>
  }
  const data = Array.isArray(json.data) ? json.data : []
  return data.map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    description: m.context_window ? `上下文 ${Math.round(m.context_window / 1000)}K` : "角色卡模型",
  }))
}

export interface ChatTurn {
  role: "user" | "assistant"
  content: string
}

export interface StreamChatOptions {
  settings: ApiSettings
  /** 历史消息（含本轮用户输入，不含待写入的助手占位） */
  messages: ChatTurn[]
  conversationId: string
  requestId: string
  userId: string
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

export interface StreamHandle {
  cancel: () => void
}

export interface ConnectionTestResult {
  ok: boolean
  text: string
}

/** 快速验证 Token / 模型 / 网络：发起一次极短请求，把结果回调出去 */
export function testApiConnection(
  settings: ApiSettings,
  userId: string,
  onResult: (result: ConnectionTestResult) => void,
): void {
  let collected = ""
  streamChatCompletion({
    settings: { ...settings, maxTokens: 60 },
    messages: [{ role: "user", content: "你好，请回复「连接正常」四个字" }],
    conversationId: "dmzz_connection_test",
    requestId: `dmzz_test_${Date.now()}`,
    userId,
    onChunk: (text) => {
      collected += text
    },
    onDone: () =>
      onResult({
        ok: collected.trim().length > 0,
        text: collected.trim().slice(0, 60) || "（模型没有返回内容）",
      }),
    onError: (error) => onResult({ ok: false, text: error.message }),
  })
}

/** 历史上限，避免超出模型上下文 */
const MAX_HISTORY = 24

function buildBody(options: StreamChatOptions): Record<string, unknown> {
  const { settings, messages, conversationId, requestId, userId } = options
  const history = messages.slice(-MAX_HISTORY)

  if (settings.mode === "card") {
    // v2 角色卡接口：角色设定、用户称呼、上下文与多轮消息
    return {
      model: settings.model,
      style: settings.style,
      user_name: settings.userName || "朋友",
      user_id: userId,
      conversation_id: conversationId,
      request_id: requestId,
      card: settings.card,
      context: [],
      messages: history,
      max_tokens: settings.maxTokens,
      temperature: settings.temperature,
      stream: true,
    }
  }

  // v1 OpenAI 兼容接口
  return {
    model: settings.model,
    messages: history,
    max_tokens: settings.maxTokens,
    temperature: settings.temperature,
    stream: true,
  }
}

/**
 * 流式对话：消费 SSE（OpenAI Chat Completions 格式），
 * 逐块回调 delta.content，可随时 cancel。
 */
export function streamChatCompletion(options: StreamChatOptions): StreamHandle {
  const { settings, onChunk, onDone, onError } = options
  const controller = new AbortController()

  const path = settings.mode === "card" ? "/v2/chat/completions" : "/v1/chat/completions"

  const run = async () => {
    try {
      if (!settings.token.trim()) throw new ApiError("未配置 API Token，请到设置中填写")
      if (!settings.model) throw new ApiError("未选择模型")

      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: authHeaders(settings.token),
        body: JSON.stringify(buildBody(options)),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        let detail = ""
        try {
          const text = await res.text()
          const json = JSON.parse(text) as { error?: { message?: string } }
          detail = json.error?.message ?? text.slice(0, 200)
        } catch {
          /* 忽略解析失败 */
        }
        throw new ApiError(
          `请求失败（HTTP ${res.status}）${detail ? `：${detail}` : ""}`,
          res.status,
        )
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finished = false

      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE：按行处理，保留最后一段不完整行
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const raw of lines) {
          const line = raw.trim()
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          if (payload === "[DONE]") {
            finished = true
            break
          }
          try {
            const event = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const chunk = event.choices?.[0]?.delta?.content
            if (chunk) onChunk(chunk)
          } catch {
            /* 跳过无法解析的行 */
          }
        }
      }
      onDone()
    } catch (error) {
      if (controller.signal.aborted) {
        onDone()
        return
      }
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  void run()

  return {
    cancel() {
      controller.abort()
    },
  }
}
