# Chat environments

Every chat is in exactly one environment. `features/workspace/environment.ts` decides which; the AI,
terminal, file panels and sidebar all follow it. Messages are never shared between chats, in any
environment: only the folder can be shared.

| # | Environment | How a chat gets here | Working folder (AI, terminal, files) | What the AI knows | Saves go to |
|---|-------------|----------------------|--------------------------------------|-------------------|-------------|
| 1 | **New chat** (loose) | New chat button, Ctrl+N, first launch, after "Delete all chats" | Its own private empty folder (`<app data>/chat-spaces/<chatId>`) | Only this chat. No project exists as far as it can tell. Its prompt says not to go looking for other projects | That private folder only |
| 2 | **Chat in a project** | New chat from a project's "+", or move a chat in | The project's folder | This chat's messages plus the project's `AGENTS.md` / `CLAUDE.md` and file list. Not other chats in the project | The project folder |
| 3 | **New project** | New project dialog (name only, or an existing folder) | Created: `Documents/MoreCode Projects/<name>`. Linked: the folder chosen | Nothing yet; starts empty or with the folder's contents | That folder |
| 4 | **Onboarding project** | Folder picked during sign-up | Becomes a project in the sidebar; chats still start loose until placed in it | Same as 2, once a chat is in it | That folder |
| 5 | **Moved: loose → project** | Move to project | Switches to the project folder; messages stay with the chat | The chat's own history, now with the project's files | The project folder from then on |
| 6 | **Moved: project → loose** (or "Remove from project") | Move out | Switches to the chat's private folder | Its history, but none of the project's files | The private folder |
| 7 | **Project deleted** | Remove project | Its chats become loose (environment 1). Files on disk are untouched | As 1 | Private folder |
| 8 | **Project folder missing** | Folder deleted, renamed, or chat synced from another computer | Falls back to the chat's private folder and shows a one-time notice | As 1, until the project is relinked | Private folder |
| 9 | **Label-only project** (older versions) | Opened a project that never had a folder | Treated as loose until a folder is linked (the app links one on open) | As 1 | Private folder |
| 10 | **Archived / deleted chat** | Archive, delete | Not an environment: archived chats keep their old one and reopen into it; deleted chats' private folders are left on disk (Undo works) | n/a | n/a |
| 11 | **Browser / no desktop app** | Running without Electron | No folders at all; scripted demo agent | Nothing | Nowhere |

## Rules that always hold

1. A chat with no project never sees the last project that was open, the `MoreCode Projects` folder, or
   any other chat's files.
2. Switching chats re-points the whole app (AI, terminal, Docs, Git, @ mentions, file preview) at that
   chat's environment, in the same step.
3. Chats in the same project share the folder and nothing else.
4. The AI may still read an outside folder when the person names it explicitly; it writes only inside
   its own working folder unless it is asked to run a command elsewhere (which asks permission first).
5. Moving a chat never copies or deletes files. Anything made in a chat's private folder stays there;
   to keep it, move the chat into a project first.
