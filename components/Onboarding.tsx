"use client";

import { useState } from 'react';

export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(1);

  return (
    <div className="modal-overlay">
      <div className="modal-content fade-in">
        {step === 1 && (
          <div className="fade-in">
            <h1 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>What's the world stuck on?</h1>
            <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        )}
        
        {step === 2 && (
          <div className="fade-in">
            <h2>Watch problems merge live</h2>
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}>finding parking</div>
              <span>+</span>
              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}>parking space finder</div>
            </div>
            <p>Similar ideas grow together.</p>
            <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={() => setStep(3)}>Next</button>
          </div>
        )}

        {step === 3 && (
          <div className="fade-in">
            <h2>Ground Rules</h2>
            <p style={{ fontSize: '1.2rem', margin: '24px 0', opacity: 0.8 }}>
              Be real. No names. No ads. No hate speech.
            </p>
            <button className="btn btn-primary" onClick={onFinish}>Enter Board</button>
          </div>
        )}
      </div>
    </div>
  );
}
