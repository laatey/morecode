import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { languageForName } from '@/lib/highlight'
import { escapeCodeHtml, highlightWithPierre } from '@/lib/pierre-highlight'

/** What a message says when the person sent only attachments. It is never shown. */
// eslint-disable-next-line react-refresh/only-export-components
export const ATTACH_ONLY = ['See the attached.', 'See the attached image.']

/** Text with @file mentions picked out so they read as references. */
export function WithMentions({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {text.split(/((?<=^|\s)@[^\s@]+)/g).map((part, i) =>
        i % 2 ? (
          <span
            key={i}
            title={part.slice(1)}
            className="inline-block max-w-full truncate align-middle rounded-[5px] bg-[#1d4ed8]/30 px-1 py-0 text-[#a9c8ff]"
          >
            {part.slice(1)}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

export function UserBubble({
  text,
  images,
  children
}: {
  text: string
  images?: string[]
  children?: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 2)
  }, [text, open])

  return (
    <div className="flex max-w-[88%] min-w-0 flex-col items-end gap-1.5">
      {images?.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="h-16 w-16 rounded-[6px] border border-white/[0.1] object-cover"
            />
          ))}
        </div>
      ) : null}
      {children}
      {text.trim() && !ATTACH_ONLY.includes(text) ? (
        <div
          onClick={() => clamped && setOpen((o) => !o)}
          className={cn(
            'relative min-w-0 max-w-full rounded-[10px] bg-white/[0.07] px-3 py-2 text-[13px] leading-6',
            clamped && 'cursor-pointer'
          )}
        >
          <p
            ref={ref}
            className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', !open && 'line-clamp-5')}
          >
            <WithMentions text={text} />
          </p>
          {clamped && !open ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-[10px] bg-gradient-to-t from-background/60 to-transparent" />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const language = languageForName(lang)
  const [html, setHtml] = useState(() => escapeCodeHtml(code))

  useEffect(() => {
    let cancelled = false
    setHtml(escapeCodeHtml(code))
    void highlightWithPierre(code, language).then((next) => {
      if (!cancelled) setHtml(next)
    })
    return () => {
      cancelled = true
    }
  }, [code, language])

  return (
    <div className="my-3 overflow-hidden rounded-md border border-white/[0.08] bg-transparent font-mono text-[11.5px]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-1.5 text-[11px] text-muted-foreground font-sans">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          className="hover:text-foreground cursor-pointer transition-colors"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 leading-relaxed bg-transparent">
        <code className="pierre-code bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-6">{children}</p>,
        h1: ({ children }) => (
          <h2 className="mb-2 mt-5 font-display text-[15px] font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-5 font-display text-[15px] font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-4 text-sm font-semibold first:mt-0">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-muted-foreground">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:text-muted-foreground">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1">{children}</li>,
        code: ({ children, className }) => {
          const str = String(children ?? '').replace(/\n$/, '')
          if (!className && !str.includes('\n')) {
            const isFileReference = /(?:^|\/)[\w.@-]+(?:\/[\w.@-]+)*\.(?:[a-z0-9]{1,8})$/i.test(str)
            return (
              <code
                className={cn(
                  'rounded-[6px] border px-1.5 py-0.5 font-mono text-[12px]',
                  isFileReference
                    ? 'border-[#5793ff]/65 bg-[#1d4ed8]/25 text-[#a9c8ff]'
                    : 'border-white/[0.22] bg-white/[0.1] text-[#e1e7ff]'
                )}
              >
                {children}
              </code>
            )
          }
          return <CodeBlock code={str} lang={/language-([\w+-]+)/.exec(className ?? '')?.[1]} />
        },
        pre: ({ children }) => <>{children}</>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-4 border-border/60" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b px-2 py-1.5 font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b px-2 py-1.5">{children}</td>
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
