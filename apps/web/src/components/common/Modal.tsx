import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 内容区最大宽度，默认 640 */
  width?: number;
}

/** 居中模态框：遮罩 + 居中卡片，ESC 关闭。 */
export default function Modal({ open, onClose, title, children, width = 640 }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`modal-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`modal-box${open ? ' open' : ''}`} style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  );
}
