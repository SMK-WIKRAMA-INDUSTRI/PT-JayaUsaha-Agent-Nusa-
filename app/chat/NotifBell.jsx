'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtWaktu } from '../../lib/format';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

// Lonceng Notifikasi Gajian. items: [{ id, isi, dibaca_at, created_at }].
export default function NotifBell({ items, disabled, onOpen }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const unread = items.filter((n) => !n.dibaca_at).length;

  // Popover ditutup dengan Escape atau klik di luar lonceng.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="notif" ref={rootRef}>
      <button
        type="button"
        className="btn ghost notif-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          {items.length ? (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={'notif-item' + (n.dibaca_at ? '' : ' unread')}
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onOpen(n);
                }}
              >
                <span>{n.isi}</span>
                <small>{fmtWaktu(n.created_at)}</small>
              </button>
            ))
          ) : (
            <p className="notif-empty">Belum ada notifikasi.</p>
          )}
        </div>
      )}
    </div>
  );
}
