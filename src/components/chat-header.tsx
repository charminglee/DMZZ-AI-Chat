import { useState } from "react"
import { Check, ChevronDown, Loader2, Maximize2, Minimize2, Moon, Sun, Wifi, WifiOff } from "lucide-react"
import type { ConnectionTestResult } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { findGroup, resolveVariant, type ModelGroup } from "@/lib/model-groups"
import { groupBySeries, metaFor } from "@/lib/model-series"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { STYLE_OPTIONS, type ApiMode, type StyleMode } from "@/lib/types"

interface ChatHeaderProps {
  title: string
  model: string
  modelGroups: ModelGroup[]
  modelsLoading: boolean
  onModelChange: (id: string) => void
  style: StyleMode
  onStyleChange: (style: StyleMode) => void
  apiMode: ApiMode
  dark: boolean
  onToggleTheme: () => void
  immersive: boolean
  onToggleImmersive: () => void
  onTestConnection: () => Promise<ConnectionTestResult>
}

/** 分段开关：选项已选中时用背景色突出 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            option.value === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** 标签徽章：推荐用主题色，其余用中性色 */
function TagBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[10px] font-normal leading-4",
        label === "推荐"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}

export function ChatHeader({
  title,
  model,
  modelGroups,
  modelsLoading,
  onModelChange,
  style,
  onStyleChange,
  apiMode,
  dark,
  onToggleTheme,
  immersive,
  onToggleImmersive,
  onTestConnection,
}: ChatHeaderProps) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await onTestConnection()
    setTesting(false)
    setTestResult(result)
    window.setTimeout(() => setTestResult(null), 5000)
  }
  const current = findGroup(modelGroups, model)
  const currentGroup = current?.group
  const currentSize = current?.variant.size
  const buckets = groupBySeries(modelGroups)

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 transition-colors duration-300",
        immersive && "border-transparent bg-transparent",
      )}
    >
      {/* 移动端布局下侧栏为抽屉，需要触发器；桌面端由品牌 Logo 兼任开关 */}
      <SidebarTrigger
        className={cn("size-8 transition-opacity duration-300 md:hidden", immersive && "pointer-events-none opacity-0")}
      />
      <h1
        className={cn(
          "min-w-0 truncate text-sm font-medium transition-opacity duration-300",
          immersive && "opacity-0",
        )}
      >
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-1.5">
        <div
          className={cn(
            "flex items-center transition-opacity duration-300",
            immersive && "pointer-events-none opacity-0",
          )}
        >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2.5 text-sm text-muted-foreground hover:text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="max-w-44 truncate">
                {currentGroup ? `${currentGroup.name} · ${currentSize}` : "选择模型"}
              </span>
              {modelsLoading ? (
                <Loader2 className="size-3.5 animate-spin opacity-60" />
              ) : (
                <ChevronDown className="size-3.5 opacity-60" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              选择模型（{modelGroups.length}）
            </DropdownMenuLabel>

            {/* 模型滚动列表（视口高度在 288px 基础上放大 30%） */}
            <div className="max-h-[374px] overflow-y-auto pb-1">
              {modelGroups.length === 0 ? (
                <DropdownMenuItem disabled>
                  暂无可用模型，请到设置中刷新列表
                </DropdownMenuItem>
              ) : (
                buckets.map(({ series, groups }) => (
                  <div key={series.key}>
                    <div className="mx-1.5 mb-1 mt-1.5 flex items-baseline justify-between gap-2 rounded-md bg-muted px-2 py-1">
                      <span className="text-xs font-semibold tracking-wide text-foreground">
                        {series.name}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {series.tagline}
                      </span>
                    </div>
                    {groups.map((group) => {
                      const meta = metaFor(group.name)
                      return (
                        <DropdownMenuItem
                          key={group.key}
                          onClick={() => onModelChange(resolveVariant(group, currentSize).id)}
                          className="gap-3 py-3 pl-3.5"
                        >
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium">{group.name}</span>
                              {meta.tags.map((tag) => (
                                <TagBadge key={tag} label={tag} />
                              ))}
                            </span>
                            {meta.description && (
                              <span className="truncate text-xs font-normal text-muted-foreground">
                                {meta.description}
                              </span>
                            )}
                          </span>
                          {group.key === currentGroup?.key && (
                            <Check className="size-4 shrink-0" />
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <DropdownMenuSeparator />

            {/* 固定区：上下文长度 + 风格 */}
            <div className="space-y-2 p-1.5">
              {currentGroup && currentGroup.variants.length > 1 && (
                <div>
                  <p className="mb-1 px-0.5 text-xs font-medium text-muted-foreground">上下文长度</p>
                  <Segmented
                    options={currentGroup.variants.map((v) => ({ value: v.id, label: v.size }))}
                    value={model}
                    onChange={onModelChange}
                  />
                </div>
              )}
              {apiMode === "card" && (
                <div>
                  <p className="mb-1 px-0.5 text-xs font-medium text-muted-foreground">风格</p>
                  <Segmented options={STYLE_OPTIONS} value={style} onChange={onStyleChange} />
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 测试连接：紧邻沉浸按钮左侧，结果短暂显示后自动收起 */}
        {testResult && (
          <span
            title={testResult.text}
            className={cn(
              "max-w-44 truncate text-xs",
              testResult.ok ? "text-emerald-600 dark:text-emerald-500" : "text-destructive",
            )}
          >
            {testResult.ok ? "连接正常" : testResult.text}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          disabled={testing}
          onClick={() => void runTest()}
          aria-label="测试连接"
          title="测试连接"
        >
          {testing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : testResult && !testResult.ok ? (
            <WifiOff className="size-4 text-destructive" />
          ) : testResult ? (
            <Wifi className="size-4 text-emerald-600 dark:text-emerald-500" />
          ) : (
            <Wifi className="size-4" />
          )}
        </Button>
        </div>

        {/* 沉浸模式切换：常驻显示（沉浸时也保留），位于主题按钮左侧 */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onToggleImmersive}
          aria-label={immersive ? "退出沉浸模式" : "进入沉浸模式"}
          title={immersive ? "退出沉浸模式" : "进入沉浸模式"}
        >
          {immersive ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 text-muted-foreground transition-opacity duration-300 hover:text-foreground",
            immersive && "pointer-events-none opacity-0",
          )}
          onClick={onToggleTheme}
          aria-label="切换主题"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}
