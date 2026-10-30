# MoreCode conventions
- Keep downloadable Electron source separate from the Lovable preview template; changes target the uploaded application.
- Resolve docked sidebar space through the shared sidebar layout policy and use a dismissible overlay when a requested panel cannot fit, so opening never silently fails.
- Skill creation uses validated draft tool blocks over the existing agent event stream; only explicit user review saves to the existing account-scoped skills store, so agents cannot overwrite library entries.
- Keep UI-specific agent guidance scoped to visual requests; retain the existing general-purpose tools and permission boundaries.
- Keep Electron's hidden title bar with integrated overlay controls; packaged runtime icons are explicit extra resources to preserve taskbar identity.