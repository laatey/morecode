import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The few Paystack calls MoreCode needs. Amounts are in the currency's smallest unit (pesewas for GHS,
 * kobo for NGN, cents for USD), exactly as Paystack wants them.
 */

export class PaystackError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/** Paystack signs every webhook with HMAC-SHA512 of the raw request body, using your secret key. */
export function validSignature(secret, rawBody, signature) {
  if (!secret || typeof signature !== 'string' || !signature) return false
  const want = createHmac('sha512', secret).update(rawBody).digest()
  const got = Buffer.from(signature, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

export function createPaystack({ secret, base, fetchImpl = fetch }) {
  async function call(method, path, body) {
    let res
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      })
    } catch {
      throw new PaystackError('Could not reach Paystack.', 502)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.status === false) throw new PaystackError(data.message || 'Paystack refused the request.', res.status)
    return data.data
  }

  return {
    /** Starts a payment. With `plan` set, Paystack also creates the recurring subscription once it succeeds. */
    initialize: (p) => call('POST', '/transaction/initialize', p),
    verify: (reference) => call('GET', `/transaction/verify/${encodeURIComponent(reference)}`),
    listPlans: () => call('GET', '/plan?perPage=100'),
    createPlan: (p) => call('POST', '/plan', p),
    disableSubscription: (code, token) => call('POST', '/subscription/disable', { code, token }),
    getSubscription: (code) => call('GET', `/subscription/${encodeURIComponent(code)}`),
    /** A link where the customer can change the card a subscription is charged to. */
    manageLink: (code) => call('GET', `/subscription/${encodeURIComponent(code)}/manage/link`)
  }
}
