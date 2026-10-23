import React, { useEffect, useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import { IconButton } from '@/components/layout/icon-button'
import { takeFilePreviewRequest } from '../file-preview-request'
import { TabEmpty, TabToolbar } from './tab-kit'

export function FilePreviewTab(): React.JSX.Element {
  const [path, setPath] = useState<string | null>(() => takeFilePreviewRequest())
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const open = (): void => setPath(takeFilePreviewRequest())
    window.addEventListener('file-preview:open', open)
    return () => window.removeEventListener('file-preview:open', open)
  }, [])

  useEffect(() => {
    if (!path) return
    let stale = false
    setText(null)
    setError(null)
    void window.api.workspace.readFile(path).then((result) => {
      if (stale) return
      if (result.ok) setText(result.text)
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
      ) : text === null ? (
        <p className="p-4 text-[12px] text-muted-foreground">Opening…</p>
      ) : (
        <pre className="slim-scroll min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-[19px] text-[#d6d6d3]">
          <code>{text}</code>
        </pre>
      )}
    </div>
  )
}
