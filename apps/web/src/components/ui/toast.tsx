import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Viewport>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Viewport
      ref={ref}
      className={cn(
        'fixed inset-x-0 top-2 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 px-4 sm:top-4 sm:right-4 sm:left-auto',
        className,
      )}
      {...props}
    />
  ),
);
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-3xl border border-white/15 bg-background/90 p-4 pr-6 text-left shadow-lg backdrop-blur transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:slide-in-from-top-full data-[state=closed]:slide-out-to-top-full',
  {
    variants: {
      variant: {
        default: 'border-border/60 bg-card/90',
        destructive: 'border-destructive/60 bg-destructive/15',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Root>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>>(
  ({ className, variant, ...props }, ref) => {
    return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
  },
);
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = ToastPrimitives.Action;
const ToastClose = ToastPrimitives.Close;

const ToastTitle = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Title>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold text-foreground', className)} {...props} />
  ),
);
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Description>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>>(
  ({ className, ...props }, ref) => (
    <ToastPrimitives.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
ToastDescription.displayName = ToastPrimitives.Description.displayName;

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction, toastVariants };
