// W-04 로봇 목록 - 로봇 등록 팝업 · 토큰 발급(복사) · 토큰 발급 확인 (Figma Page 4 · 513:1290 / 513:1583 / 519:1594)
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

function Dialog({
  label,
  busy,
  width = 600,
  onClose,
  children,
}: {
  label: string;
  busy?: boolean;
  width?: number;
  onClose?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="rq-dialog"
      style={{ width: `min(${width}px, calc(100% - 32px))` }}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose?.();
      }}
    >
      {children}
    </dialog>
  );
}

/** 로봇 등록 팝업: 이름 · 시리얼 번호 */
export function RegisterDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (name: string, serial: string) => void;
}) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  return (
    <Dialog label="로봇 등록" busy={busy} width={520} onClose={onClose}>
      <form
        className="rq-body"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name.trim(), serial.trim());
        }}
      >
        <header className="rq-title">
          <h2>로봇 등록</h2>
          <p>등록하면 로봇이 서버에 접속할 때 쓰는 인증 토큰이 발급돼요.</p>
        </header>
        <label className="tk-field">
          <span>이름</span>
          <input required maxLength={100} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          <small>관리자 앱과 웹에 보이는 이름이에요. 나중에 바꿀 수 있어요.</small>
        </label>
        <label className="tk-field">
          <span>시리얼 번호</span>
          <input required maxLength={100} value={serial} disabled={busy} onChange={(e) => setSerial(e.target.value)} />
          <small>로봇 바닥 라벨에 적힌 S/N이에요. 다른 로봇과 겹칠 수 없어요.</small>
        </label>
        {error ? (
          <p className="rq-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="rq-footer">
          <button type="button" className="rq-button rq-soft-brand rq-tall" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="rq-button rq-primary rq-tall" disabled={busy || !name.trim() || !serial.trim()}>
            {busy ? '등록 중…' : '등록하기'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/** 토큰 발급 확인 (원문은 한 번만 보여 줘요) */
export function IssueConfirmDialog({
  name,
  serial,
  busy,
  onClose,
  onConfirm,
}: {
  name: string;
  serial: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label="토큰 발급 확인" busy={busy} width={560} onClose={onClose}>
      <div className="rq-body">
        <div className="tk-head">
          <span className="tk-mark tk-warn">!</span>
          <div className="rq-title">
            <h2>{name} 토큰을 발급할까요?</h2>
            <p>S/N {serial}</p>
          </div>
        </div>
        <ul className="tk-notes">
          <li>토큰 원문은 발급 직후 한 번만 보여 드려요.</li>
          <li>로봇 .env 파일에 붙여 넣어야 로봇이 서버에 연결돼요.</li>
        </ul>
        <footer className="rq-footer">
          <button className="rq-button rq-soft-brand rq-tall" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="rq-button rq-primary rq-tall" disabled={busy} onClick={onConfirm}>
            {busy ? '발급 중…' : '발급하기'}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}

/** 등록 · 발급 완료: 토큰과 .env 한 줄을 복사해요. 복사해야 닫을 수 있어요. */
export function TokenDialog({
  title,
  subtitle,
  token,
  onClose,
}: {
  title: string;
  subtitle: string;
  token: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'token' | 'env' | null>(null);
  const [failed, setFailed] = useState(false);
  const env = `ROBOT_TOKEN=${token}`;
  const copy = async (text: string, which: 'token' | 'env') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <Dialog label="로봇 인증 토큰" onClose={copied ? onClose : undefined}>
      <div className="rq-body">
        <div className="tk-head">
          <span className="tk-mark tk-done">✓</span>
          <div className="rq-title">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="tk-area">
          <div className="tk-label">
            <strong>로봇 인증 토큰</strong>
            <span className="tk-once">지금 한 번만 보여요</span>
          </div>
          <div className="tk-copy">
            <code>{token}</code>
            <button className="rq-button rq-primary" onClick={() => copy(token, 'token')}>
              {copied === 'token' ? '✓ 복사됨' : '복사'}
            </button>
          </div>
          <small className="tk-sub">로봇 .env 파일에 그대로 붙여 넣을 수 있어요</small>
          <div className="tk-copy tk-dark">
            <code>{env}</code>
            <button className="rq-button rq-white" onClick={() => copy(env, 'env')}>
              {copied === 'env' ? '✓ 복사됨' : '복사'}
            </button>
          </div>
        </div>
        <div className="tk-caution">
          <strong>창을 닫으면 토큰을 다시 볼 수 없어요</strong>
          <p>로봇 설정에 붙여 넣은 뒤 닫아 주세요. 잃어버리면 토큰을 새로 발급받아야 해요.</p>
        </div>
        {failed ? (
          <p className="rq-error" role="alert">
            복사하지 못했어요. 토큰을 직접 선택해서 복사해 주세요.
          </p>
        ) : null}
        <footer className="tk-footer">
          <small>{copied ? '로봇 설정에 붙여 넣었다면 닫아 주세요' : '토큰을 복사하면 닫을 수 있어요'}</small>
          <button className="rq-button rq-primary rq-tall" disabled={!copied && !failed} onClick={onClose}>
            확인하고 닫기
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
