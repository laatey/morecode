import './styles.css'
import '@vscode/codicons/dist/codicon.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SECRET_NAMES, loadSecrets } from './lib/secrets'

// Keys and sign-in sessions are read from the computer's encrypted store first, so nothing flashes signed-out.
// Older versions kept the sessions and account keys as plain text in this window's storage: those are moved over.
void loadSecrets(Object.values(SECRET_NAMES), {
  [SECRET_NAMES.sessions]: SECRET_NAMES.sessions,
  [SECRET_NAMES.keys]: SECRET_NAMES.keys
}).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
)
