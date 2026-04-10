import { type ReactNode } from 'react';

interface ModalProps {
  /** Called when the backdrop is clicked. Omit to disable click-outside dismiss. */
  onClose?: () => void;
  children: ReactNode;
  'aria-labelledby'?: string;
}

/**
 * Reusable modal backdrop.
 * Always vertically centered. Children should render the white panel.
 */
export function Modal({ onClose, children, 'aria-labelledby': labelledBy }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {children}
    </div>
  );
}