/** A file selection from the project explorer. The singleton preview tab reads this when it appears. */
let pendingPath: string | null = null

export function requestFilePreview(path: string): void {
  pendingPath = path
  window.dispatchEvent(new Event('file-preview:open'))
}

export function takeFilePreviewRequest(): string | null {
  const path = pendingPath
  pendingPath = null
  return path
}
