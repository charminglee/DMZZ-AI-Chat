import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSiteCard } from "@/lib/site-channel"
import type { SiteCard } from "@/lib/types"

const CARDS_KEY = "dzmm-site-cards-v1"

function loadCards(): SiteCard[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY)
    const parsed = raw ? (JSON.parse(raw) as SiteCard[]) : []
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === "number") : []
  } catch {
    return []
  }
}

/**
 * 站点角色卡库（本地存储）：
 * 添加时按 ID 从 dzmm.ai 拉取卡牌信息；同 ID 再次添加为信息覆盖（刷新）。
 */
export function useCharacterCards() {
  const [cards, setCards] = useState<SiteCard[]>(loadCards)
  // setCards 的镜像：addCard 需要同步判断是否已存在
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  useEffect(() => {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
  }, [cards])

  /** 按 ID 添加/刷新一张角色卡；返回该卡与是否原本已存在 */
  const addCard = useCallback(async (id: number): Promise<{ card: SiteCard; existed: boolean }> => {
    const card = await fetchSiteCard(id)
    if (!card) {
      throw new Error(`没有找到角色卡 #${id}（ID 不存在、已被隐藏或未公开）`)
    }
    const existed = cardsRef.current.some((c) => c.id === card.id)
    setCards((prev) => {
      const index = prev.findIndex((c) => c.id === card.id)
      if (index === -1) return [card, ...prev]
      const next = [...prev]
      // 保留本地保存时间，其余字段用站点最新数据覆盖
      next[index] = { ...card, savedAt: prev[index].savedAt }
      return next
    })
    return { card, existed }
  }, [])

  const removeCard = useCallback((id: number) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return { cards, addCard, removeCard }
}

export type CharacterCardsController = ReturnType<typeof useCharacterCards>
