import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function SlidePanel({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`slide-overlay${open ? ' open' : ''}`}
        onClick={onClose}
      />
      <div className={`slide-panel${open ? ' open' : ''}`}>
        <div className="slide-head">
          <h3>{title}</h3>
          <button className="slide-close" onClick={onClose}>✕</button>
        </div>
        <div className="slide-body">
          {children}
        </div>
      </div>
    </>
  );
}
