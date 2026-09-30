import type { ModelGroup } from "@/lib/model-groups"

/**
 * 模型系列分类（对齐官网的系列划分与文案）。
 * 接口只返回 id/name/context_window，系列归属、描述与标签在此维护。
 */

export interface SeriesMeta {
  key: string
  name: string
  tagline: string
}

/** 展示顺序与官网一致 */
export const SERIES_ORDER: SeriesMeta[] = [
  { key: "apex", name: "APEX 系列", tagline: "巨型实验模型，极致智能" },
  { key: "max", name: "MAX 系列", tagline: "极限性能，极致体验" },
  { key: "xl", name: "XL 系列", tagline: "均衡性价比，优良体验" },
  { key: "turbo", name: "TURBO 系列", tagline: "快速简单，经久耐用" },
  { key: "medium", name: "MEDIUM 系列", tagline: "稳定可靠，性价比优" },
  { key: "other", name: "其他", tagline: "未分类模型" },
]

export interface ModelMeta {
  series: string
  description: string
  tags: string[]
  /** 组内展示顺序（声明顺序） */
  order: number
}

/** [基础模型名, 系列, 描述, 标签]，数组顺序即组内展示顺序 */
const META_LIST: Array<[string, string, string, string[]]> = [
  ["XL-0826", "xl", "稳定均衡，承接清楚，适合常规长聊", ["深度思考"]],

  ["Surge-0505", "apex", "情绪反应快，互动感强，适合高代入角色扮演", ["深度思考", "推荐"]],
  ["Surge-0923-a", "apex", "情绪反应快，互动感强，适合高代入角色扮演", ["深度思考", "推荐"]],
  ["Surge-0923-b", "apex", "情绪反应快，互动感强，适合高代入角色扮演", ["深度思考", "推荐"]],
  ["Dash-0826", "apex", "响应更快、积分消耗更低，适合长对话高频互动", ["高审查", "深度思考", "推荐"]],
  ["Pulse-0731", "apex", "兼顾响应速度与细节表现，适合长对话和高频剧情互动", ["深度思考", "推荐"]],
  ["Dash-0727", "apex", "响应更快、积分消耗更低，适合长对话高频互动", ["深度思考", "推荐"]],
  ["Sigma-0829", "apex", "长线剧情旗舰，结构清楚，适合复杂设定和大篇幅展开", ["VIP3+", "高审查", "深度思考"]],
  ["Sigma-0829-b", "apex", "长线剧情旗舰，结构清楚，适合复杂设定和大篇幅展开", ["VIP3+", "高审查", "深度思考"]],
  ["Flux-0217", "apex", "画面感强，场景推进快，适合沉浸式剧情互动", ["深度思考"]],
  ["Sigma-0621", "apex", "长线剧情旗舰，结构清楚，适合复杂设定和大篇幅展开", ["VIP3+", "深度思考"]],
  ["Neo-0213", "apex", "表达主动，感官强烈，适合高刺激角色扮演", []],
  ["Prism-0626", "apex", "高密度沉浸派，刺激直给，适合强场景", ["深度思考"]],

  ["Max-0826", "max", "旗舰稳定，叙事顺畅，承接直接，适合高质量长聊", ["深度思考"]],

  ["Turbo-0826", "turbo", "旧版低消耗模型，适合基础聊天", ["深度思考"]],
  ["Turbo-0101", "turbo", "低消耗均衡，适合轻量日常聊天", ["深度思考"]],

  ["Medium-0826", "medium", "轻量耐用，互动自然，适合日常陪伴和中低消耗长聊", ["深度思考"]],
]

const META: Record<string, ModelMeta> = (() => {
  const table: Record<string, ModelMeta> = {}
  const orderBySeries: Record<string, number> = {}
  for (const [name, series, description, tags] of META_LIST) {
    const order = (orderBySeries[series] = (orderBySeries[series] ?? 0) + 1)
    table[name] = { series, description, tags, order }
  }
  return table
})()

const SERIES_MAP = new Map(SERIES_ORDER.map((s) => [s.key, s]))

const FALLBACK: ModelMeta = {
  series: "other",
  description: "",
  tags: [],
  order: Number.MAX_SAFE_INTEGER,
}

export function metaFor(modelName: string): ModelMeta {
  return META[modelName] ?? FALLBACK
}

export interface SeriesBucket {
  series: SeriesMeta
  groups: ModelGroup[]
}

/** 把模型分组按系列归类，按官网顺序排列 */
export function groupBySeries(groups: ModelGroup[]): SeriesBucket[] {
  const buckets = new Map<string, ModelGroup[]>()
  for (const group of groups) {
    const key = metaFor(group.name).series
    const list = buckets.get(key) ?? []
    list.push(group)
    buckets.set(key, list)
  }
  return SERIES_ORDER.filter((s) => buckets.has(s.key)).map((series) => ({
    series,
    groups: (buckets.get(series.key) ?? []).sort((a, b) => {
      const orderDiff = metaFor(a.name).order - metaFor(b.name).order
      return orderDiff !== 0 ? orderDiff : a.name.localeCompare(b.name)
    }),
  }))
}

export function seriesOf(seriesKey: string): SeriesMeta {
  return SERIES_MAP.get(seriesKey) ?? SERIES_MAP.get("other")!
}
