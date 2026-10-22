import type { Card } from '@/features/auth/auth-service'

/** Luhn check, so obviously mistyped card numbers are caught before "paying". */
export const luhn = (num: string): boolean => {
  const d = num.replace(/\D/g, '')
  if (d.length < 13) return false
  let sum = 0
  d.split('')
    .reverse()
    .forEach((ch, i) => {
      let n = Number(ch)
      if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2
      sum += n
    })
  return sum % 10 === 0
}

export const brandOf = (num: string): string => {
  const d = num.replace(/\D/g, '')
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'Amex'
  return 'Card'
}

/** Only the brand, last four digits and expiry are ever kept. */
export const toCard = (number: string, expiry: string): Card => ({
  brand: brandOf(number),
  last4: number.replace(/\D/g, '').slice(-4),
  exp: expiry
})

export const validateCard = (number: string, expiry: string, cvc: string): string | null => {
  if (!luhn(number)) return 'That card number does not look right.'
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return 'Enter the expiry as MM/YY.'
  if (!/^\d{3,4}$/.test(cvc)) return 'Enter the 3 or 4 digit security code.'
  return null
}
