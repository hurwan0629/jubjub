import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { login, logout } from './api/auth';
import { AdminPage } from './components/AdminPage';

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const exit = () => {
    logout();
    setAuthenticated(false);
  };
  return authenticated ? <AdminPage onLogout={exit} /> : <LoginPage onLogin={() => setAuthenticated(true)} />;
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !id.trim() || !password) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    try {
      await login({ loginId: id.trim(), password }, current.signal);
      if (!current.signal.aborted) {
        setPassword('');
        onLogin();
      }
    } catch (e) {
      if (!current.signal.aborted) setError(e instanceof Error ? e.message : '로그인하지 못했어요');
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  };
  // W-00 관리자 로그인 (Figma Page 4 · 301:747)
  return (
    <main className="login-page">
      <section className="login-brand" aria-hidden="true">
        <img src="/icons/jubjub-white-large.svg" width="140" height="140" alt="" />
        <strong>JUBJUB</strong>
        <p>
          공원 로봇 Jubi와 담당 관리자를
          <br />
          한곳에서 관리해요
        </p>
        {/* <small>JUBJUB 관리자 웹</small> */}
      </section>
      <div className="login-area">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-intro">
            <div className="login-logo">
              <span className="login-app-icon">
                <img src="/icons/jubjub-white.svg" width="46" height="46" alt="" />
              </span>
              <span>JUBJUB</span>
            </div>
            <header>
              <h1 id="login-title">관리자 로그인</h1>
              <p>관리자 계정의 아이디와 비밀번호를 입력해 주세요.</p>
            </header>
          </div>
          <form onSubmit={submit}>
            <div className="login-field">
              <label htmlFor="login-id">아이디</label>
              <div className="login-input">
                <img src="/icons/user-round.svg" width="21.6" height="21.6" alt="" />
                <input
                  id="login-id"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setError('');
                  }}
                  placeholder="아이디를 입력해 주세요"
                  disabled={busy}
                  required
                />
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="login-password">비밀번호</label>
              <div className="login-input">
                <img src="/icons/lock-keyhole.svg" width="21.6" height="21.6" alt="" />
                <input
                  id="login-password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="비밀번호를 입력해 주세요"
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                >
                  <img src={visible ? '/icons/eye.svg' : '/icons/eye-off.svg'} width="21.6" height="21.6" alt="" />
                </button>
              </div>
            </div>
            {error ? (
              <p className="error-text" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button primary" type="submit" disabled={busy || !id.trim() || !password}>
              {busy ? '로그인하는 중…' : '로그인'}
            </button>
          </form>
          <p className="login-help">
            <img src="/icons/circle-help.svg" width="17.28" height="17.28" alt="" />
            계정이 기억나지 않으면 담당자에게 문의해 주세요.
          </p>
        </section>
      </div>
    </main>
  );
}
