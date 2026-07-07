"use client";

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';

export default function ProblemInput({ onMerged }: { onMerged?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [borderlineMatch, setBorderlineMatch] = useState<any>(null);
  const [needsCategory, setNeedsCategory] = useState(false);
  const [userCategory, setUserCategory] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    if (needsCategory && !userCategory.trim()) {
      toast("Please enter a category", "error");
      return;
    }

    setLoading(true);
    setStatusMsg(needsCategory ? "Submitting category..." : "Analyzing safety...");
    
    // Visual progress markers to give user feedback
    const timer1 = !needsCategory ? setTimeout(() => setStatusMsg("Finding similarities..."), 800) : null;
    const timer2 = !needsCategory ? setTimeout(() => setStatusMsg("Placing on board..."), 2200) : null;
    
    try {
      const res = await fetch('/api/problems/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, userCategory: needsCategory ? userCategory : undefined })
      });
      const data = await res.json();
      
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
      
      if (data.error) {
        toast(data.error, 'error');
      } else if (data.status === 'needs_category') {
        setNeedsCategory(true);
        toast("Category unclear. Please specify a broad category.", 'error');
      } else if (data.status === 'borderline') {
        setBorderlineMatch(data);
      } else if (data.status === 'merged') {
        toast("Merged with a similar problem!", 'success');
        localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
        if (onMerged) onMerged(data.clusterId);
        setText('');
        setNeedsCategory(false);
        setUserCategory('');
      } else {
        toast("Problem successfully dropped!", 'success');
        localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
        setText('');
        setNeedsCategory(false);
        setUserCategory('');
      }
    } catch (err) {
      toast("Submission failed due to network error.", 'error');
    }
    setLoading(false);
    setStatusMsg('');
  };

  const handleConfirmMerge = async () => {
    setLoading(true);
    setStatusMsg("Merging bubbles...");
    await fetch('/api/problems/confirm-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: borderlineMatch.text, 
        embedding: borderlineMatch.embedding, 
        clusterId: borderlineMatch.match.id 
      })
    });
    localStorage.setItem(`plus_one_${borderlineMatch.match.id}`, 'true');
    if (onMerged) onMerged(borderlineMatch.match.id);
    toast("Bubbles merged successfully!", 'success');
    setBorderlineMatch(null);
    setText('');
    setLoading(false);
    setStatusMsg('');
  };

  const handleConfirmNew = async () => {
    setLoading(true);
    setStatusMsg("Creating new bubble...");
    const res = await fetch('/api/problems/confirm-new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text: borderlineMatch.text, 
        embedding: borderlineMatch.embedding 
      })
    });
    const data = await res.json();
    if (data.clusterId) localStorage.setItem(`plus_one_${data.clusterId}`, 'true');
    toast("New bubble created!", 'success');
    setBorderlineMatch(null);
    setText('');
    setLoading(false);
    setStatusMsg('');
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="problem-input-container">
        <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            className="problem-input"
            style={{ paddingRight: '45px' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's bugging you right now?"
            disabled={loading || needsCategory}
          />
          {needsCategory && (
            <input
              className="problem-input fade-in"
              style={{ background: 'var(--bubble-bg)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
              value={userCategory}
              onChange={(e) => setUserCategory(e.target.value)}
              placeholder="E.g., Transportation, Software, Health..."
              disabled={loading}
              autoFocus
            />
          )}
          <button 
            type="submit" 
            disabled={loading || !text.trim()}
            style={{ 
              position: 'absolute', right: '8px', top: needsCategory ? '75%' : '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', color: 'var(--foreground)', cursor: 'pointer', padding: '8px',
              opacity: (loading || !text.trim()) ? 0.5 : 1
            }}
          >
            {loading ? <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />}
          </button>
        </div>
        
        {statusMsg && (
          <div className="fade-in" style={{ fontSize: '0.9rem', color: 'var(--foreground)', opacity: 0.7, fontWeight: 500 }}>
            {statusMsg}
          </div>
        )}
      </form>

      {borderlineMatch && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <h3>This sounds similar to:</h3>
            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', margin: '16px 0' }}>
              "{borderlineMatch.match.title}"
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={handleConfirmMerge}>+1 Merge</button>
              <button className="btn" onClick={handleConfirmNew}>Post as New</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
