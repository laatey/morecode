import { Toaster as Sonner } from 'sonner'
import { AlertCircle, Check, Info, Loader, Alert } from 'fluid-icons/react'

type ToasterProps = React.ComponentProps<typeof Sonner>

/** Morline notifications: compact, monochrome pill with a single status glyph. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Bottom-left keeps clear of the deploy bar (bottom-center) and the service panel (right).
      position="bottom-left"
      gap={6}
      offset={16}
      mobileOffset={12}
      visibleToasts={2}
      duration={3200}
      closeButton
      icons={{
        success: <Check className="h-3.5 w-3.5 text-score" />,
        error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
        warning: <Alert className="h-3.5 w-3.5 text-score-mid" />,
        info: <Info className="h-3.5 w-3.5 text-muted-foreground" />,
        loading: <Loader className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group relative flex w-full items-center gap-2.5 rounded-xl border bg-popover/95 py-2.5 pl-3.5 pr-9 text-popover-foreground shadow-[0_12px_40px_-12px_oklch(0_0_0/0.6)] backdrop-blur-md sm:w-auto sm:max-w-[360px]',
          title: 'text-[13px] font-medium leading-snug',
          description: 'text-xs text-muted-foreground',
          icon: 'flex shrink-0 items-center',
          closeButton:
            '!absolute !left-auto !right-2 !top-1/2 !-translate-y-1/2 !translate-x-0 grid !h-5 !w-5 place-items-center rounded-md !border-0 !bg-transparent text-muted-foreground hover:!bg-accent hover:text-foreground',
          actionButton:
            'ml-auto shrink-0 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background',
          cancelButton:
            'shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
