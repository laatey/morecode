import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

const TONES = {
  /** A plain dim behind a small dialog. */
  light: 'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0',
  /** A stronger, slightly blurred dim behind a large dialog. */
  blurred:
    'fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0'
}

/** The dimmed backdrop every dialog sits on, so they all look and fade the same. Use inside a Dialog.Portal. */
export function ModalOverlay({ tone = 'light' }: { tone?: keyof typeof TONES }): React.JSX.Element {
  return <Dialog.Overlay className={TONES[tone]} />
}
