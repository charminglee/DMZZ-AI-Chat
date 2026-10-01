import type { ApiSettings, SiteCard } from "@/lib/types"
import type { ChatTurn, StreamHandle } from "@/lib/api"

/**
 * dzmm.ai 网页通道（实验性）：
 * 借助 Electron 隐藏浏览器里的站点登录态，调用站点私有接口 /api/chat。
 * SSE 事件协议（逆向抓包所得，网站改版可能失效）：
 *   init {generationId} → step {step,content}（深度思考阶段，可多轮） → token <正文增量>
 *   → complete {content,...}（收尾，含计费信息）
 */

export interface DzmmBridge {
  getStatus: () => Promise<{ loggedIn: boolean; name?: string | null; error?: string }>
  login: () => Promise<{ ok: boolean; name?: string | null; reason?: string }>
  createChat: (cardId: number) => Promise<string>
  getModels: () => Promise<unknown>
  /** 角色卡详情（card.getById 原始响应；不存在时为 null） */
  getCard: (cardId: number) => Promise<unknown>
  chat: (reqId: string, payload: unknown) => Promise<void>
  cancel: () => Promise<boolean>
  onEvent: (callback: (event: SiteStreamEvent) => void) => () => void
}

export interface SiteStreamEvent {
  reqId: string
  type: "open" | "raw" | "close" | "httpError" | "fetchError"
  data: unknown
}

export interface SiteChatOptions {
  settings: ApiSettings
  /** 历史消息（含本轮用户输入） */
  messages: ChatTurn[]
  /** 本地对话已映射的站点对话 id，没有则首次发送时自动创建 */
  siteChatId: string | null
  /** 站点对话 id 创建/刷新后的回写 */
  onSiteChatId: (id: string) => void
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

/** 历史上限，与公开通道一致 */
const MAX_HISTORY = 24

/** 站点 /api/chat 请求体（字段名与站点前端一致，保持 snake/camel 混排原样） */
function buildSitePayload(
  settings: ApiSettings,
  siteChatId: string,
  cardId: number,
  messages: ChatTurn[],
): Record<string, unknown> {
  const history = messages.slice(-MAX_HISTORY)
  const lastUser = [...history].reverse().find((m) => m.role === "user")
  return {
    operation: "generate",
    chatId: siteChatId,
    cardId,
    chatSettings: {
      model: settings.model,
      style: settings.style,
      maxTokens: settings.maxTokens,
      randomIndex: 0,
      deepThinking: settings.siteDeepThinking,
      enableMemoryEnhance: settings.siteMemoryEnhance,
      voiceSettings: {
        ignore_parentheses: false,
        only_quotes: true,
        ignore_english: false,
        read_asterisks: false,
      },
    },
    presetConfig: { presetIds: [] },
    prompts: history,
    supportsSuggestions: false,
    content: lastUser?.content ?? "",
  }
}

/** 单请求订阅表：主进程事件按 reqId 分发 */
const listeners = new Map<string, (event: SiteStreamEvent) => void>()
let subscribed = false

function ensureSubscribed() {
  if (subscribed) return
  const bridge = window.desktop?.dzmm
  if (!bridge) return
  bridge.onEvent((event) => {
    const handler = listeners.get(event.reqId)
    if (handler) handler(event)
  })
  subscribed = true
}

/** 解析一行 SSE：data: {"type":"token","data":"..."} */
function parseSseLine(line: string): { type: string; data: unknown } | null {
  if (!line.startsWith("data:")) return null
  const payload = line.slice(5).trim()
  if (!payload || payload === "[DONE]") return null
  try {
    const parsed = JSON.parse(payload) as { type?: string; data?: unknown }
    return parsed.type ? { type: parsed.type, data: parsed.data } : null
  } catch {
    return null
  }
}

export function streamSiteChat(options: SiteChatOptions): StreamHandle {
  const { settings, messages, onChunk, onDone, onError } = options
  let cancelled = false
  let reqId: string | null = null

  const fail = (message: string) => {
    if (cancelled) return
    listeners.delete(reqId ?? "")
    onError(new Error(message))
  }

  const run = async () => {
    const bridge = window.desktop?.dzmm
    if (!bridge) {
      fail("网页通道仅桌面版可用（需通过 Electron 启动）")
      return
    }
    ensureSubscribed()

    const cardId = Number(settings.siteCardId.trim())
    if (!Number.isInteger(cardId) || cardId <= 0) {
      fail("未配置有效的站点角色卡 ID（设置 → 网页通道）")
      return
    }

    // 站点对话 id：没有则创建；403（对话被删/失效）时重建一次
    let siteChatId = options.siteChatId
    if (!siteChatId) {
      const status = await bridge.getStatus().catch(() => null)
      if (cancelled) return
      if (!status?.loggedIn) {
        fail("尚未登录 dzmm.ai，请到设置 → 网页通道 登录")
        return
      }
      siteChatId = await bridge.createChat(cardId).catch((e: Error) => {
        throw new Error(e.message)
      })
      if (cancelled) return
      options.onSiteChatId(siteChatId)
    }

    let receivedTokens = false
    let gotComplete = false
    let retried = false

    const attempt = async () => {
      reqId = `dzmm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const payload = buildSitePayload(settings, siteChatId!, cardId, messages)

      await new Promise<void>((resolve) => {
        listeners.set(reqId!, (event) => {
          switch (event.type) {
            case "raw": {
              const parsed = parseSseLine(String(event.data ?? ""))
              if (!parsed) break
              if (parsed.type === "token") {
                if (typeof parsed.data === "string" && parsed.data) {
                  receivedTokens = true
                  onChunk(parsed.data)
                }
              } else if (parsed.type === "complete") {
                gotComplete = true
              }
              // step（深度思考阶段）等事件暂不展示，仅驱动流状态
              break
            }
            case "httpError": {
              let status = 0
              let body = ""
              try {
                const parsed = JSON.parse(String(event.data ?? "{}")) as {
                  status?: number
                  body?: string
                }
                status = parsed.status ?? 0
                body = parsed.body ?? ""
              } catch {
                /* 忽略解析失败 */
              }
              listeners.delete(reqId!)
              if (status === 403 && !receivedTokens && !retried) {
                // 站点对话失效（可能被删除）：换登录态重建对话后重试一次
                retried = true
                resolve()
                return
              }
              fail(
                status === 403
                  ? "站点拒绝了请求（对话不存在或登录已过期），请到设置重新登录或更换角色卡"
                  : `站点请求失败（HTTP ${status}）${body ? `：${body.slice(0, 160)}` : ""}`,
              )
              resolve()
              return
            }
            case "fetchError": {
              listeners.delete(reqId!)
              if (cancelled) {
                resolve()
                return
              }
              fail(`站点连接中断：${String(event.data ?? "未知错误").slice(0, 160)}`)
              resolve()
              return
            }
            case "close": {
              listeners.delete(reqId!)
              if (cancelled || gotComplete) {
                if (!cancelled) onDone()
              } else if (!receivedTokens) {
                fail("站点连接关闭且没有收到内容")
              } else {
                onDone()
              }
              resolve()
              return
            }
          }
        })

        bridge
          .chat(reqId!, payload)
          .then(() => undefined)
          .catch((e: Error) => {
            listeners.delete(reqId!)
            fail(e.message)
            resolve()
          })
      })

      // 403 重建重试
      if (retried && !cancelled && !gotComplete) {
        const status = await bridge.getStatus().catch(() => null)
        if (cancelled) return
        if (!status?.loggedIn) {
          fail("登录已过期，请到设置 → 网页通道 重新登录")
          return
        }
        siteChatId = await bridge.createChat(cardId)
        options.onSiteChatId(siteChatId)
        receivedTokens = false
        gotComplete = false
        retried = false
        await attempt()
      }
    }

    try {
      await attempt()
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }

  void run()

  return {
    cancel() {
      cancelled = true
      if (reqId) listeners.delete(reqId)
      void window.desktop?.dzmm?.cancel().catch(() => {})
      onDone()
    },
  }
}

/** 站点模型列表（含公开 API 缺失的 32K 变体与深度思考能力标记） */
export async function listSiteModels(): Promise<
  Array<{ id: string; name: string; description: string; badge?: string }>
> {
  const bridge = window.desktop?.dzmm
  if (!bridge) throw new Error("网页通道仅桌面版可用")
  const raw = (await bridge.getModels()) as {
    categories?: Array<{
      modelGroups?: Array<{
        description?: string
        thinkingSupported?: boolean
        isRecommended?: boolean
        contexts?: Array<{ internalName: string; displayName: string; maxContext?: number }>
      }>
    }>
  } | null
  const models: Array<{ id: string; name: string; description: string; badge?: string }> = []
  for (const category of raw?.categories ?? []) {
    for (const group of category.modelGroups ?? []) {
      for (const context of group.contexts ?? []) {
        models.push({
          id: context.internalName,
          name: context.displayName,
          description: group.description ?? "",
          badge: group.thinkingSupported ? "深度思考" : undefined,
        })
      }
    }
  }
  return models
}

/** 查询站点登录态的轻量包装（设置界面用） */
export function getSiteStatus() {
  return window.desktop?.dzmm?.getStatus() ?? Promise.resolve({ loggedIn: false })
}

/** card.getById 原始响应里我们关心的字段 */
interface RawSiteCard {
  id?: number
  name?: string
  cardFilename?: string
  creator?: string
  creatorFullName?: string
  creatorNotes?: string
  tags?: unknown
  likesCount?: number
  commentsCount?: number
  popularityScore?: string | number
  publishedAt?: string
  createdAt?: string
}

/**
 * 按角色卡 ID 获取站点卡牌信息（公开数据，无需登录）。
 * 卡不存在 / 已被隐藏时返回 null。
 */
export async function fetchSiteCard(cardId: number): Promise<SiteCard | null> {
  const bridge = window.desktop?.dzmm
  if (!bridge) {
    throw new Error("角色卡功能仅桌面版可用（需通过 Electron 启动）")
  }
  const raw = (await bridge.getCard(cardId)) as RawSiteCard | null
  if (!raw || typeof raw.id !== "number") return null
  return {
    id: raw.id,
    name: raw.name?.trim() || `角色卡 ${raw.id}`,
    avatar: raw.cardFilename ?? "",
    creator: raw.creatorFullName?.trim() || raw.creator?.trim() || "",
    description: (raw.creatorNotes ?? "").trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
    likes: raw.likesCount ?? 0,
    comments: raw.commentsCount ?? 0,
    popularity: Number(raw.popularityScore ?? 0) || 0,
    publishedAt: raw.publishedAt ?? raw.createdAt ?? null,
    savedAt: Date.now(),
  }
}
