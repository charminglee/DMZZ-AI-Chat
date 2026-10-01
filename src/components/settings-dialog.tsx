import { useEffect, useState } from "react"
import { Check, Eye, EyeOff, Loader2, LogIn, RefreshCw, Wifi } from "lucide-react"
import { testApiConnection } from "@/lib/api"
import { getSiteStatus } from "@/lib/site-channel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { SettingsController } from "@/hooks/use-settings"
import { findGroup, resolveVariant, sizeSummary } from "@/lib/model-groups"
import { groupBySeries } from "@/lib/model-series"
import { cn } from "@/lib/utils"
import type { ApiMode, ApiSettings } from "@/lib/types"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  controller: SettingsController
}

const MODE_OPTIONS: Array<{ value: ApiMode; label: string; hint: string }> = [
  { value: "openai", label: "OpenAI 兼容 (v1)", hint: "通用 Chat Completions，messages 请求体" },
  { value: "card", label: "角色卡 (v2)", hint: "支持角色设定、用户称呼与多轮对话" },
  { value: "web", label: "网页通道 (实验)", hint: "借助 dzmm.ai 登录态，支持深度思考与记忆增强" },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

/** 开/关胶囊开关（与上下文长度切换同一视觉语言） */
function PillToggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        on
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** 网页通道登录状态行：进入网页模式时检查，可唤起登录窗口 */
function SiteLoginRow() {
  const [checking, setChecking] = useState(false)
  const [logging, setLogging] = useState(false)
  const [state, setState] = useState<{ loggedIn?: boolean; name?: string | null }>({})

  const check = async () => {
    if (!window.desktop?.dzmm) return
    setChecking(true)
    try {
      setState(await getSiteStatus())
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openLogin = async () => {
    const bridge = window.desktop?.dzmm
    if (!bridge) return
    setLogging(true)
    try {
      const result = await bridge.login()
      setState({ loggedIn: result.ok, name: result.name })
    } finally {
      setLogging(false)
    }
  }

  if (!window.desktop?.dzmm) {
    return (
      <p className="text-xs text-destructive">网页通道仅桌面版可用（请使用 Electron 启动）</p>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs"
        disabled={logging || checking || state.loggedIn}
        onClick={() => void openLogin()}
      >
        {logging ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
        {state.loggedIn ? "已登录" : "打开登录窗口"}
      </Button>
      <span className="min-w-0 text-xs text-muted-foreground">
        {checking
          ? "检查登录状态…"
          : state.loggedIn
            ? `已登录${state.name ? `：${state.name}` : ""}`
            : "未登录（会弹出 dzmm.ai 窗口，登录后自动隐藏）"}
      </span>
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange, controller }: SettingsDialogProps) {
  const { modelGroups, modelsLoading, modelsError, refreshModels } = controller
  const [draft, setDraft] = useState<ApiSettings>(controller.settings)
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  // 每次打开时同步最新配置
  useEffect(() => {
    if (open) {
      setDraft(controller.settings)
      setTestResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (p: Partial<ApiSettings>) => setDraft((prev) => ({ ...prev, ...p }))
  const patchCard = (p: Partial<ApiSettings["card"]>) =>
    setDraft((prev) => ({ ...prev, card: { ...prev.card, ...p } }))

  const currentMatch = findGroup(modelGroups, draft.model)
  const currentGroup = currentMatch?.group
  const currentVariant = currentMatch?.variant

  const save = () => {
    controller.updateSettings(draft)
    onOpenChange(false)
  }

  const testConnection = () => {
    setTesting(true)
    setTestResult(null)
    testApiConnection(draft, controller.userId, (result) => {
      setTesting(false)
      setTestResult(result)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            配置 AI 接入方式与角色设定，保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>

        {/* px-1 + -mx-1：左右对称留出聚焦光晕(ring-3 是外发光)的绘制空间，
            overflow-y-auto 会把 overflow-x 一并变为裁剪；负边距抵消 padding 保持对齐 */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-1 -mx-1">
          <section>
            <SectionTitle>接入方式</SectionTitle>
            <RadioGroup
              value={draft.mode}
              onValueChange={(value) => patch({ mode: value as ApiMode })}
              className="gap-2"
            >
              {MODE_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`mode-${option.value}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors",
                    draft.mode === option.value
                      ? "border-primary/50 bg-accent/60"
                      : "hover:bg-accent/40",
                  )}
                >
                  <RadioGroupItem value={option.value} id={`mode-${option.value}`} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </section>

          {draft.mode !== "web" && (
            <section>
              <SectionTitle>API Token</SectionTitle>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={draft.token}
                    onChange={(e) => patch({ token: e.target.value })}
                    placeholder="Bearer Token"
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? "隐藏 Token" : "显示 Token"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </section>
          )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle>模型</SectionTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    disabled={modelsLoading}
                    onClick={() => void refreshModels(draft.token)}
                  >
                    {modelsLoading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    刷新列表
                  </Button>
                </div>
                <Select
                  value={currentGroup?.key ?? ""}
                  onValueChange={(key) => {
                    const group = modelGroups.find((g) => g.key === key)
                    if (group) patch({ model: resolveVariant(group, currentVariant?.size).id })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={6}
                    className="max-h-[min(16rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]"
                  >
                    {groupBySeries(modelGroups).map(({ series, groups }) => (
                      <SelectGroup key={series.key}>
                        <SelectLabel className="text-xs text-muted-foreground">
                          {series.name} · {series.tagline}
                        </SelectLabel>
                        {groups.map((group) => (
                          <SelectItem key={group.key} value={group.key}>
                            <span className="flex w-full items-center justify-between gap-3">
                              <span>{group.name}</span>
                              <span className="text-xs text-muted-foreground">{sizeSummary(group)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {currentGroup && currentGroup.variants.length > 1 && (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs">上下文长度</Label>
                    <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
                      {currentGroup.variants.map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => patch({ model: variant.id })}
                          className={cn(
                            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                            variant.id === draft.model
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {variant.size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {modelsError && (
                  <p className="mt-2 text-xs text-destructive">{modelsError}</p>
                )}
              </section>

              {draft.mode === "web" && (
                <section>
                  <SectionTitle>网页通道</SectionTitle>
                  <div className="space-y-3">
                    <SiteLoginRow />
                    <div className="space-y-1.5">
                      <Label htmlFor="site-card" className="text-xs">站点角色卡 ID</Label>
                      <Input
                        id="site-card"
                        value={draft.siteCardId}
                        onChange={(e) => patch({ siteCardId: e.target.value.trim() })}
                        placeholder="角色页地址里的数字，如 3613349"
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">深度思考</span>
                      <PillToggle
                        on={draft.siteDeepThinking}
                        onClick={() => patch({ siteDeepThinking: !draft.siteDeepThinking })}
                      >
                        {draft.siteDeepThinking ? "开" : "关"}
                      </PillToggle>
                      <span className="ml-3 text-xs text-muted-foreground">记忆增强</span>
                      <PillToggle
                        on={draft.siteMemoryEnhance}
                        onClick={() => patch({ siteMemoryEnhance: !draft.siteMemoryEnhance })}
                      >
                        {draft.siteMemoryEnhance ? "开" : "关"}
                      </PillToggle>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      通过内置隐藏浏览器使用你在 dzmm.ai
                      的登录态调用站点接口，消耗网站积分、与网页同计费；支持深度思考与记忆增强。属非官方实验功能，网站改版可能失效。
                    </p>
                  </div>
                </section>
              )}

              {draft.mode === "card" && (
                <>
                  <section>
                    <SectionTitle>角色卡</SectionTitle>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="card-name" className="text-xs">角色名</Label>
                        <Input
                          id="card-name"
                          value={draft.card.name}
                          onChange={(e) => patchCard({ name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="card-user" className="text-xs">你的称呼</Label>
                        <Input
                          id="card-user"
                          value={draft.userName}
                          onChange={(e) => patch({ userName: e.target.value })}
                          placeholder="角色如何称呼你"
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {(
                        [
                          ["description", "角色描述"],
                          ["personality", "性格"],
                          ["scenario", "场景"],
                          ["first_message", "开场白"],
                          ["system_prompt", "系统提示"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-1.5">
                          <Label htmlFor={`card-${key}`} className="text-xs">{label}</Label>
                          <Textarea
                            id={`card-${key}`}
                            rows={2}
                            value={draft.card[key]}
                            onChange={(e) => patchCard({ [key]: e.target.value })}
                            className="min-h-0 resize-y text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {draft.mode !== "web" && (
                <section>
                  <SectionTitle>生成参数</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="temperature" className="text-xs">
                      温度（0~2，越高越随机）
                    </Label>
                    <Input
                      id="temperature"
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={draft.temperature}
                      onChange={(e) =>
                        patch({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="max-tokens" className="text-xs">
                      最大回复长度（tokens）
                    </Label>
                    <Input
                      id="max-tokens"
                      type="number"
                      min={50}
                      max={20000}
                      step={50}
                      value={draft.maxTokens}
                      onChange={(e) =>
                        patch({ maxTokens: Math.min(20000, Math.max(50, Number(e.target.value) || 6000)) })
                      }
                    />
                  </div>
                </div>
              </section>
              )}

              {draft.mode !== "web" && (
                <section className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={testing}
                  onClick={testConnection}
                >
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
                  测试连接
                </Button>
                {testResult && (
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-xs",
                      testResult.ok ? "text-emerald-600 dark:text-emerald-500" : "text-destructive",
                    )}
                  >
                    {testResult.ok && <Check className="size-3.5 shrink-0" />}
                    <span className="truncate">{testResult.text}</span>
                  </span>
                )}
              </section>
              )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
