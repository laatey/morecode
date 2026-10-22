# MoreCode

Electron + React + TypeScript desktop app.

## Scripts

- `npm install` – install dependencies
- `npm run dev` – start in development
- `npm run lint` / `npm run format` / `npm run typecheck`
- `npm run build` – typecheck + production build (`build:win|mac|linux` to package)

## Layout

```
src/main/       Electron main process (index.ts, menu.ts, window-state.ts)
src/preload/    contextBridge API exposed as window.api
src/renderer/src/
  App.tsx                      app shell (3 resizable panes)
  hooks/use-responsive-sidebars.ts   sidebar collapse/restore rules
  components/layout/           icon-button, icons
  components/ui/               shadcn/ui primitives (vendored)
  lib/                         utils, platform, highlight
```
