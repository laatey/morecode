import type { VSCodeThemeData } from './types'

/**
 * The two themes MoreCode shipped with, written in the same shape as a VS Code theme so they go through the same
 * derivation. "MoreCode Dark" is the default and reproduces the original warm-grey look.
 */
const rule = (scope: string, color: string): { scope: string[]; color: string } => ({
  scope: [scope],
  color
})

export const MORECODE_DARK: VSCodeThemeData = {
  id: 'MoreCode Dark',
  label: 'MoreCode Dark',
  type: 'dark',
  colors: {
    'editor.background': '#272726',
    foreground: '#ececea',
    descriptionForeground: '#9a9a96',
    'panel.border': '#3d3d3c',
    'input.border': '#3a3a37',
    'button.background': '#2b64d6',
    'button.foreground': '#ffffff',
    focusBorder: '#3b82f6',
    'textLink.foreground': '#7db1ff',
    errorForeground: '#f0746c',
    'editorError.foreground': '#f0746c',
    'editorWarning.foreground': '#e8b365',
    'editorInfo.foreground': '#6ea8fe',
    'gitDecoration.addedResourceForeground': '#5fd17a'
  },
  tokens: [
    rule('keyword', '#fd7277'),
    rule('string', '#87c6f2'),
    rule('constant.numeric', '#f3ae58'),
    rule('entity.name.function', '#c5a2ff'),
    rule('entity.name.type', '#c5a2ff'),
    rule('comment', '#7f8793'),
    rule('variable.other.property', '#4eccd3'),
    rule('entity.name.tag', '#fd7277'),
    rule('meta.preprocessor', '#6fd087')
  ]
}

export const MORECODE_LIGHT: VSCodeThemeData = {
  id: 'MoreCode Light',
  label: 'MoreCode Light',
  type: 'light',
  colors: {
    'editor.background': '#fbf9f3',
    foreground: '#111419',
    descriptionForeground: '#5f636d',
    'panel.border': '#dddbd2',
    'button.background': '#1a5cdf',
    'button.foreground': '#ffffff',
    focusBorder: '#1a5cdf',
    'textLink.foreground': '#1a5cdf',
    errorForeground: '#df202e',
    'editorError.foreground': '#d02330',
    'editorWarning.foreground': '#9a6a00',
    'editorInfo.foreground': '#1a5cdf',
    'gitDecoration.addedResourceForeground': '#05893e'
  },
  tokens: [
    rule('keyword', '#ba022f'),
    rule('string', '#0e5794'),
    rule('constant.numeric', '#9a4a00'),
    rule('entity.name.function', '#6731a8'),
    rule('entity.name.type', '#6731a8'),
    rule('comment', '#6b727e'),
    rule('variable.other.property', '#006871'),
    rule('entity.name.tag', '#ba022f'),
    rule('meta.preprocessor', '#007b2a')
  ]
}
