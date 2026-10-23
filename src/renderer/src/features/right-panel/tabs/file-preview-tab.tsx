import React, { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { IconButton } from '@/components/layout/icon-button'
import { highlightLines, languageFor } from '@/lib/highlight'
import { takeFilePreviewRequest } from '../file-preview-request'
import { TabEmpty, TabToolbar } from './tab-kit'

export function FilePreviewTab(): React.JSX.Element {
  const [path, setPath] = useState<string | null>(() => takeFilePreviewRequest())
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    const open = (): void => setPath(takeFilePreviewRequest())
    window.addEventListener('file-preview:open', open)
    return () => window.removeEventListener('file-preview:open', open)
  }, [])

  useEffect(() => {
    if (!path) return
    let stale = false
    setText(null)
    setImage(null)
    setError(null)
    const imageFile = /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
    const read = imageFile ? window.api.workspace.readImage(path) : window.api.workspace.readFile(path)
    void read.then((result) => {
      if (stale) return
      if (result.ok && 'dataUrl' in result) setImage(result.dataUrl)
      else if (result.ok) setText(result.text)
      else setError(result.error)
    })
    return () => {
      stale = true
    }
  }, [path])

  if (!path) {
    return <TabEmpty icon={FileText} title="Choose a file">Select a file from Code mode to preview it here.</TabEmpty>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabToolbar>
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#ececea]">{path}</span>
        <IconButton title="Open in your editor" onClick={() => void window.api.workspace.openFile(path)}>
          <ExternalLink className="h-3.5 w-3.5" />
        </IconButton>
      </TabToolbar>
      {error ? (
        <p className="p-4 text-[12px] text-[#e8b365]">{error}</p>
      ) : image ? (
        <div className="slim-scroll flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          <img src={image} alt={path} className="max-h-full max-w-full object-contain" />
        </div>
      ) : text === null ? (
        <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
      ) : (
        <CodePreview path={path} text={text} />
      )}
    </div>
  )
}

function CodePreview({ path, text }: { path: string; text: string }): React.JSX.Element {
  const lines = highlightLines(text.split('\n'), languageFor(path))
  return (
    <pre className="slim-scroll hljs min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-[19px] text-[#d6d6d3]">
      <code>
        {lines.map((line, index) => (
          <span key={index} className="block whitespace-pre" dangerouslySetInnerHTML={{ __html: line || ' ' }} />
        ))}
      </code>
    </pre>
  )
}
