import { useState } from 'react';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { toast } from 'sonner';

const MIN_PASSWORD = 10;

/** Signed-in user in the header: change password, sign out. */
export function AccountMenu() {
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const changePassword = useAuthStore((s) => s.changePassword);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Close an open remote connection first: the server keeps it, and nobody would see it after sign-out.
  const signOut = async () => {
    const conn = useConnectionStore.getState();
    if (conn.status.status === 'connected') await conn.disconnect().catch(() => undefined);
    await logout();
  };

  const close = () => { setOpen(false); setCurrent(''); setNext(''); setRepeat(''); setError(null); };
  const ready = current && next.length >= MIN_PASSWORD && next === repeat;

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const err = await changePassword(current, next);
    setBusy(false);
    if (err) { setError(err); return; }
    toast.success('Password changed', { description: 'Other browsers are signed out.' });
    close();
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5 text-sm" onClick={() => setOpen(true)} aria-label={`Account ${username ?? ''}: change password`}>
        <UserRound className="h-4 w-4" />
        <span className="hidden lg:inline max-w-[120px] truncate">{username}</span>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
        <LogOut className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Change password</DialogTitle>
            <DialogDescription>Signed in as {username}. Changing the password signs out every other browser.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
            <Input type="password" placeholder={`New password (at least ${MIN_PASSWORD} characters)`} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <Input type="password" placeholder="Repeat new password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            {repeat && next !== repeat && <span className="text-[12px] text-destructive">The passwords differ</span>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={!ready || busy}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
