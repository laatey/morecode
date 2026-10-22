import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * The app's button. Solid blue for the main action, a quiet outlined one for everything else.
 * Small radius, a thin top highlight and a soft shadow give the blue some depth without gradients.
 *  default      main action
 *  secondary    everything else
 *  ghost        text-only until hovered
 *  destructive  soft red;  danger is the solid red for a final "Delete"
 */
const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent text-[13px] font-medium cursor-pointer transition-[background-color,border-color,box-shadow,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-70',
  {
    variants: {
      variant: {
        // deep fill, a lighter edge of the same colour, a soft shadow
        default:
          'border-[#4a7fe0]/60 bg-[#1d4fb4] text-[#eaf1ff] shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-[#6c9aee]/70 hover:bg-[#2359c4] active:bg-[#1a46a0] disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/30 disabled:shadow-none',
        // the same build in white
        secondary:
          'border-white/80 bg-[#e7e7e4] text-[#1c1c1b] shadow-[0_1px_3px_rgba(0,0,0,0.4)] hover:bg-[#f4f4f1] active:bg-[#dcdcd8] disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/30 disabled:shadow-none',
        outline:
          'border-white/[0.14] text-[#ececea] hover:bg-white/[0.06] disabled:border-white/[0.06] disabled:text-white/30',
        ghost: 'text-[#b9b9b6] hover:bg-white/[0.07] hover:text-[#ececea] disabled:text-white/30',
        destructive:
          'border-[#d8645b]/55 bg-[#8e2a24] text-[#ffe9e7] shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-[#e57f77]/65 hover:bg-[#a0312a] disabled:opacity-50',
        danger:
          'border-[#d8645b]/55 bg-[#8e2a24] text-[#ffe9e7] shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-[#e57f77]/65 hover:bg-[#a0312a] disabled:opacity-50',
        link: 'h-auto rounded-sm border-0 px-0 text-[#7db1ff] underline-offset-4 hover:underline',
        // the old gradient "3D" looks map onto the new ones, so nothing that uses them breaks
        '3d':
          'border-[#4a7fe0]/60 bg-[#1d4fb4] text-[#eaf1ff] shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:bg-[#2359c4] disabled:border-white/[0.06] disabled:bg-white/[0.05] disabled:text-white/30 disabled:shadow-none',
        '3d-secondary':
          'border-white/80 bg-[#e7e7e4] text-[#1c1c1b] shadow-[0_1px_3px_rgba(0,0,0,0.4)] hover:bg-[#f4f4f1] disabled:opacity-40'
      },
      size: {
        default: 'h-9 px-4',
        xs: 'h-7 rounded-[8px] px-2.5 text-[12px]',
        sm: 'h-8 rounded-[9px] px-3 text-[12.5px]',
        lg: 'h-10 px-5 text-[14px]',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
