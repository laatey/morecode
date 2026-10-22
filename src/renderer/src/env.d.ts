/// <reference types="vite/client" />

declare global {
  interface Window {
    electron?: {
      process: {
        versions: Record<string, string>
      }
    }
  }
}

export {}
