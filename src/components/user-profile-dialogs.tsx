import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Check, ImagePlus, Trash2, ZoomIn } from "lucide-react"
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

/* ------------------------------ 修改称呼 ------------------------------ */

interface UserNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  onSave: (name: string) => void
}

export function UserNameDialog({ open, onOpenChange, current, onSave }: UserNameDialogProps) {
  const [value, setValue] = useState(current)

  useEffect(() => {
    if (open) setValue(current)
  }, [open, current])

  const save = () => {
    if (!value.trim()) return
    onSave(value.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>修改称呼</DialogTitle>
          <DialogDescription>
            称呼会显示在侧边栏，并作为角色卡接口中的「user_name」。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="user-name" className="text-xs">
            我的称呼
          </Label>
          <Input
            id="user-name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save()
            }}
            placeholder="角色如何称呼你"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={!value.trim()}>
            <Check className="size-4" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ 修改头像 ------------------------------ */

const CROP_SIZE = 224
const OUTPUT_SIZE = 256
const MAX_ZOOM = 3

interface UserAvatarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: string
  onSave: (avatar: string) => void
}

export function UserAvatarDialog({
  open,
  onOpenChange,
  current,
  onSave,
}: UserAvatarDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setImgSrc(null)
      setNatural({ w: 0, h: 0 })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setError(null)
    }
  }, [open])

  const baseScale = natural.w > 0 ? CROP_SIZE / Math.min(natural.w, natural.h) : 1
  const scale = baseScale * zoom
  const dispW = natural.w * scale
  const dispH = natural.h * scale

  const clampOffset = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.min(0, Math.max(CROP_SIZE - w, x)),
      y: Math.min(0, Math.max(CROP_SIZE - h, y)),
    }),
    [],
  )

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件")
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("图片过大（上限 8MB）")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => {
        const b = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight)
        const w = img.naturalWidth * b
        const h = img.naturalHeight * b
        setError(null)
        setImgSrc(src)
        setNatural({ w: img.naturalWidth, h: img.naturalHeight })
        setZoom(1)
        setOffset({ x: (CROP_SIZE - w) / 2, y: (CROP_SIZE - h) / 2 })
      }
      img.onerror = () => setError("图片读取失败")
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  /** 缩放时保持裁剪框中心对准的画面点不变 */
  const applyZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next))
    if (!imgSrc || natural.w === 0) {
      setZoom(z)
      return
    }
    const oldScale = baseScale * zoom
    const newScale = baseScale * z
    // 裁剪框中心对应的图片坐标
    const cx = (CROP_SIZE / 2 - offset.x) / oldScale
    const cy = (CROP_SIZE / 2 - offset.y) / oldScale
    const nextOffset = clampOffset(
      CROP_SIZE / 2 - cx * newScale,
      CROP_SIZE / 2 - cy * newScale,
      natural.w * newScale,
      natural.h * newScale,
    )
    setZoom(z)
    setOffset(nextOffset)
  }

  const save = async () => {
    if (!imgSrc || natural.w === 0) return
    const img = new Image()
    img.src = imgSrc
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const sw = CROP_SIZE / scale
    ctx.drawImage(img, -offset.x / scale, -offset.y / scale, sw, sw, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    onSave(canvas.toDataURL("image/png"))
    onOpenChange(false)
  }

  // 预览缩放系数
  const previewK = 56 / CROP_SIZE

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改头像</DialogTitle>
          <DialogDescription>
            选择图片后拖动调整位置、滑动调整缩放，保存为方形头像。
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) loadFile(file)
            e.target.value = ""
          }}
        />

        {!imgSrc ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ImagePlus className="size-6" />
            <span className="text-sm">点击选择图片</span>
            <span className="text-xs text-muted-foreground/70">支持 JPG / PNG / WebP，最大 8MB</span>
          </button>
        ) : (
          <div className="flex items-center gap-4">
            {/* 裁剪区 */}
            <div
              className="relative shrink-0 cursor-move touch-none overflow-hidden rounded-xl border bg-muted"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current
                if (!drag) return
                setOffset(
                  clampOffset(
                    drag.ox + (e.clientX - drag.x),
                    drag.oy + (e.clientY - drag.y),
                    dispW,
                    dispH,
                  ),
                )
              }}
              onPointerUp={() => {
                dragRef.current = null
              }}
              onPointerCancel={() => {
                dragRef.current = null
              }}
            >
              <img
                src={imgSrc}
                alt="待裁剪"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ width: dispW, height: dispH, left: offset.x, top: offset.y }}
              />
              {/* 网格参考线 */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="border border-white/15" />
                ))}
              </div>
            </div>

            {/* 预览与新图选择 */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="relative size-14 shrink-0 overflow-hidden rounded-full border"
                title="预览"
              >
                <img
                  src={imgSrc}
                  alt="预览"
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: dispW * previewK,
                    height: dispH * previewK,
                    left: offset.x * previewK,
                    top: offset.y * previewK,
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="size-3.5" />
                换一张
              </Button>
            </div>
          </div>
        )}

        {imgSrc && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <ZoomIn className="size-3.5" />
              缩放
            </Label>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </div>
        )}

        {!imgSrc && current && (
          <p className="text-xs text-muted-foreground">当前已设置自定义头像，选择新图片可替换。</p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="sm:justify-between">
          <div>
            {(current || imgSrc) && (
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  onSave("")
                  onOpenChange(false)
                }}
              >
                <Trash2 className="size-4" />
                移除头像
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={!imgSrc}>
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
