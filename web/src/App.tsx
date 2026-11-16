import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { login, logout } from './api/auth';
import { AdminPage } from './components/AdminPage';
import { Logo } from './components/Logo';

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
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <Logo />
        <header>
          <h1 id="login-title">총관리자 로그인</h1>
          <p>공원과 Jubi의 하루를 관리해요.</p>
        </header>
        <form onSubmit={submit}>
          <label htmlFor="login-id">아이디</label>
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
          <label htmlFor="login-password">비밀번호</label>
          <div className="password-field">
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
              {visible ? '숨기기' : '보기'}
            </button>
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
          총관리자 전용 웹이에요.
          <br />
          하위관리자는 모바일 앱에서 로그인해 주세요.
        </p>
      </section>
    </main>
  );
}
