import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Plus, Trash2, Settings, LayoutGrid, AlertCircle, X, Zap, Shield, Link2 } from 'lucide-react';
import { LineChart, Line } from 'recharts';
import { apiUrl, supabase } from './config';
import { decodeProjectId, encodeProjectId } from './encoding';
import { useSession } from './session';
import { sendConfirmationEmail } from './emailjs';

type ProjectStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

interface Project {
  id: string;
  name: string;
  url: string;
  language: string;
  status: ProjectStatus;
  latency: number;
}

type Incident = {
  id: string;
  ts: number;
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  message: string;
};

type Toast = {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
};

function toastId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function creditsStorageKeys(userId: string): { sessionKey: string; persistKey: string } {
  return {
    sessionKey: `hb_credits_session:${userId}`,
    persistKey: `hb_credits_persist:${userId}`,
  };
}

function loadCredits(userId: string): number {
  const { sessionKey, persistKey } = creditsStorageKeys(userId);
  const sessionVal = sessionStorage.getItem(sessionKey);
  const persistVal = localStorage.getItem(persistKey);
  const raw = sessionVal ?? persistVal;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 100;
}

function saveCredits(userId: string, credits: number): void {
  const { sessionKey, persistKey } = creditsStorageKeys(userId);
  const val = String(Math.max(0, Math.floor(credits)));
  sessionStorage.setItem(sessionKey, val);
  localStorage.setItem(persistKey, val);
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (kind: Toast['kind'], message: string) => {
    const id = toastId();
    setToasts((prev) => [...prev, { id, kind, message }].slice(-5));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };
  return { toasts, addToast };
}

function AppIndex() {
  const { ready, userId, username, emailConfirmed } = useSession();
  if (!ready) return <BlockingScreen title="Loading…" message="Starting session…" />;
  if (!userId) return <AuthPage />;
  if (emailConfirmed === false) return <Navigate to="/confirm-pending" replace />;
  if (emailConfirmed === null) return <ConfirmCheckScreen />;
  if (!username) return <Navigate to="/account/project" replace />;
  return <Navigate to={`/${encodeURIComponent(username)}/project`} replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, userId, emailConfirmed } = useSession();
  if (!ready) return <BlockingScreen title="Loading…" message="Starting session…" />;
  if (!userId) return <Navigate to="/" replace />;
  if (emailConfirmed === false) return <Navigate to="/confirm-pending" replace />;
  if (emailConfirmed === null) return <ConfirmCheckScreen />;
  return <>{children}</>;
}

function AuthPage() {
  const nav = useNavigate();
  const { addToast, toasts } = useToasts();
  const { ready, userId, username, emailConfirmed } = useSession();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSendingConfirm, setIsSendingConfirm] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!userId) return;
    if (emailConfirmed === false) {
      nav('/confirm-pending', { replace: true });
      return;
    }
    if (emailConfirmed === null) return;
    if (!username) {
      nav('/account/project', { replace: true });
      return;
    }
    nav(`/${encodeURIComponent(username)}/project`, { replace: true });
  }, [ready, userId, username, emailConfirmed]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/50 p-8">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">
            Heartbeat<span className="text-blue-500 text-xs text-not-italic ml-1">PRO</span>
          </h1>
        </div>

        {!supabase ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-amber-500" size={14} />
              <span>Supabase env missing. Create `frontend/.env` with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</span>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) return;
              if (!email || !password) {
                addToast('error', 'Email + password required.');
                return;
              }
              const fn =
                mode === 'signin'
                  ? supabase.auth.signInWithPassword({ email, password })
                  : supabase.auth.signUp({ email, password });
              const { error } = await fn;
              if (error) addToast('error', error.message);
              else {
                addToast('success', mode === 'signin' ? 'Signed in.' : 'Signed up.');
                if (mode === 'signup') {
                  try {
                    setIsSendingConfirm(true);
                    const guessedUsername = email.split('@')[0] ?? '';
                    const linkRes = await fetch(apiUrl('/api/v1/auth/send-confirmation'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, username: guessedUsername }),
                    });
                    const linkData = (await linkRes.json()) as { ok?: boolean; error?: string; confirmLink?: string };
                    if (!linkRes.ok || !linkData.ok || !linkData.confirmLink) {
                      addToast('error', linkData.error ?? 'Could not send confirmation email.');
                    } else {
                      await sendConfirmationEmail({
                        to_email: email,
                        confirmation_link: linkData.confirmLink,
                        username: guessedUsername,
                      });
                      addToast('info', 'Confirmation email sent (EmailJS).');
                    }
                  } catch {
                    addToast('error', 'Could not send confirmation email.');
                  } finally {
                    setIsSendingConfirm(false);
                  }
                }
              }
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase border ${
                  mode === 'signin'
                    ? 'bg-blue-600 text-white border-blue-500/30'
                    : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase border ${
                  mode === 'signup'
                    ? 'bg-blue-600 text-white border-blue-500/30'
                    : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                }`}
              >
                Sign up
              </button>
            </div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white"
            />
            <button
              type="submit"
              className="w-full py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all"
            >
              {mode === 'signin' ? 'Sign in' : isSendingConfirm ? 'Creating…' : 'Create account'}
            </button>
            {mode === 'signup' && (
              <p className="text-[10px] text-zinc-500">
                After signup, we’ll email you a confirmation link (via EmailJS). If you don’t receive it, check spam.
              </p>
            )}
          </form>
        )}
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

function ConfirmPendingPage() {
  const { ready, userId, userEmail, username, refreshEmailConfirmed, emailConfirmed } = useSession();
  const { addToast, toasts } = useToasts();
  const nav = useNavigate();
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      nav('/', { replace: true });
      return;
    }
    if (emailConfirmed === true) {
      if (!username) nav('/account/project', { replace: true });
      else nav(`/${encodeURIComponent(username)}/project`, { replace: true });
    }
  }, [ready, userId, emailConfirmed, username]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/50 p-8">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">Confirm Email</h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
          {userEmail ? (
            <div>
              <p className="text-white font-bold mb-1">Check your inbox</p>
              <p className="text-zinc-400">We sent a confirmation link to:</p>
              <p className="mt-2 font-mono text-zinc-300 break-all">{userEmail}</p>
            </div>
          ) : (
            <p>Missing email on session. Please sign in again.</p>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <button
            onClick={async () => {
              if (!userEmail) return;
              try {
                setIsSending(true);
                const guessedUsername = (username ?? userEmail.split('@')[0] ?? '').toString();
                const linkRes = await fetch(apiUrl('/api/v1/auth/send-confirmation'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: userEmail, username: guessedUsername }),
                });
                const linkData = (await linkRes.json()) as { ok?: boolean; error?: string; confirmLink?: string };
                if (!linkRes.ok || !linkData.ok || !linkData.confirmLink) {
                  addToast('error', linkData.error ?? 'Could not resend.');
                } else {
                  await sendConfirmationEmail({
                    to_email: userEmail,
                    confirmation_link: linkData.confirmLink,
                    username: guessedUsername,
                  });
                  addToast('success', 'Confirmation email resent.');
                }
              } catch {
                addToast('error', 'Could not resend.');
              } finally {
                setIsSending(false);
              }
            }}
            className="w-full py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-60"
            disabled={!userEmail || isSending}
          >
            {isSending ? 'Sending…' : 'Resend email'}
          </button>

          <button
            onClick={async () => {
              await refreshEmailConfirmed();
              addToast('info', 'Checked confirmation status.');
            }}
            className="w-full py-3 bg-white/5 text-white rounded-xl text-xs font-bold uppercase hover:bg-white/10 transition-all border border-white/10"
          >
            I already confirmed
          </button>
        </div>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

function ConfirmPage() {
  const { ready, userId, userEmail, refreshEmailConfirmed } = useSession();
  const { addToast, toasts } = useToasts();
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  const query = new URLSearchParams(window.location.search);
  const token = query.get('token') ?? '';

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Missing token.');
      return;
    }
    setState('loading');
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/auth/confirm?token=${encodeURIComponent(token)}`));
        const data = (await res.json()) as { ok?: boolean; error?: string; email?: string };
        if (!res.ok || !data.ok) {
          setState('error');
          setMessage(data.error ?? 'Invalid or expired link.');
          return;
        }
        setState('ok');
        setMessage(`Email confirmed for ${data.email ?? 'your account'}.`);
        addToast('success', 'Email confirmed.');
        await refreshEmailConfirmed();
        if (ready && userId && userEmail && data.email && userEmail.toLowerCase() === data.email.toLowerCase()) {
          localStorage.setItem(`hb_email_confirmed:${userId}`, 'true');
        }
      } catch {
        setState('error');
        setMessage('Could not verify link.');
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/50 p-8">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">Confirm Email</h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
          {state === 'loading' ? 'Confirming…' : message || 'Ready.'}
        </div>

        <div className="mt-6 flex gap-2">
          <Link
            to="/"
            className="flex-1 text-center py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all"
          >
            Go to login
          </Link>
        </div>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

function DashboardPage() {
  const params = useParams<{ username: string }>();
  const usernameFromRoute = params.username ?? 'account';
  const decodedUsername = useMemo(() => {
    try {
      return decodeURIComponent(usernameFromRoute);
    } catch {
      return usernameFromRoute;
    }
  }, [usernameFromRoute]);

  const { userId, userEmail, username, setUsername } = useSession();
  const { addToast, toasts } = useToasts();

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentTab, setCurrentTab] = useState<'overview' | 'alerts' | 'settings'>('overview');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', url: '', language: 'Go' });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [statusHistory, setStatusHistory] = useState<Record<string, number[]>>({});

  const [refreshRate, setRefreshRate] = useState(10000);
  const [notifications, setNotifications] = useState(true);
  const [credits, setCredits] = useState<number>(() => (userId ? loadCredits(userId) : 100));
  const [usernameDraft, setUsernameDraft] = useState(username ?? decodedUsername);

  const hasLoadedIncidentsRef = useRef(false);
  const knownIncidentIdsRef = useRef<Set<string>>(new Set());
  const fetchedHistoryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const next = loadCredits(userId);
    setCredits(next);
  }, [userId]);

  useEffect(() => {
    setUsernameDraft(username ?? decodedUsername);
  }, [username, decodedUsername]);

  const fetchIncidents = async () => {
    try {
      const res = await fetch(apiUrl('/api/v1/incidents?limit=50'));
      if (!res.ok) return;
      const data = (await res.json()) as { items?: Incident[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setIncidents(items);

      if (!notifications || items.length === 0) return;

      if (!hasLoadedIncidentsRef.current) {
        for (const i of items) knownIncidentIdsRef.current.add(i.id);
        hasLoadedIncidentsRef.current = true;
        return;
      }

      const fresh = items.filter((i) => !knownIncidentIdsRef.current.has(i.id));
      if (fresh.length === 0) return;
      for (const i of fresh) knownIncidentIdsRef.current.add(i.id);

      void (async () => {
        const ok = await ensureNotificationPermission();
        if (!ok) return;
        for (const i of fresh) new Notification(`Heartbeat: ${i.projectName}`, { body: i.message });
      })();
    } catch {
      // ignore
    }
  };

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(apiUrl('/api/v1/status'));
      if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
      const data = await res.json();
      const nextProjects: Project[] = Array.isArray(data) ? data : [];
      setBackendOffline(false);

      setStatusHistory((prev) => {
        const next = { ...prev };
        for (const p of nextProjects) {
          const existing = next[p.id] ?? [];
          next[p.id] = [...existing, p.latency ?? 0].slice(-24);
        }
        return next;
      });

      setProjects(nextProjects);
      void fetchIncidents();
      void (async () => {
        for (const p of nextProjects) {
          if (fetchedHistoryIdsRef.current.has(p.id)) continue;
          fetchedHistoryIdsRef.current.add(p.id);
          try {
            const hRes = await fetch(apiUrl(`/api/v1/history?project_id=${encodeURIComponent(p.id)}&limit=24`));
            if (!hRes.ok) continue;
            const hData = (await hRes.json()) as { items?: Array<{ latency?: number }> };
            const items = Array.isArray(hData.items) ? hData.items : [];
            setStatusHistory((prev) => ({
              ...prev,
              [p.id]: items.map((i) => i.latency ?? 0),
            }));
          } catch {
            // ignore
          }
        }
      })();
    } catch {
      setBackendOffline(true);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = window.setInterval(fetchStatus, refreshRate);
    return () => window.clearInterval(interval);
  }, [refreshRate]);

  useEffect(() => {
    if (currentTab === 'alerts') void fetchIncidents();
  }, [currentTab]);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !userId) {
      addToast('error', 'Supabase env is missing (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      return;
    }
    if (credits <= 0) {
      addToast('error', 'No credits left.');
      return;
    }
    const { error } = await supabase.from('projects').insert([newProject]);
    if (!error) {
      setIsAddModalOpen(false);
      const nextCredits = credits - 1;
      setCredits(nextCredits);
      saveCredits(userId, nextCredits);
      addToast('success', 'Service added (-1 credit).');
      fetchStatus();
    } else {
      addToast('error', error.message);
    }
  };

  const deleteProject = async (id: string) => {
    if (!supabase) {
      addToast('error', 'Supabase env is missing (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      return;
    }
    const ok = window.confirm('Delete this service?');
    if (!ok) return;
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      addToast('error', error.message);
      return;
    }
    addToast('info', 'Service deleted.');
    fetchStatus();
  };

  const saveUsernameAction = async () => {
    if (!userId) return;
    const next = usernameDraft.trim();
    if (!next) {
      addToast('error', 'Username cannot be empty.');
      return;
    }
    setUsername(next);
    if (supabase) {
      await supabase.auth.updateUser({ data: { username: next } });
    }
    addToast('success', 'Username saved.');
  };

  return (
    <div className="flex h-screen bg-[#020202] text-zinc-400 font-sans overflow-hidden">
      <aside className="w-64 border-r border-white/5 bg-zinc-950/50 flex flex-col z-20">
        <div className="p-6 flex items-center justify-between gap-3 text-white border-b border-white/5">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-500 w-5 h-5" />
            <h1 className="font-black tracking-tighter uppercase text-lg italic">
              Heartbeat<span className="text-blue-500 text-xs text-not-italic ml-1">PRO</span>
            </h1>
          </div>
          {userId && (
            <div className="text-[10px] font-mono text-zinc-600 bg-white/5 px-2 py-1 rounded-full border border-white/5">
              {credits} cr
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavBtn icon={<LayoutGrid size={16} />} label="overview" active={currentTab === 'overview'} onClick={() => setCurrentTab('overview')} />
          <NavBtn icon={<AlertCircle size={16} />} label="alerts" active={currentTab === 'alerts'} onClick={() => setCurrentTab('alerts')} />
          <NavBtn icon={<Settings size={16} />} label="settings" active={currentTab === 'settings'} onClick={() => setCurrentTab('settings')} />
        </nav>

        <div className="p-4 border-t border-white/5 space-y-3">
          {userEmail && <div className="text-[10px] font-mono text-zinc-600 truncate">{userEmail}</div>}
          <button onClick={() => setIsAddModalOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20">
            <Plus size={14} /> Add Service
          </button>
          {supabase && (
            <button
              onClick={async () => {
                const sb = supabase;
                if (!sb) return;
                await sb.auth.signOut();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 text-white rounded-xl text-xs font-bold uppercase hover:bg-white/10 transition-all border border-white/10"
            >
              Sign out
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#050505] p-10 relative">
        {(backendOffline || !supabase) && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-400">
            {backendOffline && (
              <div className="flex items-center gap-2">
                <AlertCircle className="text-rose-500" size={14} />
                <span>Backend offline. Start it at `backend` on port 8080 (or set `VITE_API_PROXY_TARGET`).</span>
              </div>
            )}
            {!supabase && (
              <div className="mt-2 flex items-center gap-2">
                <AlertCircle className="text-amber-500" size={14} />
                <span>Supabase env missing. Create `frontend/.env` with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</span>
              </div>
            )}
          </div>
        )}

        <header className="mb-10 flex justify-between items-center">
          <h2 className="text-3xl font-bold text-white tracking-tight capitalize">{currentTab}</h2>
          <div className="text-[10px] font-mono text-zinc-600 bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {decodedUsername} // {new Date().toLocaleTimeString()}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {currentTab === 'overview' && (
            <motion.div key="ov" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoading && projects.length === 0 && (
                <div className="col-span-full text-xs text-zinc-600">Loading status…</div>
              )}
              {!isLoading && projects.length === 0 && (
                <div className="col-span-full rounded-3xl border border-white/5 bg-zinc-900/20 p-10 text-center">
                  <p className="text-white font-bold mb-1">No services yet</p>
                  <p className="text-xs text-zinc-500">Add your first target from the sidebar.</p>
                </div>
              )}
              {projects.map((p) => (
                <ProCard key={p.id} project={p} history={statusHistory[p.id] ?? []} onDelete={() => deleteProject(p.id)} />
              ))}
            </motion.div>
          )}

          {currentTab === 'alerts' && (
            <motion.div key="al" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-3xl space-y-4">
              <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl">
                <div className="flex items-center gap-3 mb-6">
                  <AlertCircle className="text-rose-500" size={20} />
                  <h3 className="text-white font-bold uppercase text-xs tracking-widest">Incidents</h3>
                </div>
                {incidents.length === 0 ? (
                  <p className="text-xs text-zinc-500">No incidents yet. Changes in status will appear here.</p>
                ) : (
                  <div className="space-y-3">
                    {incidents.map((i) => (
                      <div key={i.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-black/30 p-4">
                        <div>
                          <p className="text-white text-sm font-bold">{i.projectName}</p>
                          <p className="text-xs text-zinc-500">{i.message}</p>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600">{new Date(i.ts).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentTab === 'settings' && (
            <motion.div key="st" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-2xl space-y-6">
              <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl space-y-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <Shield className="text-emerald-500" size={20} />
                  <h3 className="text-white font-bold uppercase text-xs tracking-widest">Profile</h3>
                </div>

                <div className="flex justify-between items-center gap-4">
                  <div>
                    <p className="text-white text-sm font-bold">Username</p>
                    <p className="text-xs text-zinc-500">Used for your dashboard route: /{`{username}`}/project</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      className="bg-black border border-white/10 p-2 rounded-lg outline-none text-white text-xs w-44"
                    />
                    <button
                      onClick={() => void saveUsernameAction()}
                      className="bg-blue-600 text-white text-xs font-bold px-3 rounded-lg hover:bg-blue-500 transition-all"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {userId && (
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white text-sm font-bold">Credits</p>
                      <p className="text-xs text-zinc-500">Stored in session/local storage for now.</p>
                    </div>
                    <div className="text-xs font-mono text-zinc-300">{credits} credits</div>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl space-y-8">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <Zap className="text-amber-500" size={20} />
                  <h3 className="text-white font-bold uppercase text-xs tracking-widest">Engine Config</h3>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm font-bold">Data Polling Frequency</p>
                    <p className="text-xs text-zinc-500">How often the backend pings targets.</p>
                  </div>
                  <select value={refreshRate} onChange={(e) => setRefreshRate(Number(e.target.value))} className="bg-zinc-800 text-white text-xs p-2 rounded-lg outline-none border border-white/10">
                    <option value={5000}>High (5s)</option>
                    <option value={10000}>Standard (10s)</option>
                    <option value={30000}>Eco (30s)</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm font-bold">System Notifications</p>
                    <p className="text-xs text-zinc-500">Enable desktop alerts for incidents.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={() => {
                      const next = !notifications;
                      setNotifications(next);
                      if (next) void ensureNotificationPermission();
                    }}
                    className="w-10 h-5 appearance-none bg-zinc-700 rounded-full checked:bg-blue-600 transition-all relative cursor-pointer before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <motion.form
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onSubmit={(e) => void handleAddProject(e)}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4 text-white">
                <h3 className="font-bold uppercase text-xs tracking-widest">Add New Target</h3>
                <X className="cursor-pointer" size={18} onClick={() => setIsAddModalOpen(false)} />
              </div>
              <input required placeholder="Service Name" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white" onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} />
              <input required placeholder="Target URL" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white" onChange={(e) => setNewProject({ ...newProject, url: e.target.value })} />
              <select value={newProject.language} onChange={(e) => setNewProject({ ...newProject, language: e.target.value })} className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white">
                <option value="Go">Go</option>
                <option value="Node">Node</option>
                <option value="Python">Python</option>
                <option value="Other">Other</option>
              </select>
              <button type="submit" className="w-full py-4 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest mt-4 hover:bg-zinc-200 transition-all">
                Submit (1 credit)
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <Toasts toasts={toasts} />
    </div>
  );
}

function SharedProjectPage() {
  const { encodedId } = useParams<{ encodedId: string }>();
  const decoded = encodedId ? decodeProjectId(encodedId) : null;
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decoded) {
      setError('Invalid link.');
      return;
    }
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/v1/status'));
        if (!res.ok) throw new Error('Backend unreachable');
        const data = await res.json();
        const projects: Project[] = Array.isArray(data) ? data : [];
        const found = projects.find((p) => p.id === decoded) ?? null;
        setProject(found);
        if (!found) {
          setError('Project not found (or backend hasn’t checked it yet).');
          return;
        }
        const hRes = await fetch(apiUrl(`/api/v1/history?project_id=${encodeURIComponent(found.id)}&limit=48`));
        if (!hRes.ok) return;
        const hData = (await hRes.json()) as { items?: Array<{ latency?: number }> };
        const items = Array.isArray(hData.items) ? hData.items : [];
        setHistory(items.map((i) => i.latency ?? 0));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      }
    })();
  }, [encodedId]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 p-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">Heartbeat</h1>
        </div>

        {error && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-rose-500" size={14} />
              <span>{error}</span>
            </div>
          </div>
        )}

        {project && (
          <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-white font-bold text-2xl">{project.name}</h2>
                <p className="text-xs text-zinc-500 font-mono break-all">{project.url}</p>
              </div>
              <div className="text-[10px] font-bold text-zinc-600 uppercase bg-black/40 px-2 py-1 rounded border border-white/5">
                {project.status}
              </div>
            </div>

            <div className="mt-6 h-20 opacity-50">
              <LineChart width={700} height={80} data={(history.length ? history : [project.latency]).map((v) => ({ val: v }))}>
                <Line type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppIndex />} />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/confirm-pending" element={<ConfirmPendingPage />} />
      <Route
        path="/:username/project/*"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route path="/:encodedId" element={<SharedProjectPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function NavBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ProCard({
  project,
  history,
  onDelete,
}: {
  project: Project;
  history: number[];
  onDelete: () => void;
}) {
  const chartData = history.map((val) => ({ val }));
  const sharePath = `/${encodeProjectId(project.id)}`;

  return (
    <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl group relative hover:bg-zinc-900/60 transition-all">
      <button onClick={onDelete} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-500 transition-all z-10">
        <Trash2 size={16} />
      </button>

      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0">
          <h3 className="text-white font-bold">{project.name}</h3>
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-[180px]">{project.url}</p>
        </div>
        <div
          className={`h-2.5 w-2.5 rounded-full animate-pulse ${
            project.status === 'HEALTHY'
              ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]'
              : project.status === 'DEGRADED'
                ? 'bg-amber-500 shadow-[0_0_12px_#f59e0b]'
                : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'
          }`}
        />
      </div>

      <div className="h-16 w-full mb-4 opacity-40 overflow-hidden pointer-events-none">
        <LineChart width={300} height={64} data={chartData.length > 0 ? chartData : [{ val: project.latency ?? 0 }]}>
          <Line type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="text-3xl font-mono font-black text-white tracking-tighter">
          {project.latency}
          <span className="text-xs text-zinc-600 ml-1 italic">ms</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-[9px] font-bold text-zinc-600 uppercase bg-black/40 px-2 py-1 rounded border border-white/5">{project.status}</div>
          <Link
            to={sharePath}
            className="text-[10px] text-zinc-500 hover:text-white flex items-center gap-1 border border-white/5 bg-white/5 px-2 py-1 rounded"
            title="Share link"
          >
            <Link2 size={12} /> Share
          </Link>
        </div>
      </div>
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[200] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-2xl border px-4 py-3 text-xs shadow-2xl ${
            t.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
              : t.kind === 'error'
                ? 'border-rose-500/30 bg-rose-950/30 text-rose-200'
                : 'border-white/10 bg-zinc-950/40 text-zinc-200'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function BlockingScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/50 p-8">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">{title}</h1>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">{message}</div>
      </div>
    </div>
  );
}

function ConfirmCheckScreen() {
  const { userEmail, refreshEmailConfirmed } = useSession();
  const [isChecking, setIsChecking] = useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/50 p-8">
        <div className="flex items-center gap-3 text-white mb-6">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">Checking confirmation…</h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-400">
          <p className="text-white font-bold mb-1">Waiting for backend</p>
          <p className="text-zinc-400">
            We couldn’t verify confirmation status yet. Make sure the backend is running on port 8080.
          </p>
          {userEmail && <p className="mt-2 font-mono text-zinc-300 break-all">{userEmail}</p>}
        </div>

        <div className="mt-6">
          <button
            onClick={async () => {
              try {
                setIsChecking(true);
                await refreshEmailConfirmed();
              } finally {
                setIsChecking(false);
              }
            }}
            className="w-full py-3 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all disabled:opacity-60"
            disabled={isChecking}
          >
            {isChecking ? 'Checking…' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}
