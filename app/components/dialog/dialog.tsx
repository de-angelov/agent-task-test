import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

import styles from "./dialog.module.css";

interface DialogProps {
  cancelAction: ReactNode;
  children: ReactNode;
  confirmAction: ReactNode;
  isOpen: boolean;
  onCancel?: () => void;
  title: string;
}

export function Dialog({
  cancelAction,
  children,
  confirmAction,
  isOpen,
  onCancel,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      previousFocusRef.current = document.activeElement;
      dialog.showModal();
      focusFirstDialogControl(dialog);
      return;
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    const previousFocus = previousFocusRef.current;

    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }

    previousFocusRef.current = null;
  }, [isOpen]);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className={styles.dialog}
      onCancel={onCancel}
      ref={dialogRef}
    >
      <div className={styles.content}>
        <h2 id={titleId}>{title}</h2>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>
          {cancelAction}
          {confirmAction}
        </div>
      </div>
    </dialog>
  );
}

function focusFirstDialogControl(dialog: HTMLDialogElement) {
  const control = dialog.querySelector<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );

  control?.focus();
}

export type { DialogProps };
