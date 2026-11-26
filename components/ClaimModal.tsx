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
  onClose,
}: {
  clusterId: string;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-12px' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: 'var(--foreground)',
              opacity: 0.6,
            }}
          >
            ✕
          </button>
        </div>

        <h2>{cluster.title}</h2>

        {cluster.problems && cluster.problems.length > 1 && (
          <div
            style={{
              background: 'var(--chip-bg)',
              border: '1px solid var(--bubble-border)',
              padding: '12px',
              borderRadius: '12px',
              maxHeight: '120px',
              overflowY: 'auto',
              margin: '16px 0',
              fontSize: '0.85rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontWeight: 600, opacity: 0.7, marginBottom: '4px' }}>
              Also includes:
            </div>
            {(cluster.problems as ProblemRecord[])
              .filter((p) => p.text !== cluster.title)
              .map((p) => (
                <div
                  key={p.id}
                  style={{
                    padding: '8px',
                    background: 'var(--surface)',
                    borderRadius: '6px',
                  }}
                >
                  &ldquo;{p.text}&rdquo;
                </div>
              ))}
          </div>
        )}

        <div
          style={{
            margin: '20px 0',
            fontSize: '1.2rem',
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          {cluster.totalWeight} people feel this pain
        </div>

        {cluster.claims && cluster.claims.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: 'var(--accent)', marginTop: 0, textAlign: 'left' }}>
              Solutions in progress
            </h4>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                maxHeight: '180px',
                overflowY: 'auto',
                paddingRight: '8px',
              }}
            >
              {(cluster.claims as ClaimRecord[]).map((claim) => (
                <div
                  key={claim.id}
                  style={{
                    background: 'var(--chip-bg)',
                    padding: '14px',
                    borderRadius: '12px',
                    textAlign: 'left',
                    border: '1px solid var(--bubble-border)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                    {claim.name}
                  </div>
                  <p style={{ margin: '8px 0', fontSize: '0.9rem' }}>{claim.message}</p>
                  {isSafeHttpUrl(claim.link) ? (
                    <a
                      href={claim.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--accent)',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                      }}
                    >
                      Follow Progress →
                    </a>
                  ) : (
                    claim.link && (
                      <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                        {claim.link}
                      </span>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={submitting}
          className={`btn ${hasVoted ? '' : 'btn-primary'}`}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '1.05rem',
            marginBottom: '24px',
          }}
          onClick={handleToggleVote}
        >
          {hasVoted ? '✓ Voted (+1 Me Too) — Click to Undo' : '+1 Me Too'}
        </button>

        {!hasClaimed && (
          <>
            <div style={{ margin: '0 0 24px 0', opacity: 0.5 }}>--- OR ---</div>

            {!claiming ? (
              <button
                type="button"
                className="btn"
                style={{ width: '100%' }}
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
                  gap: '12px',
                  textAlign: 'left',
                }}
              >
                <input
                  required
                  placeholder="Your Name or Studio"
                  className="problem-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
                <input
                  required
                  placeholder="Link (https://...)"
                  type="url"
                  className="problem-input"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  disabled={submitting}
                />
                <textarea
                  required
                  placeholder="What are you building?"
                  className="problem-input"
                  style={{ minHeight: '80px', borderRadius: '16px' }}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  disabled={submitting}
                />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    {submitting ? 'Submitting...' : 'Claim Problem'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    className="btn"
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
