export type Role = "user" | "assistant"

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface ModelInfo {
  id: string
  name: string
  description: string
  badge?: string
}

/** 接入方式：OpenAI 兼容 v1 / 角色卡 v2 */
export type ApiMode = "openai" | "card"

export interface CharacterCard {
  name: string
  description: string
  personality: string
  scenario: string
  first_message: string
  system_prompt: string
}

/** 回复风格（v2 接口校验的枚举值） */
export type StyleMode = "standard" | "creative" | "divergent"

export const STYLE_OPTIONS: Array<{ value: StyleMode; label: string }> = [
  { value: "standard", label: "标准" },
  { value: "creative", label: "创意" },
  { value: "divergent", label: "发散" },
]

export interface ApiSettings {
  mode: ApiMode
  token: string
  model: string
  style: StyleMode
  userName: string
  /** 头像：裁剪后的 data URL，空串表示使用默认渐变头像 */
  avatar: string
  temperature: number
  maxTokens: number
  card: CharacterCard
}

/** 服务由用户提供；token 可在设置中更换 */
export const DEFAULT_TOKEN = ""

export const DEFAULT_CARD: CharacterCard = {
  name: "艾琳",
  description: "一位 24 岁的书店店主，性格温和、喜欢文学，说话轻声细语。",
  personality: "温柔、耐心、博学，偶尔引用诗句。",
  scenario: "傍晚的旧书店，客人稀少，窗外下着小雨。",
  first_message: "欢迎光临，今天想找什么书呢？",
  system_prompt: "始终保持角色设定，用自然口语回复，回复简短而有画面感。",
}

export const DEFAULT_SETTINGS: ApiSettings = {
  mode: "openai",
  token: DEFAULT_TOKEN,
  model: "x-apex-surge-0505",
  style: "standard",
  userName: "朋友",
  avatar: "",
  temperature: 0.8,
  maxTokens: 6000,
  card: DEFAULT_CARD,
}
