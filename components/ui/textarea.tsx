import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex min-h-[100px] w-full rounded-lg border bg-background px-3 py-2 text-sm transition-all duration-fast placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-none',
  {
    variants: {
      variant: {
        default: 'border-input hover:border-primary/50 hover:shadow-sm focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        error: 'border-destructive/70 hover:border-destructive hover:shadow-sm focus-visible:border-destructive focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-destructive/5 dark:bg-destructive/10',
        success: 'border-green-500/70 hover:border-green-500 hover:shadow-sm focus-visible:border-green-500 focus-visible:ring-2 focus-visible:ring-green-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-green-50/50 dark:bg-green-950/20',
        ghost: 'border-transparent bg-muted/50 hover:bg-muted hover:border-border focus-visible:bg-background focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <textarea
        className={cn(textareaVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
