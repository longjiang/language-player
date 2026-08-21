import React, { useEffect, useRef } from 'react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showHeader?: boolean;
}

export function Dialog({ open, onOpenChange, title, closeLabel, description, children, className = '', showHeader = true }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const first = dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]');
    first?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="lpv-ui-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(false); }}>
      <div ref={dialogRef} className={`lpv-ui-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="lpv-dialog-title">
        {showHeader && (
          <div className="lpv-ui-dialog-header">
            <div>
              <h2 id="lpv-dialog-title" className="lpv-ui-dialog-title">{title}</h2>
              {description && <p className="lpv-ui-dialog-description">{description}</p>}
            </div>
            <button className="lpv-ui-button lpv-ui-button-ghost lpv-ui-button-icon" aria-label={closeLabel} onClick={() => onOpenChange(false)}>×</button>
          </div>
        )}
        <div className="lpv-ui-dialog-body">{children}</div>
      </div>
    </div>
  );
}
