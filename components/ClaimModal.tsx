"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { toast } from '@/lib/toast';
import { id } from '@instantdb/react';

export default function ClaimModal({ clusterId, onClose }: { clusterId: string, onClose: () => void }) {
  const { data, isLoading } = db.useQuery({ clusters: { $: { where: { id: clusterId } }, problems: {}, claims: {} } });
  const [claiming, setClaiming] = useState(false);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [hasClaimed, setHasClaimed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(`claimed_${clusterId}`)) {
      setHasClaimed(true);
    }
  }, [clusterId]);

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
    const claimId = id();
    db.transact([
      db.tx.claims[claimId].update({
        name,
        link,
        message: msg,
        createdAt: Date.now(),
      }).link({ cluster: clusterId })
    ]);
    localStorage.setItem(`claimed_${clusterId}`, 'true');
    setHasClaimed(true);
    toast(`Claimed as ${name}!`, 'success');
    setClaiming(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content fade-in" onClick={e => e.stopPropagation()}>
        <h2>{cluster.title}</h2>
        
        {cluster.problems && cluster.problems.length > 1 && (
          <div style={{ background: 'rgba(255,255,255,0.4)', padding: '12px', borderRadius: '12px', maxHeight: '120px', overflowY: 'auto', margin: '16px 0', fontSize: '0.85rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontWeight: 600, opacity: 0.7, marginBottom: '4px' }}>Also includes:</div>
            {cluster.problems.filter((p: any) => p.text !== cluster.title).map((p: any) => (
              <div key={p.id} style={{ padding: '8px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px' }}>
                "{p.text}"
              </div>
            ))}
          </div>
        )}

        <div style={{ margin: '20px 0', fontSize: '1.2rem', color: 'var(--accent)', fontWeight: 600 }}>
          {cluster.totalWeight} people feel this pain
        </div>

        {cluster.claims && cluster.claims.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: 'var(--accent)', marginTop: 0, textAlign: 'left' }}>Solutions in progress</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '180px', overflowY: 'auto', paddingRight: '8px' }}>
              {cluster.claims.map((claim: any) => (
                <div key={claim.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{claim.name}</div>
                  <p style={{ margin: '8px 0', fontSize: '0.9rem' }}>{claim.message}</p>
                  <a href={claim.link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 600 }}>Follow Progress →</a>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '1.1rem', marginBottom: '24px' }} onClick={handlePlusOne}>
          +1 Me Too
        </button>

        {!hasClaimed && (
          <>
            <div style={{ margin: '0 0 24px 0', opacity: 0.5 }}>--- OR ---</div>

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
        )}
      </div>
    </div>
  );
}
