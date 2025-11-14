import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('rounded-3xl border border-white/10 bg-card/80 p-6 shadow-2xl shadow-black/40', className)} {...props} />;
});

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
});

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <h3 ref={ref} className={cn('text-xl font-semibold tracking-tight text-foreground', className)} {...props} />;
});

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
  { className, ...props },
  ref,
) {
  return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex flex-col gap-3 text-sm text-muted-foreground', className)} {...props} />;
});
