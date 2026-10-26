import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AppLayout } from './components/layout/AppLayout';
import { SignInPage } from './components/auth/SignInPage';
import { useAuthStore } from './stores/authStore';
import { Button } from './components/ui/button';

export function App() {
  const phase = useAuthStore((s) => s.phase);
  const refresh = useAuthStore((s) => s.refresh);

  useEffect(() => { void refresh(); }, [refresh]);

  if (phase === 'ready') return <AppLayout />;
  if (phase === 'setup' || phase === 'login') return <SignInPage key={phase} mode={phase} />;
  if (phase === 'unreachable') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        The server does not answer.
        <Button variant="outline" onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}
