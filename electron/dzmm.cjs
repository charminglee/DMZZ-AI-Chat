const { BrowserWindow, ipcMain } = require("electron")
const path = require("node:path")
const { currentBackground } = require("./theme.cjs")

/**
 * dzmm.ai 网页通道：后台常驻一个隐藏 BrowserWindow（独立持久分区，登录态落盘），
 * 借页面同源上下文调用站点私有接口（/api/chat 等），把 SSE 流转发给主界面。
 *
 * 全部站点契约来自 2026-10 逆向抓包，网站改版可能随时失效：
 *   POST /api/trpc/chat.createByCard {json:{cardId,entryPoint,fixedRandomIndex}} → 新 chatId
 *   POST /api/chat {operation,chatId,cardId,chatSettings{deepThinking,enableMemoryEnhance,...},prompts,...}
 *     → SSE: init / step(深度思考阶段) / token(正文) / complete(收尾,含计费)
 */

const SITE_ORIGIN = "https://www.dzmm.ai"
const GET_ME_INPUT = encodeURIComponent(
  JSON.stringify({ json: null, meta: { values: ["undefined"] } }),
)

let win = null
let loginMode = false // 登录模式下允许弹出的第三方窗口（OAuth 等）
let getMainWindow = () => null

/** 等待隐藏窗口就绪（完成加载且停在站点域内） */
function waitReady(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const w = ensureWindow(false)
      const url = w.webContents.getURL()
      if (url.startsWith(SITE_ORIGIN) && !w.webContents.isLoading()) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("dzmm.ai 页面加载超时，请检查网络后重试"))
        return
      }
      setTimeout(tick, 500)
    }
    tick()
  })
}

/**
 * 在站点页面上下文执行脚本并取回 JSON 结果。
 * 脚本必须 return Promise<string>（JSON 字符串），失败也要返回 {error}。
 */
async function runPageScript(script) {
  const w = ensureWindow(false)
  const url = w.webContents.getURL()
  if (!url.startsWith(SITE_ORIGIN)) {
    throw new Error("网页通道会话失效（页面不在 dzmm.ai），请到设置中重新登录")
  }
  const raw = await w.webContents.executeJavaScript(script, true)
  try {
    return JSON.parse(raw)
  } catch {
    return { error: String(raw).slice(0, 200) }
  }
}

function ensureWindow(visible) {
  if (win && !win.isDestroyed()) {
    if (visible) win.show()
    return win
  }
  win = new BrowserWindow({
    show: !!visible,
    width: 1100,
    height: 820,
    title: "登录 dzmm.ai",
    backgroundColor: currentBackground(),
    webPreferences: {
      partition: "persist:dzmm", // cookie 独立落盘，登录一次长期有效
      preload: path.join(__dirname, "dzmm-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  // 非登录态一律拒绝弹窗，避免隐藏窗口被广告/跳转牵走
  win.webContents.setWindowOpenHandler(() =>
    loginMode ? { action: "allow" } : { action: "deny" },
  )
  win.webContents.on("did-navigate", (_e, url) => {
    // 会话被登出后站点可能跳登录页；chatId 等状态不受影响，无需处理
    if (!url.startsWith(SITE_ORIGIN) && !loginMode && !win.isVisible()) {
      win.loadURL(`${SITE_ORIGIN}/chat`).catch(() => {})
    }
  })
  win.on("closed", () => {
    win = null
  })
  win.loadURL(`${SITE_ORIGIN}/chat`).catch(() => {})
  return win
}

/** 查询登录态（isLoggedIn / 昵称），脚本在页面里 fetch 同源接口 */
function statusScript() {
  return `fetch('/api/trpc/user.getMe?input=${GET_ME_INPUT}')
    .then((r) => r.json())
    .then((j) => {
      const u = j && j.result && j.result.data && j.result.data.json
      return JSON.stringify({
        loggedIn: !!(u && u.isLoggedIn),
        name: (u && (u.fullName || u.name)) || null,
      })
    })
    .catch((e) => JSON.stringify({ loggedIn: false, error: String(e) }))`
}

async function getStatus() {
  await waitReady()
  return runPageScript(statusScript())
}

/** 弹出站点窗口让用户登录，检测到登录成功后自动隐藏 */
function login() {
  return new Promise((resolve) => {
    loginMode = true
    const w = ensureWindow(true)
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      loginMode = false
      clearInterval(timer)
      if (w && !w.isDestroyed()) w.hide()
      resolve(result)
    }
    const timer = setInterval(() => {
      if (!w || w.isDestroyed()) {
        finish({ ok: false, reason: "窗口已关闭" })
        return
      }
      w.webContents
        .executeJavaScript(statusScript(), true)
        .then((raw) => {
          try {
            const parsed = JSON.parse(raw)
            if (parsed.loggedIn) finish({ ok: true, name: parsed.name })
          } catch {
            /* 页面跳转中的瞬时失败，忽略 */
          }
        })
        .catch(() => {})
    }, 2000)
    // 用户直接关掉登录窗口：等 closed 事件兜底（隐藏窗口本体不能销毁，否则会话要重建）
    // 这里用最小化语义：closed 只会发生在整个应用退出时。
  })
}

/** 在站点上以某角色卡新建对话，返回 chatId（响应形状未文档化，做防御式解析） */
async function createChat(cardId) {
  await waitReady()
  const script = `fetch('/api/trpc/chat.createByCard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      json: { cardId: ${cardId}, entryPoint: 'card_detail', fixedRandomIndex: null },
      meta: { values: { fixedRandomIndex: ['undefined'] }, v: 1 },
    }),
  })
    .then((r) => r.json())
    .then((j) => {
      const d = j && j.result && j.result.data && j.result.data.json
      let id = null
      if (typeof d === 'string') id = d
      else if (d) id = d.id || d.chatId || (d.chat && d.chat.id) || null
      if (!id && d) {
        const m = JSON.stringify(d).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        id = m ? m[0] : null
      }
      return JSON.stringify({ ok: !!id, chatId: id })
    })
    .catch((e) => JSON.stringify({ ok: false, error: String(e) }))`
  const result = await runPageScript(script)
  if (!result.ok) {
    throw new Error(result.error || "创建站点对话失败（角色卡 ID 是否有效？是否已登录？）")
  }
  return result.chatId
}

/** 站点模型列表（含 32K 变体与 thinkingSupported 能力标记） */
async function getModels() {
  await waitReady()
  const input = encodeURIComponent(JSON.stringify({ json: { service: "chat" } }))
  const script = `fetch('/api/trpc/chat.models?input=${input}')
    .then((r) => r.json())
    .then((j) => JSON.stringify((j && j.result && j.result.data && j.result.data.json) || null))
    .catch((e) => JSON.stringify({ error: String(e) }))`
  const result = await runPageScript(script)
  if (!result || result.error) {
    throw new Error(result?.error || "获取站点模型列表失败")
  }
  return result
}

/** 角色卡信息（card.getById；公开数据，游客状态即可读取；不存在/不可见时返回 null） */
async function getCard(cardId) {
  await waitReady()
  const input = encodeURIComponent(JSON.stringify({ json: { cardId } }))
  const script = `fetch('/api/trpc/card.getById?input=${input}')
    .then((r) => r.json())
    .then((j) => JSON.stringify((j && j.result && j.result.data && j.result.data.json) || null))
    .catch((e) => JSON.stringify({ error: String(e) }))`
  const result = await runPageScript(script)
  if (result && result.error) {
    throw new Error(result.error)
  }
  return result
}

/** 注入流式桥：在页面里 POST /api/chat，逐行上报 SSE 事件 */
async function startChat(reqId, payload) {
  await waitReady()
  const script = `(function () {
    var REQID = ${JSON.stringify(reqId)}
    var PAYLOAD = ${JSON.stringify(payload)}
    var send = window.__dzmm && window.__dzmm.event
    if (!send) return JSON.stringify({ launched: false, error: '页面桥未就绪' })
    if (window.__dzmmActive) return JSON.stringify({ launched: false, error: '已有进行中的网页通道请求' })
    window.__dzmmActive = true
    var ctl = new AbortController()
    window.__dzmmAbort = ctl
    var finish = function () { window.__dzmmActive = false }
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PAYLOAD),
      signal: ctl.signal,
    })
      .then(async function (res) {
        if (!res.ok) {
          var t = ''
          try { t = await res.text() } catch (e) {}
          send(REQID, 'httpError', JSON.stringify({ status: res.status, body: t.slice(0, 300) }))
          finish()
          return
        }
        send(REQID, 'open', null)
        var reader = res.body.getReader()
        var dec = new TextDecoder()
        var buf = ''
        while (true) {
          var r = await reader.read()
          if (r.done) break
          buf += dec.decode(r.value, { stream: true })
          var ls = buf.split('\\n')
          buf = ls.pop() || ''
          for (var i = 0; i < ls.length; i++) {
            var line = ls[i].trim()
            if (line) send(REQID, 'raw', line)
          }
        }
        send(REQID, 'close', null)
        finish()
      })
      .catch(function (e) {
        send(REQID, 'fetchError', String(e))
        finish()
      })
    return JSON.stringify({ launched: true })
  })()`
  const result = await runPageScript(script)
  if (!result.launched) {
    throw new Error(result.error || "网页通道请求启动失败")
  }
}

function cancelChat() {
  if (win && !win.isDestroyed()) {
    win.webContents
      .executeJavaScript("window.__dzmmAbort && window.__dzmmAbort.abort()", true)
      .catch(() => {})
  }
}

function initDzmmBridge(mainWindowGetter) {
  getMainWindow = mainWindowGetter

  // 隐藏窗口 preload → 主进程 → 主界面
  ipcMain.on("dzmm:stream-event", (_event, payload) => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      main.webContents.send("dzmm:event", payload)
    }
  })

  ipcMain.handle("dzmm:get-status", () =>
    getStatus().catch((e) => ({ loggedIn: false, error: e.message })),
  )
  ipcMain.handle("dzmm:login", () =>
    login().catch((e) => ({ ok: false, reason: e.message })),
  )
  ipcMain.handle("dzmm:create-chat", (_e, cardId) =>
    createChat(cardId).catch((e) => {
      throw new Error(e.message)
    }),
  )
  ipcMain.handle("dzmm:get-models", () =>
    getModels().catch((e) => {
      throw new Error(e.message)
    }),
  )
  ipcMain.handle("dzmm:get-card", (_e, cardId) =>
    getCard(cardId).catch((e) => {
      throw new Error(e.message)
    }),
  )
  ipcMain.handle("dzmm:chat", (_e, reqId, payload) =>
    startChat(reqId, payload).catch((e) => {
      throw new Error(e.message)
    }),
  )
  ipcMain.handle("dzmm:cancel", () => {
    cancelChat()
    return true
  })
}

module.exports = { initDzmmBridge }
