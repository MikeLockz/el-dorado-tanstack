import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-2xl border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-amber-500/50 bg-amber-500/15 text-amber-100',
      destructive: 'border-destructive/60 bg-destructive/10 text-destructive-foreground',
      success: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
