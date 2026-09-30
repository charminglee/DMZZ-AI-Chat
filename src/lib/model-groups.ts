import type { ModelInfo } from "@/lib/types"

/** 模型容量变体（如 16K / 32K / 64K） */
export interface ModelVariant {
  id: string
  size: string
}

/** 同一基础模型的不同容量变体归为一组 */
export interface ModelGroup {
  key: string
  name: string
  variants: ModelVariant[]
}

/** 名称形如 "Dash-0826 (128K)"，从中拆出基础名与容量 */
const SIZE_PATTERN = /^(.*?)\s*\((\d+K)\)\s*$/

function sizeValue(size: string): number {
  const n = parseInt(size, 10)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/**
 * 按名称中的容量后缀把模型列表分组：
 * "Dash-0826 (16K)" 与 "Dash-0826 (64K)" → 组 "Dash-0826"，变体按容量升序。
 */
export function groupModels(models: ModelInfo[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()
  for (const model of models) {
    const match = model.name.match(SIZE_PATTERN)
    const base = match ? match[1] : model.name
    const size = match ? match[2] : "默认"
    const group = map.get(base) ?? { key: base, name: base, variants: [] }
    group.variants.push({ id: model.id, size })
    map.set(base, group)
  }
  for (const group of map.values()) {
    group.variants.sort((a, b) => sizeValue(a.size) - sizeValue(b.size))
  }
  return [...map.values()]
}

/** 当前模型所属的分组与变体 */
export function findGroup(
  groups: ModelGroup[],
  modelId: string,
): { group: ModelGroup; variant: ModelVariant } | null {
  for (const group of groups) {
    const variant = group.variants.find((v) => v.id === modelId)
    if (variant) return { group, variant }
  }
  return null
}

/** 组内按首选容量取变体；缺失时退回该组最大容量（变体已按容量升序） */
export function resolveVariant(group: ModelGroup, preferredSize?: string): ModelVariant {
  return (
    group.variants.find((v) => v.size === preferredSize) ??
    group.variants[group.variants.length - 1]
  )
}

/** 组内可选容量，展示用："16K / 32K / 64K" */
export function sizeSummary(group: ModelGroup): string {
  return group.variants.map((v) => v.size).join(" / ")
}
