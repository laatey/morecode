import React from 'react'
import { Group, Page, Row, Segmented } from '../kit'
import { useSettings, type ContentWidth, type InterfaceSize } from '../settings-store'

export function AppearancePage(): React.JSX.Element {
  const { settings, set } = useSettings()
  return (
    <Page title="Appearance" description="How MoreCode looks and moves.">
      <Group title="Theme">
        <Row title="Color theme" description="Light and automatic themes are coming soon.">
          <span className="text-[12px] text-[#c9c9c6]">Dark</span>
        </Row>
      </Group>

      <Group title="Layout">
        <Row title="Interface size" description="Makes text and controls across the whole app smaller or larger.">
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
        <Row title="Conversation width" description="How wide responses can grow. The composer stays compact.">
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
        <Row title="Reduce motion" description="Turn off most animation, including the shimmer while the AI works.">
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
