import { useCallback, useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatHeader } from "@/components/chat-header"
import { MessageList } from "@/components/message-list"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
import { SettingsDialog } from "@/components/settings-dialog"
import { useChat } from "@/hooks/use-chat"
import { useSettings } from "@/hooks/use-settings"

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
  const theme = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const activeModel = settings.models.find((m) => m.id === settings.settings.model)
  const active = chat.activeConversation

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar chat={chat} theme={theme} onOpenSettings={() => setSettingsOpen(true)} />
        <SidebarInset className="flex h-svh flex-col overflow-hidden">
          <ChatHeader
            title={chat.activeConversation?.title ?? "DMZZ AI"}
            model={settings.settings.model}
            models={settings.models}
            modelsLoading={settings.modelsLoading}
            onModelChange={(model) => settings.updateSettings({ model })}
            onOpenSettings={() => setSettingsOpen(true)}
            dark={theme.dark}
            onToggleTheme={theme.toggle}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {active && active.messages.length > 0 ? (
              <MessageList
                conversation={active}
                isStreaming={chat.isStreaming}
              />
            ) : (
              <WelcomeScreen
                onPick={chat.sendMessage}
                modelName={activeModel?.name ?? "未选择模型"}
              />
            )}
            <ChatInput
              onSend={chat.sendMessage}
              onStop={chat.stopStreaming}
              isStreaming={chat.isStreaming}
            />
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
