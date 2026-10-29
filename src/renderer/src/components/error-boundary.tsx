import React from 'react'

interface Props {
  /** Changing this clears a caught error (for example, switching to another tab). */
  resetKey?: string
  label?: string
  children: React.ReactNode
}

/**
 * One broken panel must not take the whole app down with it. Shows a small, calm message
 * in place of the panel and lets the person try again.
 */
export class ErrorBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  componentDidCatch(error: Error): void {
    console.error('A panel failed to draw:', error)
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-[13px] text-[#ececea]">{this.props.label ?? 'This panel'} ran into a problem.</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="cursor-pointer rounded-[10px] border border-[#3b82f6]/60 bg-[#1d4ed8] px-3 py-1 text-[12px] text-white shadow-sm hover:bg-[#2563eb]"
        >
          Try again
        </button>
      </div>
    )
  }
}
