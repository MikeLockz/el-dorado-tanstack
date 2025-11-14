'use client';

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';
import { useToast } from './use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-white/10">Close</ToastClose>
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
