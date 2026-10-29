import React, { useState } from 'react'
import { cn } from '@/lib/utils'

import asanaLogo from '@/assets/brand-logos/asana.svg'
import atlassianLogo from '@/assets/brand-logos/atlassian.svg'
import canvaLogo from '@/assets/brand-logos/canva.svg'
import cloudflareLogo from '@/assets/brand-logos/cloudflare.svg'
import driveLogo from '@/assets/brand-logos/drive.svg'
import figmaLogo from '@/assets/brand-logos/figma.svg'
import githubLogo from '@/assets/brand-logos/github.svg'
import gmailLogo from '@/assets/brand-logos/gmail.svg'
import googleCalendarLogo from '@/assets/brand-logos/google-calendar.svg'
import googleSheetsLogo from '@/assets/brand-logos/google-sheets.svg'
import huggingfaceLogo from '@/assets/brand-logos/hugging_face.svg'
import linearLogo from '@/assets/brand-logos/linear.svg'
import microsoftLogo from '@/assets/brand-logos/microsoft.svg'
import notionLogo from '@/assets/brand-logos/notion.svg'
import paypalLogo from '@/assets/brand-logos/paypal.svg'
import playwrightLogo from '@/assets/brand-logos/playwright.svg'
import sentryLogo from '@/assets/brand-logos/sentry.svg'
import slackLogo from '@/assets/brand-logos/slack.svg'
import stripeLogo from '@/assets/brand-logos/stripe.svg'
import supabaseLogo from '@/assets/brand-logos/supabase.svg'
import vercelLogo from '@/assets/brand-logos/vercel.svg'

const BRAND_LOGOS: Record<string, string> = {
  asana: asanaLogo,
  atlassian: atlassianLogo,
  jira: atlassianLogo,
  confluence: atlassianLogo,
  canva: canvaLogo,
  cloudflare: cloudflareLogo,
  'cloudflare-docs': cloudflareLogo,
  drive: driveLogo,
  'google-drive': driveLogo,
  figma: figmaLogo,
  github: githubLogo,
  gmail: gmailLogo,
  'google-calendar': googleCalendarLogo,
  'google-sheets': googleSheetsLogo,
  huggingface: huggingfaceLogo,
  'hugging-face': huggingfaceLogo,
  linear: linearLogo,
  microsoft: microsoftLogo,
  notion: notionLogo,
  'notion-local': notionLogo,
  paypal: paypalLogo,
  playwright: playwrightLogo,
  sentry: sentryLogo,
  slack: slackLogo,
  stripe: stripeLogo,
  supabase: supabaseLogo,
  vercel: vercelLogo
}

function resolveBrandLogo(id?: string, domain?: string, name?: string): string | undefined {
  const norm = (s?: string): string => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  const idKey = (id || '').toLowerCase().trim()
  if (idKey && BRAND_LOGOS[idKey]) return BRAND_LOGOS[idKey]

  const cleanDomain = (domain || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  const hostParts = cleanDomain.split('.')
  const domainKey = hostParts.length >= 2 ? hostParts[hostParts.length - 2] : cleanDomain
  if (domainKey && BRAND_LOGOS[domainKey]) return BRAND_LOGOS[domainKey]

  const nameKey = (name || '').toLowerCase().trim()
  if (nameKey && BRAND_LOGOS[nameKey]) return BRAND_LOGOS[nameKey]

  const normName = norm(name)
  for (const [k, src] of Object.entries(BRAND_LOGOS)) {
    if (norm(k) === normName || normName.includes(norm(k))) {
      return src
    }
  }

  return undefined
}

/** A connector's logo: using local crisp brand logos where available, falling back to Google favicons or a letter tile. */
export function ConnectorLogo({
  id,
  domain,
  name,
  size = 28,
  className
}: {
  id?: string
  domain?: string
  name: string
  size?: number
  className?: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const brandLogo = resolveBrandLogo(id, domain, name)

  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[#222220] border border-[#333330] text-[#f1f1ef]',
        className
      )}
    >
      {brandLogo ? (
        <img
          src={brandLogo}
          alt={name}
          draggable={false}
          style={{ width: Math.round(size * 0.82), height: Math.round(size * 0.82) }}
          className="object-contain"
        />
      ) : domain && !failed ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          style={{ width: Math.round(size * 0.82), height: Math.round(size * 0.82) }}
          className="object-contain"
        />
      ) : (
        <span style={{ fontSize: size * 0.52 }} className="font-medium uppercase">
          {name.trim().charAt(0) || '?'}
        </span>
      )}
    </span>
  )
}
