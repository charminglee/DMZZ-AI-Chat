import { useCallback, useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { BackgroundLayer } from "@/components/background-layer"
import { CharacterCards } from "@/components/character-cards"
import { ChatHeader } from "@/components/chat-header"
import { MessageList } from "@/components/message-list"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
import { SiteBrowser, PLAZA_URL } from "@/components/site-browser"
import { SettingsDialog } from "@/components/settings-dialog"
import { useCharacterCards } from "@/hooks/use-character-cards"
import { useChat } from "@/hooks/use-chat"
import { useSettings } from "@/hooks/use-settings"
import { useSidebarWidth } from "@/hooks/use-sidebar-width"
import { testApiConnection, type ConnectionTestResult } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { SiteCard } from "@/lib/types"

const THEME_KEY = "dmzz-theme"

function readStoredMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )

  // 监听系统主题变化（跟随系统模式下实时生效）
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const dark = mode === "system" ? systemDark : mode === "dark"

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem(THEME_KEY, mode)

    // 同步原生窗口：Electron 标题栏明暗 + 窗口底色（浏览器中 window.desktop 为 undefined）
    window.desktop?.setTheme({ mode })
  }, [dark, mode])

  // 快捷开关：在浅色/深色间显式切换（离开跟随系统）
  const toggle = useCallback(() => setMode(dark ? "light" : "dark"), [dark])

  return { dark, mode, setMode, toggle }
}

export default function App() {
  const settings = useSettings()
  const chat = useChat(settings.settings, settings.userId)
  const cardLibrary = useCharacterCards()
  const theme = useTheme()
  const sidebarWidth = useSidebarWidth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 主区视图：对话 / 角色卡 / 广场（每次启动都从对话开始）
  const [view, setView] = useState<"chat" | "cards" | "plaza">("chat")
  // 广场 webview 首次打开后常驻（切换视图只隐藏不卸载，保留浏览状态）
  const [plazaOpened, setPlazaOpened] = useState(false)
  // 每次启动都从普通模式开始，不恢复上次的沉浸状态
  const [immersive, setImmersive] = useState(false)

  /** 以某张角色卡开始新对话：切换网页通道并绑定站点卡 ID */
  const startCardChat = useCallback(
    (card: SiteCard) => {
      settings.updateSettings({ siteCardId: String(card.id), mode: "web" })
      chat.newConversation()
      setView("chat")
    },
    [settings, chat],
  )

  const testConnection = useCallback(
    () =>
      new Promise<ConnectionTestResult>((resolve) => {
        testApiConnection(settings.settings, settings.userId, resolve)
      }),
    [settings.settings, settings.userId],
  )

  const activeModel = settings.models.find((m) => m.id === settings.settings.model)
  const active = chat.activeConversation

  return (
    <TooltipProvider delayDuration={0}>
      {/* 沉浸模式背景：本地背景图片服务出图则铺满窗口，否则保持主题色 */}
      <BackgroundLayer active={immersive} />
      <SidebarProvider
        style={
          {
            "--sidebar-width": immersive ? "0px" : `${sidebarWidth.width}px`,
          } as React.CSSProperties
        }
      >
        <AppSidebar
          chat={chat}
          theme={theme}
          onOpenSettings={() => setSettingsOpen(true)}
          sidebarWidth={sidebarWidth}
          immersive={immersive}
          userName={settings.settings.userName}
          avatar={settings.settings.avatar}
          onUpdateProfile={(patch) => settings.updateSettings(patch)}
          activeView={view}
          onOpenCards={() => setView("cards")}
          onOpenPlaza={() => {
            setPlazaOpened(true)
            setView("plaza")
          }}
          onNewConversation={() => {
            chat.newConversation()
            setView("chat")
          }}
          onSelectConversation={(id) => {
            chat.selectConversation(id)
            setView("chat")
          }}
        />
        <SidebarInset
          className={cn(
            "flex h-svh flex-col overflow-hidden transition-colors duration-300",
            immersive && "bg-transparent",
          )}
        >
          <ChatHeader
            title={
              view === "cards" ? "角色卡" : view === "plaza" ? "广场" : chat.activeConversation?.title ?? "DMZZ AI"
            }
            model={settings.settings.model}
            modelGroups={settings.modelGroups}
            modelsLoading={settings.modelsLoading}
            onModelChange={(model) => settings.updateSettings({ model })}
            style={settings.settings.style}
            onStyleChange={(style) => settings.updateSettings({ style })}
            apiMode={settings.settings.mode}
            siteDeepThinking={settings.settings.siteDeepThinking}
            siteMemoryEnhance={settings.settings.siteMemoryEnhance}
            onSiteDeepThinkingChange={(on) => settings.updateSettings({ siteDeepThinking: on })}
            onSiteMemoryEnhanceChange={(on) => settings.updateSettings({ siteMemoryEnhance: on })}
            dark={theme.dark}
            onToggleTheme={theme.toggle}
            immersive={immersive}
            onToggleImmersive={() => setImmersive((v) => !v)}
            onTestConnection={testConnection}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {view === "cards" ? (
              <CharacterCards
                cards={cardLibrary.cards}
                onAdd={cardLibrary.addCard}
                onRemove={cardLibrary.removeCard}
                currentCardId={settings.settings.siteCardId}
                onStartChat={startCardChat}
              />
            ) : view === "chat" ? (
              <>
                {active && active.messages.length > 0 ? (
                  <MessageList
                    conversation={active}
                    isStreaming={chat.isStreaming}
                    onRegenerate={chat.regenerate}
                    onEditMessage={chat.editMessage}
                  />
                ) : (
                  <WelcomeScreen
                    onPick={chat.sendMessage}
                    modelName={activeModel?.name ?? "未选择模型"}
                  />
                )}
                <ChatInput
                  immersive={immersive}
                  onSend={chat.sendMessage}
                  onStop={chat.stopStreaming}
                  isStreaming={chat.isStreaming}
                />
              </>
            ) : null}
            {/* 广场：内置浏览器视图，首次打开后常驻，切换视图只隐藏不卸载。
                active 同时驱动主进程 WebContentsView 的可见性（它在渲染层之上，
                设置弹窗打开时必须隐藏，否则会盖住弹窗） */}
            {plazaOpened && (
              <div className={cn("min-h-0 flex-1", view === "plaza" ? "flex" : "hidden")}>
                <SiteBrowser url={PLAZA_URL} active={view === "plaza" && !settingsOpen} />
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        controller={settings}
      />
    </TooltipProvider>
  )
}
