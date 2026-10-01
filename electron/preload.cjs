const { contextBridge, ipcRenderer } = require("electron")

// 仅暴露最小接口：把主题模式同步给主进程（驱动原生标题栏与窗口底色）
contextBridge.exposeInMainWorld("desktop", {
  setTheme: (payload) => ipcRenderer.send("desktop:set-theme", payload),

  // 本地背景图片服务（服务未启动时 invoke 会 reject，renderer 静默降级）
  background: {
    getImage: (width, height) => ipcRenderer.invoke("background:get", width, height),
  },

  // dzmm.ai 网页通道（隐藏浏览器会话）
  dzmm: {
    getStatus: () => ipcRenderer.invoke("dzmm:get-status"),
    login: () => ipcRenderer.invoke("dzmm:login"),
    createChat: (cardId) => ipcRenderer.invoke("dzmm:create-chat", cardId),
    getModels: () => ipcRenderer.invoke("dzmm:get-models"),
    getCard: (cardId) => ipcRenderer.invoke("dzmm:get-card", cardId),
    chat: (reqId, payload) => ipcRenderer.invoke("dzmm:chat", reqId, payload),
    cancel: () => ipcRenderer.invoke("dzmm:cancel"),
    /** 订阅流式事件；返回取消订阅函数 */
    onEvent: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on("dzmm:event", handler)
      return () => ipcRenderer.removeListener("dzmm:event", handler)
    },
  },
})
