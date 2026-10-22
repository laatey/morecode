import { useEffect, useRef } from 'react'

/** Calls `handler` on Ctrl/Cmd + `key`. */
export function useHotkey(key: string, handler: () => void): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        ref.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key])
}
