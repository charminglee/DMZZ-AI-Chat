import { useCallback, useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatHeader } from "@/components/chat-header"
import { MessageList } from "@/components/message-list"
import { ChatInput } from "@/components/chat-input"
import { WelcomeScreen } from "@/components/welcome-screen"
import { useChat } from "@/hooks/use-chat"
import { MODELS } from "@/lib/types"

const THEME_KEY = "dmzz-theme"

function useTheme() {
  const [dark, setDark] = useState(
    () => localStorage.getItem(THEME_KEY) === "dark",
  )

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light")
  }, [dark])

  const toggle = useCallback(() => setDark((d) => !d), [])
  return { dark, toggle }
}

export default function App() {
  const chat = useChat()
  const { dark, toggle } = useTheme()

  const activeModel = MODELS.find((m) => m.id === chat.model) ?? MODELS[0]
  const active = chat.activeConversation

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar chat={chat} dark={dark} onToggleTheme={toggle} />
        <SidebarInset className="flex h-svh flex-col overflow-hidden">
          <ChatHeader
            title={chat.activeConversation?.title ?? "DMZZ AI"}
            model={chat.model}
            onModelChange={chat.setModel}
            dark={dark}
            onToggleTheme={toggle}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {active && active.messages.length > 0 ? (
              <MessageList
                conversation={active}
                isStreaming={chat.isStreaming}
              />
            ) : (
              <WelcomeScreen onPick={chat.sendMessage} modelName={activeModel.name} />
            )}
            <ChatInput
              onSend={chat.sendMessage}
              onStop={chat.stopStreaming}
              isStreaming={chat.isStreaming}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
