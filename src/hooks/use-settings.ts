import { useCallback, useEffect, useMemo, useState } from "react"
import { listApiModels } from "@/lib/api"
import { listSiteModels } from "@/lib/site-channel"
import { groupModels } from "@/lib/model-groups"
import { DEFAULT_SETTINGS, type ApiSettings, type ModelInfo } from "@/lib/types"

const SETTINGS_KEY = "dzmm-settings-v1"
const MODELS_CACHE_KEY = "dzmm-api-models-v1"
const SITE_MODELS_CACHE_KEY = "dzmm-site-models-v1"
const USER_ID_KEY = "dzmm-user-id"

const MODES: ApiSettings["mode"][] = ["openai", "card", "web"]

function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ApiSettings>
    const mode = MODES.includes(parsed.mode as ApiSettings["mode"])
      ? (parsed.mode as ApiSettings["mode"])
      : DEFAULT_SETTINGS.mode
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      mode,
      card: { ...DEFAULT_SETTINGS.card, ...(parsed.card ?? {}) },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function loadCachedModels(key: string): ModelInfo[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as ModelInfo[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 稳定的匿名用户 id，用于 v2 接口的 user_id */
function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = `dzmm_${crypto.randomUUID().slice(0, 12)}`
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function useSettings() {
  const [settings, setSettings] = useState<ApiSettings>(loadSettings)
  const modelsCacheKey = settings.mode === "web" ? SITE_MODELS_CACHE_KEY : MODELS_CACHE_KEY
  const [apiModels, setApiModels] = useState<ModelInfo[]>(() =>
    loadCachedModels(loadSettings().mode === "web" ? SITE_MODELS_CACHE_KEY : MODELS_CACHE_KEY),
  )
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const userId = useMemo(getUserId, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  const refreshModels = useCallback(
    async (token = settings.token) => {
      setModelsLoading(true)
      setModelsError(null)
      try {
        let models: ModelInfo[]
        if (settings.mode === "web") {
          // 网页通道：模型列表来自站点（含 32K 变体与深度思考标记），不依赖 API Token
          models = await listSiteModels()
        } else {
          if (!token.trim()) {
            setModelsError("未配置 API Token")
            return
          }
          models = await listApiModels(token)
        }
        setApiModels(models)
        localStorage.setItem(modelsCacheKey, JSON.stringify(models))
        // 当前模型不在列表里时，自动切到第一个可用模型
        setSettings((prev) =>
          models.some((m) => m.id === prev.model) || models.length === 0
            ? prev
            : { ...prev, model: models[0].id },
        )
      } catch (error) {
        setModelsError(error instanceof Error ? error.message : String(error))
      } finally {
        setModelsLoading(false)
      }
    },
    [settings.mode, modelsCacheKey, settings.token],
  )

  // 模式切换或有 Token 时后台刷新模型列表；有缓存则先展示缓存
  useEffect(() => {
    const cached = loadCachedModels(
      settings.mode === "web" ? SITE_MODELS_CACHE_KEY : MODELS_CACHE_KEY,
    )
    if (cached.length > 0) setApiModels(cached)
    if (settings.mode === "web") {
      if (window.desktop?.dzmm) void refreshModels()
    } else if (settings.token.trim()) {
      void refreshModels(settings.token)
    }
    // 仅在模式 / Token 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, settings.token])

  const updateSettings = useCallback((patch: Partial<ApiSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  /** 可选模型：API 拉取到的列表 */
  const models: ModelInfo[] = apiModels
  /** 按基础模型分组（容量变体合并在组内） */
  const modelGroups = useMemo(() => groupModels(apiModels), [apiModels])

  return {
    settings,
    updateSettings,
    models,
    modelGroups,
    modelsLoading,
    modelsError,
    refreshModels,
    userId,
  }
}

export type SettingsController = ReturnType<typeof useSettings>
