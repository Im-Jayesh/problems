"use client";

import { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { getApiHeaders } from '@/lib/fingerprint';

type BorderlineMatch = {
  text: string;
  borderlineToken: string;
  match: {
    id: string;
    title: string;
    category?: string;
    similarity: number;
  };
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function ProblemInput({ onMerged }: { onMerged?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [borderlineMatch, setBorderlineMatch] = useState<BorderlineMatch | null>(null);
  const [needsCategory, setNeedsCategory] = useState(false);
  const [userCategory, setUserCategory] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  // Optional Cloudflare Turnstile widget
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    const renderWidget = () => {
      if (window.turnstile && turnstileRef.current && !turnstileWidgetId.current) {
        turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
        });
      }
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      existing.addEventListener('load', renderWidget);
      return () => existing.removeEventListener('load', renderWidget);
    }
  }, []);

  // Esc key closes borderline modal
  useEffect(() => {
    if (!borderlineMatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        setBorderlineMatch(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [borderlineMatch, loading]);

  const showUndoToast = (message: string, undoToken?: string, clusterId?: string) => {
    if (!undoToken || typeof window === 'undefined') {
      toast(message, 'success');
      return;
    }

    window.dispatchEvent(
      new CustomEvent('show-toast', {
        detail: {
          message,
          type: 'success',
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const headers = await getApiHeaders();
                const res = await fetch('/api/problems/undo', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ undoToken }),
                });
                const resData = await res.json().catch(() => ({}));
                if (!res.ok) {
                  toast(resData.error || 'Could not undo.', 'error');
                  return;
                }
                if (clusterId) {
                  localStorage.removeItem(`plus_one_${clusterId}`);
                }
                toast('Submission undone!', 'success');
              } catch {
                toast('Undo failed due to network error.', 'error');
              }
            },
          },
        },
      })
    );
  };

  const resetTurnstile = () => {
    if (TURNSTILE_SITE_KEY && window.turnstile && turnstileWidgetId.current) {
      window.turnstile.reset(turnstileWidgetId.current);
      setTurnstileToken(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    if (needsCategory && !userCategory.trim()) {
      toast('Please enter a category', 'error');
      return;
    }

    setLoading(true);
    setStatusMsg(needsCategory ? 'Submitting category...' : 'Analyzing safety...');

    const timer1 = !needsCategory
      ? setTimeout(() => setStatusMsg('Finding similarities...'), 800)
      : null;
    const timer2 = !needsCategory
      ? setTimeout(() => setStatusMsg('Placing on board...'), 2200)
      : null;

    try {
      const headers = await getApiHeaders();
      const res = await fetch('/api/problems/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          userCategory: needsCategory ? userCategory : undefined,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);

      if (!res.ok || data.error) {
        toast(data.error || 'Submission failed.', 'error');
      } else if (data.status === 'needs_category') {
        setNeedsCategory(true);
        toast('Category unclear. Please specify a broad category.', 'error');
      } else if (data.status === 'borderline') {
        setBorderlineMatch(data);
      } else if (data.status === 'merged') {
        showUndoToast('Merged with a similar problem!', data.undoToken, data.clusterId);
        localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
        if (onMerged) onMerged(data.clusterId);
        setText('');
        setNeedsCategory(false);
        setUserCategory('');
      } else {
        showUndoToast('Problem successfully dropped!', data.undoToken, data.clusterId);
        if (data.clusterId) {
          localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
        }
        setText('');
        setNeedsCategory(false);
        setUserCategory('');
      }
      resetTurnstile();
    } catch {
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      toast('Submission failed due to network error.', 'error');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const handleConfirmMerge = async () => {
    if (!borderlineMatch || loading) return;
    setLoading(true);
    setStatusMsg('Merging bubbles...');
    try {
      const headers = await getApiHeaders();
      const res = await fetch('/api/problems/confirm-merge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clusterId: borderlineMatch.match.id,
          borderlineToken: borderlineMatch.borderlineToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        toast(data.error || 'Failed to merge bubbles.', 'error');
        return;
      }
      const targetId = data.clusterId || borderlineMatch.match.id;
      localStorage.setItem(`plus_one_${targetId}`, 'true');
      if (onMerged) onMerged(targetId);
      showUndoToast('Bubbles merged successfully!', data.undoToken, targetId);
      setBorderlineMatch(null);
      setText('');
      setNeedsCategory(false);
      setUserCategory('');
    } catch {
      toast('Merge failed due to network error.', 'error');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const handleConfirmNew = async () => {
    if (!borderlineMatch || loading) return;
    setLoading(true);
    setStatusMsg('Creating new bubble...');
    try {
      const headers = await getApiHeaders();
      const res = await fetch('/api/problems/confirm-new', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          borderlineToken: borderlineMatch.borderlineToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        toast(data.error || 'Failed to create new bubble.', 'error');
        return;
      }
      if (data.clusterId) {
        localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
      }
      showUndoToast('New bubble created!', data.undoToken, data.clusterId);
      setBorderlineMatch(null);
      setText('');
      setNeedsCategory(false);
      setUserCategory('');
    } catch {
      toast('Create failed due to network error.', 'error');
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  const handleAddMoreInfo = () => {
    if (!borderlineMatch || loading) return;
    const prefill = borderlineMatch.text || text;
    setBorderlineMatch(null);
    setText(prefill);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const similarityPct = borderlineMatch
    ? Math.round((borderlineMatch.match.similarity || 0) * 100)
    : 0;

  return (
    <>
      <form onSubmit={handleSubmit} className="problem-input-container">
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <input
            ref={inputRef}
            className="problem-input"
            style={{ paddingRight: '45px' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's bugging you right now?"
            disabled={loading}
          />
          {needsCategory && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="problem-input fade-in"
                style={{
                  background: 'var(--bubble-bg)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  flex: 1,
                }}
                value={userCategory}
                onChange={(e) => setUserCategory(e.target.value)}
                placeholder="E.g., Transportation, Software, Health..."
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setNeedsCategory(false);
                  setUserCategory('');
                }}
                disabled={loading}
                style={{ padding: '10px 14px', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !text.trim()}
            style={{
              position: 'absolute',
              right: '8px',
              top: needsCategory ? '28px' : '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground)',
              cursor: 'pointer',
              padding: '8px',
              opacity: loading || !text.trim() ? 0.5 : 1,
            }}
          >
            {loading ? (
              <Loader2
                size={20}
                className="spin"
                style={{ animation: 'spin 1s linear infinite' }}
              />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        {TURNSTILE_SITE_KEY && <div ref={turnstileRef} />}

        {statusMsg && (
          <div
            className="fade-in"
            style={{
              fontSize: '0.9rem',
              color: 'var(--foreground)',
              opacity: 0.7,
              fontWeight: 500,
            }}
          >
            {statusMsg}
          </div>
        )}
      </form>

      {borderlineMatch && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!loading) setBorderlineMatch(null);
          }}
        >
          <div
            className="modal-content fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ textAlign: 'left' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>Similar problem found</h3>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: 'rgba(195, 125, 146, 0.16)',
                  color: 'var(--accent)',
                }}
              >
                {similarityPct}% match
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', opacity: 0.65, fontWeight: 600 }}>
              Your problem
            </div>
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--chip-bg)',
                border: '1px solid var(--bubble-border)',
                borderRadius: '10px',
                margin: '4px 0 12px',
                fontSize: '0.92rem',
              }}
            >
              &ldquo;{borderlineMatch.text || text}&rdquo;
            </div>

            <div style={{ fontSize: '0.78rem', opacity: 0.65, fontWeight: 600 }}>
              Existing cluster{' '}
              {borderlineMatch.match.category ? `• ${borderlineMatch.match.category}` : ''}
            </div>
            <div
              style={{
                padding: '12px',
                background: 'rgba(195, 125, 146, 0.1)',
                border: '1px solid var(--accent-glow)',
                borderRadius: '10px',
                margin: '4px 0 18px',
                fontWeight: 600,
              }}
            >
              &ldquo;{borderlineMatch.match.title}&rdquo;
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={handleConfirmMerge}
              >
                Merge into this
              </button>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={handleAddMoreInfo}
              >
                Add more info &amp; resubmit
              </button>
              <button
                type="button"
                className="btn"
                disabled={loading}
                onClick={handleConfirmNew}
              >
                Create new anyway
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setBorderlineMatch(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--foreground)',
                  opacity: 0.65,
                  cursor: 'pointer',
                  padding: '6px',
                  fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
