import React from 'react'
import { SegmentedSwitch, SegmentedSwitchOption, SegmentedSwitchProps } from './SegmentedSwitch'

/**
 * @deprecated Use generic `SegmentedSwitch` directly for any switch/segmented control needs.
 * This alias is maintained for backwards compatibility.
 */
export type ModeSwitchOption<T extends string = string> = SegmentedSwitchOption<T>
export type ModeSwitchProps<T extends string = string> = SegmentedSwitchProps<T>

export function ModeSwitch<T extends string = string>(
  props: SegmentedSwitchProps<T>
): React.JSX.Element {
  return <SegmentedSwitch {...props} />
}

export { SegmentedSwitch }
export default ModeSwitch
