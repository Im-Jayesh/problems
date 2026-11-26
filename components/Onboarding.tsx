"use client";

import { useState } from 'react';
import { Sparkles, ThumbsUp, Hammer, MessageSquarePlus } from 'lucide-react';

export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(1);

  return (
    <div className="modal-overlay">
      <div className="modal-content fade-in">
        {/* Step indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                style={{
                  width: s === step ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '999px',
                  background: s <= step ? 'var(--accent)' : 'var(--bubble-border)',
                  transition: 'all 0.25s ease',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onFinish}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground)',
              opacity: 0.55,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        </div>

        {step === 1 && (
          <div className="fade-in">
            <h1 style={{ fontSize: '2.1rem', margin: '0 0 12px', lineHeight: 1.2 }}>
              What&apos;s the world stuck on?
            </h1>
            <p style={{ fontSize: '1rem', opacity: 0.78, lineHeight: 1.55, margin: '0 0 28px' }}>
              A living, anonymous board of everyday frustrations. Share what annoys you, see what
              others feel too, and inspire builders to fix it.
            </p>
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              See how it works →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in" style={{ textAlign: 'left' }}>
            <h2 style={{ margin: '0 0 16px', textAlign: 'center' }}>How the board works</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--chip-bg)',
                  border: '1px solid var(--bubble-border)',
                }}
              >
                <MessageSquarePlus size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>1. Drop a problem</div>
                  <div style={{ fontSize: '0.84rem', opacity: 0.78 }}>
                    Type anything that bugs you in the bar at the bottom. No account needed.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--chip-bg)',
                  border: '1px solid var(--bubble-border)',
                }}
              >
                <Sparkles size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>2. AI auto-grouping &amp; merging</div>
                  <div style={{ fontSize: '0.84rem', opacity: 0.78 }}>
                    Similar problems automatically merge into larger bubbles and cluster by category.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'var(--chip-bg)',
                  border: '1px solid var(--bubble-border)',
                }}
              >
                <ThumbsUp size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>3. +1 Me Too &amp; Claim</div>
                  <div style={{ fontSize: '0.84rem', opacity: 0.78 }}>
                    Click any bubble to upvote (+1) or claim it if you&apos;re building a solution!
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <button className="btn" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', background: 'var(--chip-bg)', marginBottom: '12px' }}>
              <Hammer size={26} color="var(--accent)" />
            </div>
            <h2 style={{ margin: '0 0 12px' }}>Ground Rules</h2>
            <p style={{ fontSize: '1.05rem', margin: '0 0 28px', opacity: 0.82, lineHeight: 1.5 }}>
              Be real. No personal names. No ads or spam. No hate speech.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button className="btn" onClick={() => setStep(2)}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={onFinish}>
                Enter Board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
