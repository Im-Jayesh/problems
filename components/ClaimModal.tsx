"use client";

import { useState } from 'react';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';

export default function ClaimModal({ clusterId, onClose }: { clusterId: string, onClose: () => void }) {
  const { data, isLoading } = db.useQuery({ clusters: { $: { where: { id: clusterId } } } });
  const [claiming, setClaiming] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');

  if (isLoading || !data || !data.clusters[0]) return null;
  const cluster = data.clusters[0];

  const handlePlusOne = () => {
    if (localStorage.getItem(`plus_one_${clusterId}`)) {
      toast("You already +1'd this problem!", 'error');
      return;
    }
    localStorage.setItem(`plus_one_${clusterId}`, 'true');
    
    db.transact(
      db.tx.clusters[clusterId].update({
        plusOneCount: cluster.plusOneCount + 1,
        totalWeight: cluster.totalWeight + 1,
        updatedAt: Date.now(),
        velocity: (cluster.velocity || 0) + 1,
      })
    );
    toast("+1 Added to board!", 'success');
    onClose();
  };

  const handleClaim = (e: React.FormEvent) => {
    e.preventDefault();
    db.transact(
      db.tx.clusters[clusterId].update({
        claimedByName: name,
        claimedByLink: link,
        claimedMessage: msg,
        claimedAt: Date.now(),
      })
    );
    toast(`Claimed as ${name}!`, 'success');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <h2>{cluster.title}</h2>
        <div style={{ margin: '20px 0', fontSize: '1.2rem', color: 'var(--accent)' }}>
          {cluster.totalWeight} people feel this pain
        </div>

        {!cluster.claimedByName ? (
          <>
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '1.1rem' }} onClick={handlePlusOne}>
              +1 Me Too
            </button>

            <div style={{ margin: '24px 0', opacity: 0.5 }}>--- OR ---</div>

            {!claiming ? (
              <button className="btn" style={{ width: '100%' }} onClick={() => setClaiming(true)}>
                I'm building a solution for this
              </button>
            ) : (
              <form onSubmit={handleClaim} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                <input required placeholder="Your Name or Studio" className="problem-input" value={name} onChange={e => setName(e.target.value)} />
                <input required placeholder="Link (Twitter, GitHub, Site)" type="url" className="problem-input" value={link} onChange={e => setLink(e.target.value)} />
                <textarea required placeholder="What are you building?" className="problem-input" style={{ minHeight: '80px', borderRadius: '16px' }} value={msg} onChange={e => setMsg(e.target.value)} />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Claim Problem</button>
                  <button type="button" className="btn" onClick={() => setClaiming(false)}>Cancel</button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', textAlign: 'left' }}>
            <h4 style={{ color: 'var(--accent)', marginTop: 0 }}>Claimed by {cluster.claimedByName}</h4>
            <p>{cluster.claimedMessage}</p>
            <a href={cluster.claimedByLink} target="_blank" rel="noreferrer" style={{ color: 'white' }}>Follow Progress →</a>
            <div style={{ marginTop: '20px' }}>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePlusOne}>+1 Me Too</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
