// W-02 관리자 보기 - 필터 펼침 (Figma Page 4 · 294:786): 버튼을 누르면 목록이 펼쳐지고 고른 항목에 ✓ 표시
import { useEffect, useId, useRef, useState } from 'react';

export type SelectOption<T extends string> = { value: T; label: string };

export function SelectMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  width = 240,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  // 바깥을 누르거나 Esc를 누르면 닫아요
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="select-menu" ref={root} style={{ width }}>
      <button
        type="button"
        className="select-menu-button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.label}</span>
        <img src="/icons/chevron-down.svg" width="19.44" height="19.44" alt="" />
      </button>
      {open ? (
        <ul className="select-menu-list" id={listId} role="listbox" aria-label={label}>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={selected ? 'selected' : undefined}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                  {selected ? <span aria-hidden>✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
