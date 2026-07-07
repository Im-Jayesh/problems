"use client";

import { useEffect, useState } from 'react';

export default function ToastProvider() {
  const [toasts, setToasts] = useState<{id: number, msg: string, type: string}[]>([]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, msg: e.detail.message, type: e.detail.type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };
    
    window.addEventListener('show-toast', handler as any);
    return () => window.removeEventListener('show-toast', handler as any);
  }, []);

  return (
    <div style={{ 
      position: 'fixed', 
      top: '20px', 
      left: '50%', 
      transform: 'translateX(-50%)', 
      zIndex: 9999, 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '8px',
      pointerEvents: 'none'
    }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-in" style={{
          background: t.type === 'error' ? '#846267' : '#AEB4A9',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '999px',
          fontWeight: 600,
          boxShadow: '0 8px 32px rgba(132, 98, 103, 0.2)',
          textAlign: 'center'
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
