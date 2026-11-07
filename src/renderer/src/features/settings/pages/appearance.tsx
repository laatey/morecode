import React from 'react'
import { Group, Page, Row, Segmented, Toggle } from '../kit'
import { ThemeChooser } from '../theme-picker'
import { getTheme } from '@/theme/themes'
import { useSettings, type ContentWidth, type InterfaceSize } from '../settings-store'

export function AppearancePage(): React.JSX.Element {
  const { settings, set, activeThemeId } = useSettings()
  return (
    <Page title="Appearance" description="How MoreCode looks and moves.">
      <Group title="Theme">
        <Row
          title="Match system"
          description="Switch between a light and a dark theme with your operating system's appearance."
        >
          <Toggle
            label="Match system appearance"
            checked={settings.themeAuto}
            onChange={(v) => set({ themeAuto: v })}
          />
        </Row>
        {settings.themeAuto ? (
          <>
            <ThemeChooser
              title="Light theme"
              description="Used when your system is in light mode."
              side="light"
              value={settings.themeLight}
              onPick={(id) => set({ themeLight: id })}
            />
            <ThemeChooser
              title="Dark theme"
              description={`Used when your system is in dark mode. Now using ${getTheme(activeThemeId).label}.`}
              side="dark"
              value={settings.themeDark}
              onPick={(id) => set({ themeDark: id })}
            />
          </>
        ) : (
          <ThemeChooser
            title="Color theme"
            description="The same themes VS Code ships with, plus MoreCode’s own."
            value={settings.theme}
            onPick={(id) => set({ theme: id })}
          />
        )}
      </Group>

      <Group title="Layout">
        <Row
          title="Interface size"
          description="Makes text and controls across the whole app smaller or larger."
        >
          <Segmented<InterfaceSize>
            label="Interface size"
            value={settings.interfaceSize}
            onChange={(v) => set({ interfaceSize: v })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'default', label: 'Default' },
              { value: 'large', label: 'Large' }
            ]}
          />
        </Row>
        <Row
          title="Conversation width"
          description="How wide responses can grow. The composer stays compact."
        >
          <Segmented<ContentWidth>
            label="Conversation width"
            value={settings.contentWidth}
            onChange={(v) => set({ contentWidth: v })}
            options={[
              { value: 'narrow', label: 'Narrow' },
              { value: 'default', label: 'Medium' },
              { value: 'wide', label: 'Wide' }
            ]}
          />
        </Row>
      </Group>

      <Group title="Motion">
        <Row
          title="Reduce motion"
          description="Turn off most animation, including the shimmer while the AI works."
        >
          <Segmented<'system' | 'reduced'>
            label="Motion"
            value={settings.reduceMotion ? 'reduced' : 'system'}
            onChange={(v) => set({ reduceMotion: v === 'reduced' })}
            options={[
              { value: 'system', label: 'Normal' },
              { value: 'reduced', label: 'Reduced' }
            ]}
          />
        </Row>
      </Group>
    </Page>
  )
}
