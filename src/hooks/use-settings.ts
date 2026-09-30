import { useCallback, useEffect, useMemo, useState } from "react"
import { listApiModels } from "@/lib/api"
import { groupModels } from "@/lib/model-groups"
import { DEFAULT_SETTINGS, type ApiSettings, type ModelInfo } from "@/lib/types"

const SETTINGS_KEY = "dmzz-settings-v1"
const MODELS_CACHE_KEY = "dmzz-api-models-v1"
const USER_ID_KEY = "dmzz-user-id"

function loadSettings(): ApiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<ApiSettings>
    const mode = parsed.mode === "openai" || parsed.mode === "card" ? parsed.mode : DEFAULT_SETTINGS.mode
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

function loadCachedModels(): ModelInfo[] {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY)
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
    id = `dmzz_${crypto.randomUUID().slice(0, 12)}`
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function useSettings() {
  const [settings, setSettings] = useState<ApiSettings>(loadSettings)
  const [apiModels, setApiModels] = useState<ModelInfo[]>(loadCachedModels)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const userId = useMemo(getUserId, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  const refreshModels = useCallback(
    async (token = settings.token) => {
      if (!token.trim()) {
        setModelsError("未配置 API Token")
        return
      }
      setModelsLoading(true)
      setModelsError(null)
      try {
        const models = await listApiModels(token)
        setApiModels(models)
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(models))
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
    [settings.token],
  )

  // 启动时若有 token，后台刷新模型列表（有缓存则静默更新）
  useEffect(() => {
    if (settings.token.trim()) {
      void refreshModels(settings.token)
    }
    // 仅在 Token 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.token])

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
