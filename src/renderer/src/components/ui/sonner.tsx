import { Toaster as Sonner } from 'sonner'
import { AlertCircle, Check, Info, Loader, Alert } from 'fluid-icons/react'

type ToasterProps = React.ComponentProps<typeof Sonner>

/** Every notification is one of two colors: green when something worked, red when it did not. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      gap={6}
      offset={48}
      mobileOffset={12}
      visibleToasts={2}
      duration={3200}
      closeButton
      icons={{
        success: <Check className="h-3.5 w-3.5 text-emerald-400" />,
        error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
        warning: <Alert className="h-3.5 w-3.5 text-red-400" />,
        info: <Check className="h-3.5 w-3.5 text-emerald-400" />,
        loading: <Loader className="h-3.5 w-3.5 animate-spin text-emerald-400" />
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group relative flex w-full items-center gap-2.5 rounded-lg border py-2.5 pl-3.5 pr-9 shadow-[0_12px_40px_-12px_oklch(0_0_0/0.6)] sm:w-auto sm:max-w-[440px]',
          // anything that is not an error is green, so no toast can come out as a plain dark card
          default: 'border-emerald-400/30 bg-[#102a1d] text-emerald-50',
          success: 'border-emerald-400/30 bg-[#102a1d] text-emerald-50',
          info: 'border-emerald-400/30 bg-[#102a1d] text-emerald-50',
          loading: 'border-emerald-400/30 bg-[#102a1d] text-emerald-50',
          error: 'border-red-400/35 bg-[#2e1315] text-red-50',
          warning: 'border-red-400/35 bg-[#2e1315] text-red-50',
          title: 'text-[13px] font-medium leading-snug',
          description: 'text-xs opacity-75',
          icon: 'flex shrink-0 items-center',
          closeButton:
            '!absolute !left-auto !right-2 !top-1/2 !-translate-y-1/2 !translate-x-0 grid !h-5 !w-5 place-items-center rounded-md !border-0 !bg-transparent opacity-70 hover:!bg-white/10 hover:opacity-100',
          actionButton:
            'ml-auto shrink-0 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-black',
          cancelButton:
            'shrink-0 rounded-md px-2 py-1 text-[11px] opacity-75 hover:opacity-100'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
