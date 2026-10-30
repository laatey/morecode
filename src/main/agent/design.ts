/**
 * Design know-how for UI work. It is only put in front of the model when the request is about
 * how something looks (or an image is attached), so non-UI tasks keep a short prompt and are
 * not pushed toward design opinions. The model can also pull it on demand with design_guide.
 */

const UI_WORDS =
  /\b(ui|ux|design|redesign|restyle|style|styling|css|tailwind|layout|landing|hero|homepage|home page|page|screen|website|web site|site|dashboard|component|navbar|nav bar|sidebar|footer|header|modal|dialog|button|form|card|theme|colou?rs?|palette|font|typography|spacing|padding|margin|responsive|mobile view|animation|animate|beautiful|pretty|ugly|modern|sleek|clean look|look(s)? (better|nicer|good)|mockup|wireframe|figma|dribbble|clone|replicate|pixel)\b/i

const NOT_UI =
  /\b(fix (the )?(test|build|bug)|stack trace|traceback|migration|sql|query|endpoint|api route|cron|deploy|docker|refactor (the )?(logic|backend)|write (a )?(script|test))\b/i

export interface UiSignal {
  prompt: string
  images?: string[]
  history?: { role: 'user' | 'assistant'; text: string }[]
}

/** True when the request is about how something looks, or comes with an image to match. */
export function looksLikeUiTask({ prompt, images = [], history = [] }: UiSignal): boolean {
  if (images.length > 0) return true
  const text = prompt.slice(0, 4000)
  if (UI_WORDS.test(text)) return !NOT_UI.test(text) || /\b(ui|design|css|layout|style)\b/i.test(text)
  // a short follow-up ("make it bolder", "more spacing") inherits the topic of the last request
  if (text.length < 160) {
    const lastUser = [...history].reverse().find((h) => h.role === 'user')
    if (lastUser && UI_WORDS.test(lastUser.text.slice(0, 2000)) && /\b(it|this|that|more|less|bigger|smaller|bolder|darker|lighter)\b/i.test(text)) return true
  }
  return false
}

/** One always-on line, so the model knows the guide exists even when the heuristic misses. */
export const DESIGN_POINTER =
  '- For any visual or UI work (pages, components, styling, or matching a screenshot), call design_guide first if its rules are not already in this prompt.'

export const DESIGN_GUIDE = `Design rules for this request (you are building UI; aim for work a senior product designer would ship, never a generic template):

1. Decide the direction before writing code.
- Read the existing styles first (global CSS, theme or tailwind config, a couple of components). If the project already has a design language, extend it; do not invent a second one.
- If there is none, pick one specific direction that fits the product and audience (for example: editorial serif with warm paper tones; dense dark tool UI with one sharp accent; playful rounded with bold colour blocks; Swiss grid with heavy type). Write it in one sentence in your head and hold every decision to it.
- Never fall back to the AI-default look: purple/indigo-to-pink gradients on white, Inter/Poppins/Roboto everywhere, centered hero + three identical feature cards + generic footer, glassmorphism for no reason, emoji as icons, stock "Get started" copy, every element with the same rounded-2xl shadow-lg.

2. Build a small system, then use only it.
- Do not reinvent the wheel. Check what the project already has and use it: a component library (shadcn/ui, Radix, MUI, Chakra), an icon set, utility CSS. If the stack is React + Tailwind and there is no component library yet, install shadcn/ui and build on its primitives (button, dialog, dropdown, form, table...) instead of hand-rolling them. Customise the library through the theme tokens so it matches the direction; never fight its defaults with overrides on every instance.
- Put colours, radii, shadows, font families and spacing in one place (CSS variables / theme tokens). Components reference tokens, not raw hex values.
- Colour: one neutral ramp (background, surface, border, muted text, text) plus one brand accent and semantic success/warning/danger. Tint neutrals slightly toward the accent so they feel related. Check text contrast is at least 4.5:1.
- Type: one display face with character and one readable text face (or one family used with real weight contrast). Use a clear scale (e.g. 12/14/16/20/24/32/48/64), tight line-height on large headings (1.05-1.15), relaxed on body (1.5-1.65), and limit body lines to about 60-75 characters. Load web fonts properly (link tag or @font-face).
- Spacing: a 4px or 8px scale. Generous outer whitespace, tighter grouping inside related items. Alignment on a grid; consistent gutters.
- Radius and shadow: pick one or two values and repeat them. Shadows soft and low-contrast, or none with borders instead.

3. Compose like a designer.
- Establish hierarchy: one clear focal point per screen, then secondary, then tertiary. Use size, weight and colour contrast, not just bold everywhere.
- Vary rhythm: mix full-bleed sections, asymmetric splits, and dense areas; avoid stacking identical centered blocks.
- Real content: write specific, believable copy and data for the product. No lorem ipsum, no "Feature 1". Use real icons from the project's icon library (or lucide), consistent size and stroke.
- Every interactive element gets hover, focus-visible, active and disabled states. Add loading, empty and error states for anything data-driven.
- Motion: subtle and purposeful (150-250ms, ease-out), entrance staggering at most; respect prefers-reduced-motion.
- Responsive by default: design mobile and desktop; check nothing overflows horizontally at 375px.
- Accessibility: semantic elements (button, nav, main, label), alt text, keyboard reachable, visible focus.

4. Check your work visually. Code that compiles is not finished UI.
- Start the dev server (run_in_background), open the page with browser_navigate, and take browser_screenshot at desktop width; also check a narrow width if the page is user-facing.
- Look critically: alignment, spacing consistency, contrast, awkward wrapping, clipped text, empty areas, anything that looks default or unfinished. Fix it and screenshot again. Do at least one improve-and-recheck pass before you say it is done.
- If the browser tab is not open, ask the person to open it rather than skipping the check.

5. Stay in scope.
- Only restyle what the person asked about. Do not rewrite working logic, rename things, or change behaviour to make styling easier.`

export const REPLICA_GUIDE = `The person attached an image. If they want it copied, matched or used as a reference, follow this process (if the image is just a bug screenshot or diagram, use it as information instead):

1. Inventory before code. Study the image and write yourself a short spec:
- Layout: overall structure (columns, sidebar widths, header height, max content width), the grid, and section order top to bottom.
- Every visible element, in order, with its exact text copied verbatim (headings, labels, button text, numbers).
- Colours: estimate each distinct colour as hex (background, surfaces, borders, text levels, accent, states). Note gradients and their direction.
- Type: serif / sans / mono, approximate sizes in px for each level, weights, letter-spacing, line-height, uppercase labels.
- Spacing: estimate paddings and gaps in px relative to a known element (a 40px button, 16px body text). Corner radii, border widths, shadow softness.
- Icons and images: which icons (match from the project's icon library), avatar or illustration placements. Use generated or placeholder-free images that match tone; never leave broken image links.
2. Build the tokens from that spec first, then the structure, then the details. Match proportions, not just content: if the sidebar is about 18% of the width, keep it about 18%.
3. Compare, do not assume. Start the dev server, open the page and take browser_screenshot at a viewport close to the image's aspect ratio. Compare it against the original region by region: layout, spacing, sizes, colours, fonts, alignment, missing elements. List every difference you can see, fix them, and screenshot again. Repeat until the differences are minor (aim for two or three passes).
4. Be honest about the result: say what matches and anything you could not reproduce exactly (a custom font, a photo).
5. Copy the look, not someone's brand: if it is clearly another company's logo or trademarked artwork, use a neutral stand-in unless it is the person's own.`

export interface DesignTopic {
  topic?: string
}

/** What design_guide returns. */
export function designGuide({ topic }: DesignTopic = {}): string {
  if (topic === 'replicate') return REPLICA_GUIDE
  if (topic === 'all') return `${DESIGN_GUIDE}\n\n${REPLICA_GUIDE}`
  return DESIGN_GUIDE
}

/** The extra system text for this request: nothing for non-UI work. */
export function designSection(signal: UiSignal): string {
  if (!looksLikeUiTask(signal)) return ''
  const parts = [DESIGN_GUIDE]
  if ((signal.images ?? []).length > 0) parts.push(REPLICA_GUIDE)
  return `\n\n${parts.join('\n\n')}`
}
