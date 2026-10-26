import { useState } from 'react';
import { Loader2, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useAuthStore } from '@/stores/authStore';

const MIN_PASSWORD = 10;

/** Sign-in page, and on the very first visit the page that creates the account. */
export function SignInPage({ mode }: { mode: 'setup' | 'login' }) {
  const setup = useAuthStore((s) => s.setup);
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';
  const tooShort = isSetup && password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = isSetup && repeat.length > 0 && repeat !== password;
  const ready = username.trim() && password && (!isSetup || (code.trim() && password.length >= MIN_PASSWORD && repeat === password));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const err = isSetup ? await setup(username.trim(), password, code.trim()) : await login(username.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      setPassword('');
      setRepeat('');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <form
        onSubmit={submit}
        className="w-full max-w-[400px] rounded-[18px] border border-border bg-card p-8 shadow-sm"
        aria-labelledby="signin-title"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <div>
            <h1 id="signin-title" className="text-xl font-semibold tracking-tight text-foreground">
              {isSetup ? 'Create your account' : 'Sign in'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSetup ? 'Web FTP Client — first start' : 'Web FTP Client'}
            </p>
          </div>
        </div>

        {isSetup && (
          <div className="mb-5 rounded-md border border-border bg-secondary/60 p-3 text-[13px] leading-relaxed text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <TerminalSquare className="h-4 w-4" /> Setup code
            </div>
            Only someone with access to the server can create the account. On ZimaOS, run in the terminal:
            <code className="my-2 block whitespace-nowrap rounded bg-card px-2 py-1 font-mono text-[12px] text-foreground">sudo web-ftp-client setup-code</code>
            With plain Docker, the code is in the container log.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {isSetup && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Setup code
              <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" spellCheck={false} className="font-mono" autoFocus />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            User name
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus={!isSetup} spellCheck={false} />
          </label>
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Password
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSetup ? 'new-password' : 'current-password'} aria-invalid={tooShort} aria-describedby={tooShort ? 'pw-hint' : undefined} />
            </label>
            {tooShort && <span id="pw-hint" className="text-[12px] text-destructive">At least {MIN_PASSWORD} characters</span>}
          </div>
          {isSetup && (
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Repeat password
                <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} aria-describedby={mismatch ? 'repeat-hint' : undefined} />
              </label>
              {mismatch && <span id="repeat-hint" className="text-[12px] text-destructive">The passwords differ</span>}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-destructive-tint bg-destructive-tint/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-6 h-10 w-full" disabled={!ready || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isSetup ? <ShieldCheck className="h-4 w-4" /> : null}
          {isSetup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
