import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-lg border bg-card text-card-foreground transition-all duration-normal",
  {
    variants: {
      variant: {
        default: "border-border shadow-sm hover:shadow-md",
        interactive:
          "border-primary/20 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-primary/40 cursor-pointer",
        elevated:
          "border-border shadow-md hover:shadow-lg hover:-translate-y-1",
        "glass-dark":
          "bg-white/10 backdrop-blur-xl border border-white/20 shadow-md [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:shadow-lg hover:bg-white/15",
        "glass-dark-interactive":
          "bg-white/10 backdrop-blur-xl border border-white/20 shadow-md [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:bg-white/15 hover:border-white/30 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer",
        "glass-light":
          "bg-black/[0.04] backdrop-blur-xl border border-black/[0.08] shadow-md [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.5)] text-gray-900 hover:shadow-lg hover:bg-black/[0.06]",
        "glass-light-interactive":
          "bg-black/[0.04] backdrop-blur-xl border border-black/[0.08] shadow-md [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.5)] text-gray-900 hover:bg-black/[0.08] hover:border-black/[0.15] hover:shadow-lg hover:-translate-y-0.5 cursor-pointer",
        ghost:
          "border-transparent shadow-none bg-transparent hover:bg-primary/5",
        minimal:
          "border-transparent shadow-none bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, cardVariants, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }