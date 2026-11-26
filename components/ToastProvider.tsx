"use client";

import { useEffect, useState } from 'react';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastItem = {
  id: number;
  msg: string;
  type: 'success' | 'error';
  action?: ToastAction;
};

let nextToastId = 1;

export default function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{
        message: string;
        type?: 'success' | 'error';
        action?: ToastAction;
        duration?: number;
      }>;
      const id = nextToastId++;
      const duration = custom.detail.duration ?? (custom.detail.action ? 7000 : 3500);
      setToasts((prev) => [
        ...prev,
        {
          id,
          msg: custom.detail.message,
          type: custom.detail.type || 'success',
          action: custom.detail.action,
        },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };

    window.addEventListener('show-toast', handler);
    return () => window.removeEventListener('show-toast', handler);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
        alignItems: 'center',
        maxWidth: '92vw',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="fade-in"
          style={{
            background: t.type === 'error' ? '#846267' : '#5A6B5C',
            color: 'white',
            padding: '10px 18px',
            borderRadius: '999px',
            fontWeight: 600,
            fontSize: '0.9rem',
            boxShadow: '0 8px 32px rgba(132, 98, 103, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'auto',
          }}
        >
          <span>{t.msg}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                t.action?.onClick();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.22)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                borderRadius: '999px',
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
