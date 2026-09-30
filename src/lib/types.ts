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

export const MODELS: ModelInfo[] = [
  {
    id: "dmzz-4.5",
    name: "DMZZ 4.5",
    description: "最强大的模型，适合复杂推理与创作",
    badge: "推荐",
  },
  {
    id: "dmzz-4.5-mini",
    name: "DMZZ 4.5 Mini",
    description: "速度快、成本低，适合日常问答",
  },
  {
    id: "dmzz-code",
    name: "DMZZ Code",
    description: "专注编程场景，擅长代码生成与调试",
    badge: "Beta",
  },
]
