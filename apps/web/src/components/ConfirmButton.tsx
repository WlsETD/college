/**
 * 兩段式確認按鈕。
 *
 * 不用 window.confirm()：原生對話框跳出來是系統樣式，和像素風格差太多，
 * 而且在 PWA 裡看起來像瀏覽器警告。按第一下換成確認狀態，五秒沒動作就還原。
 */

import { useEffect, useState } from 'react';

export interface ConfirmButtonProps {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}

export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled = false,
  className = 'btn btn-small',
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? `${className} btn-danger` : className}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? `▲ ${confirmLabel}` : label}
    </button>
  );
}
