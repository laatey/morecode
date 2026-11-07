import { ANSI_NAMES } from './vscode-keys'
import type { ThemeKind } from './types'

/**
 * VS Code's own built-in value for a colour key when a theme does not set it, per theme kind.
 * Transcribed from microsoft/vscode (platform/theme/common/colors, workbench/common/theme.ts, the terminal
 * colour registry and the git extension). Defaults VS Code computes from other colours (for example
 * "description text is the foreground at 70%") are not here: derive.ts rebuilds those from the resolved theme.
 */
const pick = (d: string, l: string, hd: string, hl: string): Record<ThemeKind, string> => ({
  dark: d,
  light: l,
  hcDark: hd,
  hcLight: hl
})

const table: Record<string, Record<ThemeKind, string>> = {
  foreground: pick('#cccccc', '#616161', '#ffffff', '#292929'),
  descriptionForeground: pick('', '#717171', '', ''),
  errorForeground: pick('#f48771', '#a1260d', '#f48771', '#b5200d'),
  focusBorder: pick('#007fd4', '#0090f1', '#f38518', '#006bbd'),
  contrastBorder: pick('', '', '#6fc3df', '#0f4a85'),
  'icon.foreground': pick('#c5c5c5', '#424242', '#ffffff', '#292929'),
  'editor.background': pick('#1e1e1e', '#ffffff', '#000000', '#ffffff'),
  'editor.foreground': pick('#bbbbbb', '#333333', '#ffffff', '#292929'),
  'editor.selectionBackground': pick('#264f78', '#add6ff', '#f3f518', '#0f4a85'),
  'editorWidget.background': pick('#252526', '#f3f3f3', '#0c141f', '#ffffff'),
  'editorGroup.border': pick('#444444', '#e7e7e7', '#6fc3df', '#0f4a85'),
  'sideBar.background': pick('#252526', '#f3f3f3', '#000000', '#ffffff'),
  'titleBar.activeBackground': pick('#3c3c3c', '#dddddd', '#000000', '#ffffff'),
  'titleBar.activeForeground': pick('#cccccc', '#333333', '#ffffff', '#292929'),
  'panel.border': pick('#80808059', '#80808059', '#6fc3df', '#0f4a85'),
  'tab.activeForeground': pick('#ffffff', '#333333', '#ffffff', '#292929'),
  'tab.inactiveBackground': pick('#2d2d2d', '#ececec', '', ''),
  'tab.border': pick('#252526', '#f3f3f3', '#6fc3df', '#0f4a85'),
  'button.background': pick('#0e639c', '#007acc', '#000000', '#0f4a85'),
  'button.foreground': pick('#ffffff', '#ffffff', '#ffffff', '#ffffff'),
  'button.secondaryForeground': pick('#cccccc', '#616161', '#ffffff', '#292929'),
  'input.background': pick('#3c3c3c', '#ffffff', '#000000', '#ffffff'),
  'input.border': pick('', '', '#6fc3df', '#0f4a85'),
  'dropdown.background': pick('#3c3c3c', '#ffffff', '#000000', '#ffffff'),
  'dropdown.border': pick('#3c3c3c', '#cecece', '#6fc3df', '#0f4a85'),
  'dropdown.foreground': pick('#f0f0f0', '#616161', '#ffffff', '#292929'),
  'list.hoverBackground': pick('#2a2d2e', '#f0f0f0', '#ffffff1a', '#0f4a851a'),
  'list.activeSelectionBackground': pick('#04395e', '#0060c0', '', '#0f4a851a'),
  'list.activeSelectionForeground': pick('#ffffff', '#ffffff', '', ''),
  'list.inactiveSelectionBackground': pick('#37373d', '#e4e6f1', '', '#0f4a851a'),
  'menu.border': pick('', '', '#6fc3df', '#0f4a85'),
  'badge.background': pick('#4d4d4d', '#c4c4c4', '#000000', '#0f4a85'),
  'badge.foreground': pick('#ffffff', '#333333', '#ffffff', '#ffffff'),
  'progressBar.background': pick('#0e70c0', '#0e70c0', '#6fc3df', '#0f4a85'),
  'textLink.foreground': pick('#3794ff', '#006ab1', '#21a6ff', '#0f4a85'),
  'textCodeBlock.background': pick('#0a0a0a66', '#dcdcdc66', '#000000', '#f2f2f2'),
  'textPreformat.foreground': pick('#d7ba7d', '#a31515', '#ffffff', '#ffffff'),
  'textBlockQuote.background': pick('#222222', '#f2f2f2', '', '#f2f2f2'),
  'textBlockQuote.border': pick('#007acc80', '#007acc80', '#ffffff', '#292929'),
  'editorError.foreground': pick('#f14c4c', '#e51400', '#f48771', '#b5200d'),
  'editorWarning.foreground': pick('#cca700', '#bf8803', '#ffd370', '#895503'),
  'editorInfo.foreground': pick('#59a4f9', '#0063d3', '#59a4f9', '#0063d3'),
  'list.errorForeground': pick('#f88070', '#b01011', '', ''),
  'list.warningForeground': pick('#cca700', '#855f00', '', ''),
  'diffEditor.insertedTextBackground': pick('#9ccc2c33', '#9ccc2c40', '', ''),
  'diffEditor.removedTextBackground': pick('#ff000033', '#ff000033', '', ''),
  'charts.orange': pick('#d18616', '#d18616', '#ab5a00', '#0f4a85'),
  'charts.green': pick('#89d185', '#388a34', '#89d185', '#374e06'),
  'charts.purple': pick('#b180d7', '#652d90', '#b180d7', '#652d90'),
  // git extension
  'gitDecoration.addedResourceForeground': pick('#81b88b', '#587c0c', '#a1e3ad', '#374e06'),
  'gitDecoration.modifiedResourceForeground': pick('#e2c08d', '#895503', '#e2c08d', '#895503'),
  'gitDecoration.deletedResourceForeground': pick('#c74e39', '#ad0707', '#c74e39', '#ad0707'),
  'gitDecoration.renamedResourceForeground': pick('#73c991', '#007100', '#73c991', '#007100'),
  'gitDecoration.untrackedResourceForeground': pick('#73c991', '#007100', '#73c991', '#007100'),
  'gitDecoration.conflictingResourceForeground': pick('#e4676b', '#ad0707', '#c74e39', '#ad0707')
}

const ansi: Record<string, Record<ThemeKind, string>> = {
  Black: pick('#000000', '#000000', '#000000', '#292929'),
  Red: pick('#cd3131', '#cd3131', '#cd0000', '#cd3131'),
  Green: pick('#0dbc79', '#107c10', '#00cd00', '#136c13'),
  Yellow: pick('#e5e510', '#949800', '#cdcd00', '#949800'),
  Blue: pick('#2472c8', '#0451a5', '#0000ee', '#0451a5'),
  Magenta: pick('#bc3fbc', '#bc05bc', '#cd00cd', '#bc05bc'),
  Cyan: pick('#11a8cd', '#0598bc', '#00cdcd', '#0598bc'),
  White: pick('#e5e5e5', '#555555', '#e5e5e5', '#555555'),
  BrightBlack: pick('#666666', '#666666', '#7f7f7f', '#666666'),
  BrightRed: pick('#f14c4c', '#f14c4c', '#ff0000', '#cd3131'),
  BrightGreen: pick('#23d18b', '#14ce14', '#00ff00', '#00bc00'),
  BrightYellow: pick('#f5f543', '#b5ba00', '#ffff00', '#b5ba00'),
  BrightBlue: pick('#3b8eea', '#3b8eea', '#5c5cff', '#0451a5'),
  BrightMagenta: pick('#d670d6', '#d670d6', '#ff00ff', '#bc05bc'),
  BrightCyan: pick('#29b8db', '#29b8db', '#00ffff', '#0598bc'),
  BrightWhite: pick('#e5e5e5', '#a5a5a5', '#ffffff', '#a5a5a5')
}
for (const name of ANSI_NAMES) table[`terminal.ansi${name}`] = ansi[name]

/** VS Code's default for `key` on this kind of theme, or undefined when it has none (or computes it). */
export function vscodeDefault(kind: ThemeKind, key: string): string | undefined {
  const v = table[key]?.[kind]
  return v ? v : undefined
}
