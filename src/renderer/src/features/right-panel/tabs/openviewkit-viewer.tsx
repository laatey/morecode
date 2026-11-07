import React, { useEffect, useMemo, useState } from 'react'
import { FileViewer, configureAssets } from 'openviewkit'
import 'openviewkit/styles.css'
import './openviewkit.css'

// Self-host the engines openviewkit would otherwise pull from public CDNs, so previews work offline
// and under the app's strict CSP.
let assetsReady: Promise<void> | null = null
function setupAssets(): Promise<void> {
  assetsReady ??= Promise.all([
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('7z-wasm/7zz.wasm?url')
  ]).then(([pdf, sqlite, sevenZip]) => {
    configureAssets({
      pdfWorker: pdf.default,
      sqliteWasm: sqlite.default,
      sevenZipWasm: sevenZip.default
    })
  })
  return assetsReady
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The viewer reads these as CSS custom properties, so they follow the active theme with no re-render. */
const THEME = {
  bg: 'var(--background)',
  surface: 'var(--muted)',
  surfaceAlt: 'var(--secondary)',
  border: 'var(--border)',
  text: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  accent: 'var(--primary)',
  accentContrast: 'var(--primary-foreground)',
  radius: '0px'
}

function Host({ file }: { file: File }): React.JSX.Element {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void setupAssets()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
  return (
    <div className="ovk-host">
      <FileViewer file={file} header={false} theme={THEME} />
    </div>
  )
}

/** Previews files from disk (PDF, audio, video, CAD, 3D, archives, ebooks, data files, …). */
export default function OpenViewKitViewer({
  base64,
  mime,
  path
}: {
  base64: string
  mime: string
  path: string
}): React.JSX.Element {
  const file = useMemo(
    () =>
      new File([base64ToBytes(base64)], path.split('/').pop() ?? path, {
        type: mime === 'application/octet-stream' ? '' : mime
      }),
    [base64, mime, path]
  )
  return <Host file={file} />
}

/** Previews text that is being edited in the tab (CSV/TSV table view). */
export function OpenViewKitText({ text, path }: { text: string; path: string }): React.JSX.Element {
  const file = useMemo(() => new File([text], path.split('/').pop() ?? path), [text, path])
  return <Host file={file} />
}
