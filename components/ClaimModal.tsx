"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { getApiHeaders } from '@/lib/fingerprint';

function isSafeHttpUrl(raw?: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

type ProblemRecord = {
  id: string;
  text: string;
};

type ClaimRecord = {
  id: string;
  name: string;
  link: string;
  message: string;
};

export default function ClaimModal({
  clusterId,
  highlightProblemText = null,
  onClose,
}: {
  clusterId: string;
  highlightProblemText?: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = db.useQuery({
    clusters: { $: { where: { id: clusterId } }, problems: {}, claims: {} },
  });
  const [claiming, setClaiming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [hasClaimed, setHasClaimed] = useState(() =>
    typeof window !== 'undefined' ? Boolean(localStorage.getItem(`claimed_${clusterId}`)) : false
  );
  const [hasVoted, setHasVoted] = useState(() =>
    typeof window !== 'undefined' ? Boolean(localStorage.getItem(`plus_one_${clusterId}`)) : false
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (isLoading || !data || !data.clusters[0]) return null;
  const cluster = data.clusters[0];

  const handleToggleVote = async () => {
    if (submitting) return;
    const action = hasVoted ? 'unvote' : 'vote';
    setSubmitting(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch('/api/problems/vote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ clusterId, action }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData.error) {
        toast(resData.error || 'Could not update vote.', 'error');
        return;
      }
      if (action === 'vote') {
        localStorage.setItem(`plus_one_${clusterId}`, 'true');
        setHasVoted(true);
        toast('+1 Added to board!', 'success');
      } else {
        localStorage.removeItem(`plus_one_${clusterId}`);
        setHasVoted(false);
        toast('Vote removed.', 'success');
      }
    } catch {
      toast('Vote failed due to network error.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!isSafeHttpUrl(link)) {
      toast('Please enter a valid http:// or https:// link.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const headers = await getApiHeaders();
      const res = await fetch('/api/problems/claim', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clusterId,
          name: name.trim(),
          link: link.trim(),
          message: msg.trim(),
        }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData.error) {
        toast(resData.error || 'Failed to claim problem.', 'error');
        return;
      }
      localStorage.setItem(`claimed_${clusterId}`, 'true');
      setHasClaimed(true);
      toast(`Claimed as ${name.trim()}!`, 'success');
      setClaiming(false);
    } catch {
      toast('Claim failed due to network error.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const weight = cluster.totalWeight ?? 0;
  const reports = cluster.submissionCount ?? 1;
  const activeProblem = highlightProblemText?.trim() || cluster.title;
  const isSubProblemView =
    Boolean(highlightProblemText?.trim()) &&
    highlightProblemText!.trim().toLowerCase() !== cluster.title.trim().toLowerCase();

  const relatedNuances = (() => {
    const seen = new Set<string>([activeProblem.trim().toLowerCase()]);
    const list: { id: string; text: string; isPrimary?: boolean }[] = [];
    const titleKey = cluster.title.trim().toLowerCase();
    if (!seen.has(titleKey)) {
      seen.add(titleKey);
      list.push({ id: 'primary', text: cluster.title, isPrimary: true });
    }
    for (const p of (cluster.problems || []) as ProblemRecord[]) {
      const k = p.text.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      list.push({ id: p.id, text: p.text });
    }
    return list;
  })();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          textAlign: 'left',
          padding: '24px',
          borderRadius: '20px',
          maxWidth: '480px',
          width: '92%',
        }}
      >
        {/* Top bar: Category badge + close */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'var(--chip-bg)',
              border: '1px solid var(--bubble-border)',
              color: 'var(--accent)',
            }}
          >
            {cluster.category || 'General'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '999px',
              background: 'var(--chip-bg)',
              border: '1px solid var(--bubble-border)',
              fontSize: '0.95rem',
              cursor: 'pointer',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.75,
            }}
          >
            ✕
          </button>
        </div>

        {/* Title & stats */}
        <h2
          style={{
            margin: '0 0 8px 0',
            fontSize: '1.3rem',
            lineHeight: 1.35,
            fontWeight: 700,
            letterSpacing: '-0.015em',
          }}
        >
          {activeProblem}
        </h2>

        {isSubProblemView && (
          <div
            style={{
              fontSize: '0.8rem',
              opacity: 0.72,
              marginBottom: '10px',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'var(--chip-bg)',
              border: '1px solid var(--bubble-border)',
            }}
          >
            Merged into cluster: <strong>&ldquo;{cluster.title}&rdquo;</strong>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.88rem',
            color: 'var(--accent)',
            fontWeight: 600,
            marginBottom: '20px',
          }}
        >
          <span>
            {weight} {weight === 1 ? 'person feels' : 'people feel'} this pain
          </span>
          {reports > 1 && (
            <span style={{ color: 'var(--foreground)', opacity: 0.55, fontWeight: 500 }}>
              · {reports} reports
            </span>
          )}
        </div>

        {relatedNuances.length > 0 && (
          <div
            className="no-scrollbar"
            style={{
              background: 'var(--chip-bg)',
              border: '1px solid var(--bubble-border)',
              padding: '12px',
              borderRadius: '12px',
              maxHeight: '130px',
              overflowY: 'auto',
              marginBottom: '18px',
              fontSize: '0.84rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Other nuances in this bubble
            </div>
            {relatedNuances.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '6px 10px',
                  background: 'var(--surface)',
                  borderRadius: '8px',
                  borderLeft: '2px solid var(--accent)',
                  lineHeight: 1.4,
                }}
              >
                &ldquo;{p.text}&rdquo;
                {p.isPrimary && (
                  <span style={{ marginLeft: '6px', fontSize: '0.72rem', opacity: 0.6 }}>
                    (main)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {cluster.claims && cluster.claims.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#10B981',
                marginBottom: '10px',
              }}
            >
              Solutions in progress ({cluster.claims.length})
            </div>
            <div
              className="no-scrollbar"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '180px',
                overflowY: 'auto',
              }}
            >
              {(cluster.claims as ClaimRecord[]).map((claim) => (
                <div
                  key={claim.id}
                  style={{
                    background: 'var(--chip-bg)',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--bubble-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--foreground)' }}>
                      {claim.name}
                    </span>
                    {isSafeHttpUrl(claim.link) ? (
                      <a
                        href={claim.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--accent)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          textDecoration: 'none',
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'var(--surface)',
                          border: '1px solid var(--bubble-border)',
                        }}
                      >
                        Follow ↗
                      </a>
                    ) : (
                      claim.link && (
                        <span style={{ fontSize: '0.78rem', opacity: 0.65 }}>{claim.link}</span>
                      )
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.86rem', opacity: 0.85, lineHeight: 1.45 }}>
                    {claim.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Primary Vote Action */}
        <button
          type="button"
          disabled={submitting}
          className={`btn ${hasVoted ? '' : 'btn-primary'}`}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '0.98rem',
            fontWeight: 600,
          }}
          onClick={handleToggleVote}
        >
          {hasVoted ? '✓ Voted (+1 Me Too) · Undo' : '+1 Me Too'}
        </button>

        {!hasClaimed && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '14px 0',
                opacity: 0.45,
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}
            >
              <div style={{ flex: 1, height: '1px', background: 'var(--bubble-border)' }} />
              <span>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--bubble-border)' }} />
            </div>

            {!claiming ? (
              <button
                type="button"
                className="btn"
                style={{
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                }}
                onClick={() => setClaiming(true)}
              >
                I&apos;m building a solution for this
              </button>
            ) : (
              <form
                onSubmit={handleClaim}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  textAlign: 'left',
                }}
              >
                <input
                  required
                  placeholder="Your Name or Studio"
                  className="problem-input"
                  style={{ borderRadius: '12px', padding: '11px 14px', fontSize: '0.92rem' }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
                <input
                  required
                  placeholder="Link (https://...)"
                  type="url"
                  className="problem-input"
                  style={{ borderRadius: '12px', padding: '11px 14px', fontSize: '0.92rem' }}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  disabled={submitting}
                />
                <textarea
                  required
                  placeholder="What are you building?"
                  className="problem-input"
                  style={{ minHeight: '80px', borderRadius: '12px', padding: '11px 14px', fontSize: '0.92rem' }}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  disabled={submitting}
                />
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ flex: 1, borderRadius: '12px', padding: '11px 16px' }}
                  >
                    {submitting ? 'Submitting...' : 'Claim Problem'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    className="btn"
                    style={{ borderRadius: '12px', padding: '11px 16px' }}
                    onClick={() => setClaiming(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
