const htmlOf = (text) =>
  `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1c1b;max-width:480px">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\n/g, '<br>')
    .replace(/\b(\d{6})\b/, '<strong style="font-size:22px;letter-spacing:3px">$1</strong>')}</div>`

/** Sends email through Resend, through your own webhook, or (development only) to the console. */
export function createMailer(config, fetchImpl = fetch) {
  const fail = async (res, who) => {
    const detail = await res.text().catch(() => '')
    throw new Error(`${who} refused the message (${res.status}) ${detail.slice(0, 200)}`)
  }
  return {
    async send(to, subject, text) {
      if (config.mailMode === 'resend') {
        const res = await fetchImpl(`${config.resendBase}/emails`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.resendKey}` },
          body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text, html: htmlOf(text) })
        })
        if (!res.ok) await fail(res, 'Resend')
        return
      }
      if (config.mailMode === 'webhook') {
        const res = await fetchImpl(config.mailWebhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from: config.mailFrom, to, subject, text })
        })
        if (!res.ok) await fail(res, 'The mail service')
        return
      }
      console.log(`\n--- email to ${to} ---\n${subject}\n${text}\n---------------------\n`)
    }
  }
}
