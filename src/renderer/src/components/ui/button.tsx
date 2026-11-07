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
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent text-[13px] font-medium cursor-pointer transition-[background-color,border-color,box-shadow,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:opacity-70',
  {
    variants: {
      variant: {
        // deep fill, a lighter edge of the same colour, a soft shadow
        default:
          'border-primary/60 bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-primary/70 hover:bg-primary/90 active:bg-primary/90 disabled:border-border/50 disabled:bg-foreground/[0.05] disabled:text-foreground/30 disabled:shadow-none',
        // the same build in white
        secondary:
          'border-foreground/80 bg-foreground text-background shadow-[0_1px_3px_rgba(0,0,0,0.4)] hover:bg-foreground active:bg-foreground disabled:border-border/50 disabled:bg-foreground/[0.05] disabled:text-foreground/30 disabled:shadow-none',
        outline:
          'border-border-strong text-foreground hover:bg-foreground/[0.06] disabled:border-border/50 disabled:text-foreground/30',
        ghost: 'text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground disabled:text-foreground/30',
        destructive:
          'border-destructive/55 bg-destructive text-destructive-foreground shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-destructive/65 hover:bg-destructive/90 disabled:opacity-50',
        danger:
          'border-destructive/55 bg-destructive text-destructive-foreground shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:border-destructive/65 hover:bg-destructive/90 disabled:opacity-50',
        link: 'h-auto rounded-sm border-0 px-0 text-link underline-offset-4 hover:underline',
        // the old gradient "3D" looks map onto the new ones, so nothing that uses them breaks
        '3d':
          'border-primary/60 bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.45)] hover:bg-primary/90 disabled:border-border/50 disabled:bg-foreground/[0.05] disabled:text-foreground/30 disabled:shadow-none',
        '3d-secondary':
          'border-foreground/80 bg-foreground text-background shadow-[0_1px_3px_rgba(0,0,0,0.4)] hover:bg-foreground disabled:opacity-40'
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
