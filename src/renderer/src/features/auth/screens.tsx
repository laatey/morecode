import React, { useState } from 'react'
import { ArrowLeft, Check, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from './auth-store'
import { DEMO_CODE, isEmail } from './auth-service'
import { HOSTED } from './http-auth-service'
import { AuthShell, Heading } from './auth-layout'
import {
  Checkbox,
  CodeInput,
  Divider,
  errorText,
  Field,
  FormError,
  PasswordField,
  SecondaryButton,
  SocialButtons,
  Submit,
  TextLink,
  useCountdown
} from './ui'

export type Screen =
  | 'welcome'
  | 'signup'
  | 'verify'
  | 'signin'
  | 'forgot'
  | 'forgot-sent'
  | 'reset'
  | 'reset-done'

export interface ScreenProps {
  go: (s: Screen) => void
  email: string
  setEmail: (e: string) => void
}

const Back = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }): React.JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className="mb-5 -ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[13px] text-[#8d8d8a] transition-colors hover:text-[#ececea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50"
  >
    <ArrowLeft className="h-3.5 w-3.5" />
    {children}
  </button>
)

/** Shared by Welcome, Sign up and Sign in: the Google / GitHub buttons and their error. */
function useSocial(): {
  busy: 'google' | 'github' | null
  error: string | null
  pick: (p: 'google' | 'github') => void
} {
  const { service, setSession } = useAuth()
  const [busy, setBusy] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pick = (p: 'google' | 'github'): void => {
    setBusy(p)
    setError(null)
    service
      .signInWith(p)
      .then(setSession)
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(null))
  }
  return { busy, error, pick }
}

const open = (url: string): void => void window.open(url, '_blank')

export function WelcomeScreen({ go }: ScreenProps): React.JSX.Element {
  const social = useSocial()
  const { others, switchTo } = useAuth()
  const [switching, setSwitching] = useState<string | null>(null)
  return (
    <AuthShell>
      <Heading title="Welcome to MoreCode">
        An AI coding partner that shows you every change before it happens.
      </Heading>
      {others.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-[12.5px] text-[#77776f]">On this computer</p>
          {others.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={switching !== null}
              onClick={() => {
                setSwitching(a.id)
                void switchTo(a.id).finally(() => setSwitching(null))
              }}
              className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-white/[0.1] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-60"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#3b82f6]/25 text-[12px] font-medium text-[#a3c8ff]">
                {(a.name[0] ?? a.email[0] ?? '?').toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-[#ececea]">Continue as {a.name}</span>
                <span className="block truncate text-[12px] text-[#8d8d8a]">{a.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <Submit type="button" onClick={() => go('signup')}>
          Create an account
        </Submit>
        <SecondaryButton onClick={() => go('signin')}>I already have an account</SecondaryButton>
        <div className="py-1">
          <Divider>or continue with</Divider>
        </div>
        <SocialButtons busy={social.busy} onPick={social.pick} />
        <FormError>{social.error}</FormError>
      </div>
      <p className="mt-6 text-[12px] leading-5 text-[#77776f]">
        By continuing you agree to the{' '}
        <TextLink onClick={() => open('https://morecode.app/terms')}>Terms</TextLink> and{' '}
        <TextLink onClick={() => open('https://morecode.app/privacy')}>Privacy Policy</TextLink>.
      </p>
    </AuthShell>
  )
}

export function SignUpScreen({ go, setEmail, email }: ScreenProps): React.JSX.Element {
  const { service } = useAuth()
  const social = useSocial()
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'pw' | 'agree', string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Tell us what to call you.'
    if (!isEmail(email)) next.email = 'Enter a valid email address.'
    if (pw.length < 8) next.pw = 'Use at least 8 characters.'
    if (!agree) next.agree = 'Please accept the terms to continue.'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    setLoading(true)
    service
      .signUp(name, email, pw)
      .then(() => go('verify'))
      .catch((err) => setFormError(errorText(err)))
      .finally(() => setLoading(false))
  }

  return (
    <AuthShell>
      <Back onClick={() => go('welcome')}>Back</Back>
      <Heading title="Create your account">It takes about a minute.</Heading>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Your name" value={name} autoComplete="name" autoFocus error={errors.name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" value={email} autoComplete="email" error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" meter value={pw} autoComplete="new-password" error={errors.pw} onChange={(e) => setPw(e.target.value)} />
        <div>
          <Checkbox checked={agree} onChange={setAgree}>
            I agree to the <TextLink onClick={() => open('https://morecode.app/terms')}>Terms</TextLink> and{' '}
            <TextLink onClick={() => open('https://morecode.app/privacy')}>Privacy Policy</TextLink>.
          </Checkbox>
          {errors.agree && <p role="alert" className="mt-1.5 text-[12px] text-[#f0746c]">{errors.agree}</p>}
        </div>
        <FormError>{formError}</FormError>
        <Submit loading={loading}>Create account</Submit>
      </form>
      <div className="my-5">
        <Divider>or</Divider>
      </div>
      <SocialButtons busy={social.busy} onPick={social.pick} />
      <FormError>{social.error}</FormError>
      <p className="mt-6 text-center text-[13px] text-[#8d8d8a]">
        Already have an account? <TextLink onClick={() => go('signin')}>Sign in</TextLink>
      </p>
    </AuthShell>
  )
}

export function VerifyScreen({ go, email }: ScreenProps): React.JSX.Element {
  const { service, setSession } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [left, restart] = useCountdown(30)

  const verify = (value: string): void => {
    setLoading(true)
    setError(null)
    service
      .verifyEmail(email, value)
      .then(setSession)
      .catch((e) => {
        setError(errorText(e))
        setCode('')
      })
      .finally(() => setLoading(false))
  }

  return (
    <AuthShell>
      <Back onClick={() => go('signup')}>Use a different email</Back>
      <Heading title="Check your email">
        We sent a 6-digit code to <span className="text-[#ececea]">{email}</span>. It expires in 10 minutes.
      </Heading>
      <div className="space-y-4">
        <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={loading} error={Boolean(error)} />
        <FormError>{error}</FormError>
        <Submit type="button" loading={loading} disabled={code.length < 6} onClick={() => verify(code)}>
          Verify and continue
        </Submit>
        <p className="text-center text-[13px] text-[#8d8d8a]">
          Didn’t get it?{' '}
          <TextLink
            disabled={left > 0}
            onClick={() => {
              void service.resendCode(email).then(() => toast('A new code is on its way'))
              restart()
            }}
          >
            {left > 0 ? `Resend in ${left}s` : 'Send a new code'}
          </TextLink>
        </p>
        {!HOSTED && (
        <p className="rounded-[8px] bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-[#8d8d8a]">
          Demo mode: no email is sent. Enter <span className="font-medium text-[#ececea]">{DEMO_CODE}</span>.
        </p>
        )}
      </div>
    </AuthShell>
  )
}

export function SignInScreen({ go, email, setEmail }: ScreenProps): React.JSX.Element {
  const { service, setSession } = useAuth()
  const social = useSocial()
  const [pw, setPw] = useState('')
  const [errors, setErrors] = useState<{ email?: string; pw?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!isEmail(email)) next.email = 'Enter a valid email address.'
    if (!pw) next.pw = 'Enter your password.'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    setLoading(true)
    service
      .signIn(email, pw)
      .then(setSession)
      .catch((err) => setFormError(errorText(err)))
      .finally(() => setLoading(false))
  }

  return (
    <AuthShell>
      <Back onClick={() => go('welcome')}>Back</Back>
      <Heading title="Sign in" />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email" type="email" value={email} autoComplete="email" autoFocus error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField
          label="Password"
          value={pw}
          autoComplete="current-password"
          error={errors.pw}
          onChange={(e) => setPw(e.target.value)}
          right={
            <TextLink className="text-[12.5px]" onClick={() => go('forgot')}>
              Forgot password?
            </TextLink>
          }
        />
        <FormError>{formError}</FormError>
        <Submit loading={loading}>Sign in</Submit>
      </form>
      <div className="my-5">
        <Divider>or</Divider>
      </div>
      <SocialButtons busy={social.busy} onPick={social.pick} />
      <FormError>{social.error}</FormError>
      <p className="mt-6 text-center text-[13px] text-[#8d8d8a]">
        New here? <TextLink onClick={() => go('signup')}>Create an account</TextLink>
      </p>
    </AuthShell>
  )
}

export function ForgotScreen({ go, email, setEmail }: ScreenProps): React.JSX.Element {
  const { service } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!isEmail(email)) return setError('Enter a valid email address.')
    setError(null)
    setLoading(true)
    service
      .requestReset(email)
      .then(() => go('forgot-sent'))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false))
  }

  return (
    <AuthShell>
      <Back onClick={() => go('signin')}>Back to sign in</Back>
      <Heading title="Reset your password">Enter your email and we’ll send you a code.</Heading>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email" type="email" value={email} autoComplete="email" autoFocus error={error} onChange={(e) => setEmail(e.target.value)} />
        <Submit loading={loading}>Send reset code</Submit>
      </form>
    </AuthShell>
  )
}

export function ForgotSentScreen({ go, email }: ScreenProps): React.JSX.Element {
  const { service } = useAuth()
  const [left, restart] = useCountdown(30)
  return (
    <AuthShell>
      <Back onClick={() => go('signin')}>Back to sign in</Back>
      <span className="mb-4 grid h-11 w-11 place-items-center rounded-[10px] bg-[#3b82f6]/15 text-[#7db1ff]">
        <MailCheck className="h-5 w-5" />
      </span>
      <Heading title="Check your inbox">
        If an account exists for <span className="text-[#ececea]">{email}</span>, a reset code is on its way.
      </Heading>
      <div className="space-y-3">
        <Submit type="button" onClick={() => go('reset')}>
          I have a code
        </Submit>
        <SecondaryButton onClick={() => open('mailto:')}>Open my mail app</SecondaryButton>
        <p className="pt-1 text-center text-[13px] text-[#8d8d8a]">
          Nothing yet?{' '}
          <TextLink
            disabled={left > 0}
            onClick={() => {
              void service.requestReset(email).then(() => toast('Sent again'))
              restart()
            }}
          >
            {left > 0 ? `Send again in ${left}s` : 'Send again'}
          </TextLink>
        </p>
        {!HOSTED && (
        <p className="rounded-[8px] bg-white/[0.04] px-3 py-2 text-[12px] leading-5 text-[#8d8d8a]">
          Demo mode: no email is sent. The code is <span className="font-medium text-[#ececea]">{DEMO_CODE}</span>.
        </p>
        )}
      </div>
    </AuthShell>
  )
}

export function ResetScreen({ go, email }: ScreenProps): React.JSX.Element {
  const { service } = useAuth()
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<{ code?: string; pw?: string; again?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const next: typeof errors = {}
    if (code.length < 6) next.code = 'Enter the 6-digit code.'
    if (pw.length < 8) next.pw = 'Use at least 8 characters.'
    else if (pw !== again) next.again = 'The passwords do not match.'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    setLoading(true)
    service
      .resetPassword(email, code, pw)
      .then(() => go('reset-done'))
      .catch((err) => setFormError(errorText(err)))
      .finally(() => setLoading(false))
  }

  return (
    <AuthShell>
      <Back onClick={() => go('forgot-sent')}>Back</Back>
      <Heading title="Choose a new password" />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <p className="mb-1.5 text-[13px] text-[#c9c9c6]">Code from your email</p>
          <CodeInput value={code} onChange={setCode} error={Boolean(errors.code)} />
          {errors.code && <p role="alert" className="mt-1.5 text-[12px] text-[#f0746c]">{errors.code}</p>}
        </div>
        <PasswordField label="New password" meter value={pw} autoComplete="new-password" error={errors.pw} onChange={(e) => setPw(e.target.value)} />
        <PasswordField label="Type it again" value={again} autoComplete="new-password" error={errors.again} onChange={(e) => setAgain(e.target.value)} />
        <FormError>{formError}</FormError>
        <Submit loading={loading}>Save new password</Submit>
      </form>
    </AuthShell>
  )
}

export function ResetDoneScreen({ go }: ScreenProps): React.JSX.Element {
  return (
    <AuthShell>
      <span className="mb-4 grid h-11 w-11 place-items-center rounded-[10px] bg-[#3fb950]/15 text-[#5fd17a]">
        <Check className="h-5 w-5 stroke-[2.5]" />
      </span>
      <Heading title="Password updated">You can sign in with your new password now.</Heading>
      <Submit type="button" onClick={() => go('signin')}>
        Go to sign in
      </Submit>
    </AuthShell>
  )
}
