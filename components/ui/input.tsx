import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-lg border bg-background text-sm transition-all duration-fast file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-input hover:border-primary/50 hover:shadow-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        error: "border-destructive/70 hover:border-destructive hover:shadow-sm focus-visible:border-destructive focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-destructive/5 dark:bg-destructive/10",
        success: "border-green-500/70 hover:border-green-500 hover:shadow-sm focus-visible:border-green-500 focus-visible:ring-2 focus-visible:ring-green-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-green-50/50 dark:bg-green-950/20",
        ghost: "border-transparent bg-muted/50 hover:bg-muted hover:border-border focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      },
      size: {
        default: "h-10 px-3 py-2",
        sm: "h-8 px-2.5 py-1 text-xs rounded-md",
        lg: "h-12 px-4 py-3 text-base rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, size, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }