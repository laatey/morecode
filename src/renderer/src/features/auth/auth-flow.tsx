import React, { useState } from 'react'
import {
  ForgotScreen,
  ForgotSentScreen,
  ResetDoneScreen,
  ResetScreen,
  SignInScreen,
  SignUpScreen,
  VerifyScreen,
  WelcomeScreen,
  type Screen
} from './screens'

/** Everything a signed-out person can see. The email carries across screens so nobody retypes it. */
export function AuthFlow(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [email, setEmail] = useState('')
  const props = { go: setScreen, email, setEmail }

  switch (screen) {
    case 'signup':
      return <SignUpScreen {...props} />
    case 'verify':
      return <VerifyScreen {...props} />
    case 'signin':
      return <SignInScreen {...props} />
    case 'forgot':
      return <ForgotScreen {...props} />
    case 'forgot-sent':
      return <ForgotSentScreen {...props} />
    case 'reset':
      return <ResetScreen {...props} />
    case 'reset-done':
      return <ResetDoneScreen {...props} />
    default:
      return <WelcomeScreen {...props} />
  }
}
