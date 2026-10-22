import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(
    (window as unknown as { electron?: { process?: { versions?: Record<string, string> } } })
      ?.electron?.process?.versions ?? { electron: '32.0.0', chrome: '128.0.0', node: '20.15.0' }
  )

  return (
    <ul className="versions">
      <li className="electron-version">Electron v{versions.electron}</li>
      <li className="chrome-version">Chromium v{versions.chrome}</li>
      <li className="node-version">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
