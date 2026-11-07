import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Download, RotateCw, X } from '@/components/icons'
import { cn } from '@/lib/utils'

/** A row of small pictures that open large when clicked. Used in the message box and in sent messages. */
export function ImageThumbs({
  images,
  className,
  thumbClassName,
  renderExtra
}: {
  images: string[]
  className?: string
  thumbClassName?: string
  /** Something drawn on top of a thumbnail, such as a remove button. */
  renderExtra?: (index: number) => React.ReactNode
}): React.JSX.Element | null {
  const [open, setOpen] = useState<number | null>(null)
  // a picture can be removed while it is open; close rather than show a wrong one
  const index = open !== null && open < images.length ? open : null
  if (!images.length) return null
  return (
    <>
      <div className={className}>
        {images.map((src, i) => (
          <div key={i} className="relative">
            <button
              type="button"
              aria-label={`View image ${i + 1} of ${images.length} larger`}
              onClick={() => setOpen(i)}
              className="block cursor-zoom-in rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <img src={src} alt="" className={thumbClassName} />
            </button>
            {renderExtra?.(i)}
          </div>
        ))}
      </div>
      {index !== null && <Lightbox images={images} start={index} onClose={() => setOpen(null)} />}
    </>
  )
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

const glyph = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const }
const PlusGlyph = (): React.JSX.Element => <svg {...glyph}><path d="M12 5v14M5 12h14" /></svg>
const MinusGlyph = (): React.JSX.Element => <svg {...glyph}><path d="M5 12h14" /></svg>
const FitGlyph = (): React.JSX.Element => <svg {...glyph}><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>

/** The picture as a PNG, which is what the clipboard accepts. */
async function toPng(src: string): Promise<Blob> {
  const img = new Image()
  img.src = src
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')?.drawImage(img, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'))
}

function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }): React.JSX.Element {
  const [i, setI] = useState(start)
  const [zoom, setZoom] = useState(1)
  const [turn, setTurn] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const many = images.length > 1

  const reset = useCallback(() => {
    setZoom(1)
    setTurn(0)
    setPan({ x: 0, y: 0 })
  }, [])
  const step = useCallback(
    (d: number) => {
      setI((n) => (n + d + images.length) % images.length)
      reset()
    },
    [images.length, reset]
  )
  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const next = clampZoom(z * factor)
      if (next <= 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])
  const flash = useCallback((text: string) => {
    setNote(text)
    setTimeout(() => setNote(null), 1600)
  }, [])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(images[i]) })])
      flash('Copied')
    } catch {
      flash('Could not copy')
    }
  }
  const save = (): void => {
    const a = document.createElement('a')
    a.href = images[i]
    a.download = `image-${i + 1}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (many && e.key === 'ArrowRight') step(1)
      else if (many && e.key === 'ArrowLeft') step(-1)
      else if (e.key === '+' || e.key === '=') zoomBy(1.25)
      else if (e.key === '-') zoomBy(0.8)
      else if (e.key === '0') reset()
      else if (e.key === 'r' || e.key === 'R') setTurn((t) => t + 90)
    }
    // capture, so Escape closes the picture and not the panel or chat behind it
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [many, onClose, step, zoomBy, reset])

  // the wheel zooms; it needs a non-passive listener to stop the page behind from scrolling
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  const bar = 'grid h-8 w-8 cursor-pointer place-items-center rounded-full text-foreground/85 transition-colors hover:bg-foreground/15 hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent'
  const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

  return createPortal(
    <div
      ref={stage}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      // lighter than before: the chat stays faintly visible behind the picture
      className="fixed inset-0 z-[1000] grid place-items-center overflow-hidden bg-inset/55 p-6 backdrop-blur-[6px]"
    >
      <img
        src={images[i]}
        alt=""
        draggable={false}
        onClick={stop}
        onDoubleClick={() => {
          if (zoom > 1) reset()
          else setZoom(2)
        }}
        onPointerDown={(e) => {
          if (zoom <= 1) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          d.moved = true
          setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })
        }}
        onPointerUp={() => {
          drag.current = null
          setDragging(false)
        }}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${turn}deg)` }}
        className={cn(
          'max-h-[82vh] max-w-[92vw] select-none rounded-lg object-contain shadow-[0_12px_48px_rgba(0,0,0,0.45)]',
          dragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-zoom-in',
          !dragging && 'transition-transform duration-150 ease-out'
        )}
      />

      <button
        type="button"
        aria-label="Close preview"
        title="Close (Esc)"
        onClick={(e) => { stop(e); onClose() }}
        className="absolute right-4 top-4 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-scrim/40 text-scrim-foreground/90 backdrop-blur hover:bg-scrim/60"
      >
        <X className="h-4 w-4" />
      </button>

      {many && (
        <>
          <button type="button" aria-label="Previous image" onClick={(e) => { stop(e); step(-1) }} className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-scrim/40 text-xl text-scrim-foreground/90 backdrop-blur hover:bg-scrim/60">‹</button>
          <button type="button" aria-label="Next image" onClick={(e) => { stop(e); step(1) }} className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-scrim/40 text-xl text-scrim-foreground/90 backdrop-blur hover:bg-scrim/60">›</button>
        </>
      )}

      <div
        onClick={stop}
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-scrim/45 px-1.5 py-1 text-scrim-foreground backdrop-blur-md"
      >
        {many && <span className="px-2.5 text-[12px] tabular-nums text-foreground/70">{i + 1} / {images.length}</span>}
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(0.8)} className={bar}><MinusGlyph /></button>
        <button type="button" aria-label="Reset zoom" title="Reset (0)" onClick={reset} className="h-8 min-w-[48px] cursor-pointer rounded-full px-2 text-[12px] tabular-nums text-foreground/85 hover:bg-foreground/15">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(1.25)} className={bar}><PlusGlyph /></button>
        <button type="button" aria-label="Fit to window" title="Fit to window" onClick={reset} className={bar}><FitGlyph /></button>
        <span className="mx-1 h-4 w-px bg-foreground/15" />
        <button type="button" aria-label="Rotate" title="Rotate (R)" onClick={() => setTurn((t) => t + 90)} className={bar}><RotateCw className="h-4 w-4" /></button>
        <button type="button" aria-label="Copy image" title="Copy image" onClick={() => void copy()} className={bar}><Copy className="h-4 w-4" /></button>
        <button type="button" aria-label="Save image" title="Save image" onClick={save} className={bar}><Download className="h-4 w-4" /></button>
        {note && <span className="pl-1.5 pr-2.5 text-[12px] text-foreground/80">{note}</span>}
      </div>
    </div>,
    document.body
  )
}
