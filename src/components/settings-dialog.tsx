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
  { value: "openai", label: "OpenAI 兼容 (v1)", hint: "通用 Chat Completions，messages 请求体。" },
  { value: "card", label: "角色卡 (v2)", hint: "支持角色设定、用户称呼与多轮对话。" },
  { value: "web", label: "网页通道 (实验)", hint: "借助 dzmm.ai 登录态，支持深度思考与记忆增强。" },
]

/** 卡片组：组标题在卡片上方左对齐，卡片内各行以分隔线分隔 */
function SettingsGroup({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border bg-muted/40">
        {children}
      </div>
    </section>
  )
}

/** 卡片内一行：左侧标题+描述，右侧控件（可选），垂直居中 */
function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="max-w-[70%] min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

/** 卡片内容块：铺满整行的编辑区（输入框等），与上下行以分隔线分隔 */
function CardBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-4", className)}>{children}</div>
}

/** iOS 风格开关（行式设置项右侧的控件） */
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
        on ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform",
          on ? "translate-x-5" : "translate-x-0",
      )}
      />
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
      <CardBlock>
      <p className="text-xs text-destructive">网页通道仅桌面版可用（请使用 Electron 启动）</p>
      </CardBlock>
    )
  }

  const status = checking
    ? "正在检查登录状态…"
    : state.loggedIn
      ? `已登录${state.name ? `：${state.name}` : ""}，借助 dzmm.ai 登录态调用站点接口。`
      : "未登录，点击右侧按钮会弹出 dzmm.ai 窗口，登录后自动隐藏。"

  return (
    <SettingsRow title="站点登录" description={status}>
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
    </SettingsRow>
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
      {/* 显式三行轨道：标题行自适应、滚动区吃剩余空间(min 0)、底部按钮行自适应。
          不能传 flex flex-col——DialogContent 基础类是 grid，display 冲突会让
          中间滚动区的高度约束失效，滚动到底时最后一张卡片底部被 footer 裁掉 */}
      <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            配置 AI 接入方式与角色设定，保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>

        {/* px-1 + -mx-1：左右对称留出聚焦光晕(ring-3 是外发光)的绘制空间，
            overflow-y-auto 会把 overflow-x 一并变为裁剪；负边距抵消 padding 保持对齐 */}
        <div className="min-h-0 space-y-6 overflow-y-auto px-1 -mx-1 pb-2">
          <SettingsGroup title="接入方式">
            <RadioGroup
              value={draft.mode}
              onValueChange={(value) => patch({ mode: value as ApiMode })}
              className="divide-y divide-border/60 gap-0"
            >
              {MODE_OPTIONS.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`mode-${option.value}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 p-4 font-normal transition-colors",
                    draft.mode === option.value
                      ? "bg-accent/60"
                      : "hover:bg-accent/40",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                  <RadioGroupItem
                    value={option.value}
                    id={`mode-${option.value}`}
                    className="shrink-0"
                  />
                </Label>
              ))}
            </RadioGroup>
          </SettingsGroup>

          {draft.mode !== "web" && (
            <SettingsGroup title="API Token">
              <CardBlock className="space-y-3">
                <div className="max-w-[70%] space-y-0.5">
                  <p className="text-sm font-medium">访问令牌</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Bearer Token，仅保存在本地浏览器中。
                  </p>
                </div>
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
              </CardBlock>
            </SettingsGroup>
          )}

          <SettingsGroup title="模型">
            <SettingsRow
              title="模型选择"
              description={
                modelsLoading ? "正在拉取模型列表…" : "从接口拉取可用模型，按系列分组"
              }
            >
              <div className="flex items-center gap-2">
              <Select
                value={currentGroup?.key ?? ""}
                onValueChange={(key) => {
                  const group = modelGroups.find((g) => g.key === key)
                  if (group) patch({ model: resolveVariant(group, currentVariant?.size).id })
                }}
              >
                  <SelectTrigger className="w-72">
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={modelsLoading}
                  onClick={() => void refreshModels(draft.token)}
                  aria-label="刷新列表"
                  title="刷新列表"
                >
                  {modelsLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
              </div>
            </SettingsRow>
              {currentGroup && currentGroup.variants.length > 1 && (
              <SettingsRow title="上下文长度">
                <div className="flex w-72 gap-0.5 rounded-lg bg-muted/60 p-0.5">
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
              </SettingsRow>
            )}
            {modelGroups.length === 0 && !modelsError && !modelsLoading && (
              <CardBlock>
                <p className="max-w-[70%] text-xs leading-relaxed text-muted-foreground">
                  还没有模型列表，点击上方「刷新列表」按钮从接口获取可用模型。
                </p>
              </CardBlock>
              )}
              {modelsError && (
              <CardBlock>
                <p className="text-xs text-destructive">{modelsError}</p>
              </CardBlock>
              )}
          </SettingsGroup>

          {draft.mode === "web" && (
            <SettingsGroup title="网页通道">
                <SiteLoginRow />
              <SettingsRow
                title="深度思考"
                description="角色扮演深度思考功能让AI角色在回复前先进行思考分析，帮助角色更好地理解场景、分析设定、规划回应策略。"
              >
                <Toggle
                  on={draft.siteDeepThinking}
                  onClick={() => patch({ siteDeepThinking: !draft.siteDeepThinking })}
                  label="深度思考"
                />
              </SettingsRow>
              <SettingsRow
                title="记忆增强"
                description="通过对久远记忆进行稀疏化处理，在计算预算不变的情况下实现更长的上下文视野。"
              >
                <Toggle
                  on={draft.siteMemoryEnhance}
                  onClick={() => patch({ siteMemoryEnhance: !draft.siteMemoryEnhance })}
                  label="记忆增强"
                />
              </SettingsRow>
              <SettingsRow
                title="站点角色卡 ID"
                description={
                  "通过内置隐藏浏览器使用你在 dzmm.ai 的登录态调用站点接口，消耗网站积分、与网页同计费；属非官方实验功能，网站改版可能失效。"
                }
              >
                <Input
                  id="site-card"
                  value={draft.siteCardId}
                  onChange={(e) => patch({ siteCardId: e.target.value.trim() })}
                  placeholder="角色页地址里的数字，如 3613349"
                  className="w-28 font-mono text-xs"
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {draft.mode === "card" && (
            <SettingsGroup title="角色卡">
              <CardBlock className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="card-name" className="text-sm font-medium">角色名</Label>
                  <Input
                    id="card-name"
                    value={draft.card.name}
                    onChange={(e) => patchCard({ name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-user" className="text-sm font-medium">你的称呼</Label>
                  <Input
                    id="card-user"
                    value={draft.userName}
                    onChange={(e) => patch({ userName: e.target.value })}
                    placeholder="角色如何称呼你"
                  />
                </div>
              </CardBlock>
              {(
                [
                  ["description", "角色描述"],
                  ["personality", "性格"],
                  ["scenario", "场景"],
                  ["first_message", "开场白"],
                  ["system_prompt", "系统提示"],
                ] as const
              ).map(([key, label]) => (
                <CardBlock key={key} className="space-y-1.5">
                  <Label htmlFor={`card-${key}`} className="text-sm font-medium">{label}</Label>
                  <Textarea
                    id={`card-${key}`}
                    rows={2}
                    value={draft.card[key]}
                    onChange={(e) => patchCard({ [key]: e.target.value })}
                    className="min-h-0 resize-y text-sm"
                  />
                </CardBlock>
              ))}
            </SettingsGroup>
          )}

          {draft.mode !== "web" && (
            <SettingsGroup title="生成参数">
              <SettingsRow title="温度" description="0~2，越高输出越随机。">
                <Input
                  id="temperature"
                  aria-label="温度"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) =>
                    patch({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })
                  }
                  className="w-28"
                />
              </SettingsRow>
              <SettingsRow title="最大回复长度" description="单次回复的 token 上限（50~20000）。">
                <Input
                  id="max-tokens"
                  aria-label="最大回复长度"
                  type="number"
                  min={50}
                  max={20000}
                  step={50}
                  value={draft.maxTokens}
                  onChange={(e) =>
                    patch({ maxTokens: Math.min(20000, Math.max(50, Number(e.target.value) || 6000)) })
                  }
                  className="w-28"
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {draft.mode !== "web" && (
            <SettingsGroup title="连接测试">
              <SettingsRow
                title="测试当前配置"
                description="用上方填写的接口信息发送一次请求，验证连通性。"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={testing}
                  onClick={testConnection}
                >
                  {testing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wifi className="size-3.5" />
                  )}
                  测试连接
                </Button>
              </SettingsRow>
              {testResult && (
                <CardBlock>
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-xs",
                      testResult.ok ? "text-emerald-600 dark:text-emerald-500" : "text-destructive",
                    )}
                  >
                    {testResult.ok && <Check className="size-3.5 shrink-0" />}
                    <span className="truncate">{testResult.text}</span>
                  </span>
                </CardBlock>
              )}
            </SettingsGroup>
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
