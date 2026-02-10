import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { Activity, Plus, Trash2, Settings, LayoutGrid, AlertCircle, X, Zap, Shield } from 'lucide-react';
import { LineChart, Line } from 'recharts';
import { apiUrl, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

interface Project {
  id: string;
  name: string;
  url: string;
  language: string;
  status: 'HEALTHY' | 'DOWN';
  latency: number;
}

type Incident = {
  id: string;
  ts: number;
  projectName: string;
  status: 'HEALTHY' | 'DOWN';
  message: string;
};

type Toast = {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentTab, setCurrentTab] = useState<'overview' | 'alerts' | 'settings'>('overview');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', url: '', language: 'Go' });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [statusHistory, setStatusHistory] = useState<Record<string, number[]>>({});
  
  // SETTINGS STATE
  const [refreshRate, setRefreshRate] = useState(10000);
  const [notifications, setNotifications] = useState(true);

  const addToast = (kind: Toast['kind'], message: string) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, kind, message }].slice(-5));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const ensureNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const p = await Notification.requestPermission();
    return p === 'granted';
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

      setIncidents((prev) => {
        const prevById = new Map(projects.map((p) => [p.id, p]));
        const additions: Incident[] = [];
        for (const p of nextProjects) {
          const before = prevById.get(p.id);
          if (before && before.status !== p.status) {
            additions.push({
              id: `${Date.now()}_${p.id}_${p.status}`,
              ts: Date.now(),
              projectName: p.name,
              status: p.status,
              message: p.status === 'DOWN' ? 'Service went DOWN' : 'Service recovered',
            });
          }
        }
        const merged = [...additions, ...prev].slice(0, 100);
        if (notifications && additions.length > 0) {
          void (async () => {
            const ok = await ensureNotificationPermission();
            if (!ok) return;
            for (const i of additions) {
              new Notification(`Heartbeat: ${i.projectName}`, { body: i.message });
            }
          })();
        }
        return merged;
      });

      setProjects(nextProjects);
    } catch (e) {
      setBackendOffline(true);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, refreshRate);
    return () => clearInterval(interval);
  }, [refreshRate]);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      addToast('error', 'Supabase env is missing (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      return;
    }
    const { error } = await supabase.from('projects').insert([newProject]);
    if (!error) {
      setIsAddModalOpen(false);
      addToast('success', 'Service added.');
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

  return (
    <div className="flex h-screen bg-[#020202] text-zinc-400 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-zinc-950/50 flex flex-col z-20">
        <div className="p-6 flex items-center gap-3 text-white border-b border-white/5">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-black tracking-tighter uppercase text-lg italic">Heartbeat<span className="text-blue-500 text-xs text-not-italic ml-1">PRO</span></h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavBtn icon={<LayoutGrid size={16}/>} label="overview" active={currentTab === 'overview'} onClick={() => setCurrentTab('overview')} />
          <NavBtn icon={<AlertCircle size={16}/>} label="alerts" active={currentTab === 'alerts'} onClick={() => setCurrentTab('alerts')} />
          <NavBtn icon={<Settings size={16}/>} label="settings" active={currentTab === 'settings'} onClick={() => setCurrentTab('settings')} />
        </nav>

        <div className="p-4 border-t border-white/5">
          <button onClick={() => setIsAddModalOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20">
            <Plus size={14}/> Add Service
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto bg-[#050505] p-10 relative">
        {(backendOffline || !supabase) && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-400">
            {backendOffline && (
              <div className="flex items-center gap-2">
                <AlertCircle className="text-rose-500" size={14} />
                <span>Backend offline. Start it at `backend` on port 8080.</span>
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
            NODE_ACTIVE // {new Date().toLocaleTimeString()}
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
                <ProCard
                  key={p.id}
                  project={p}
                  history={statusHistory[p.id] ?? []}
                  onDelete={() => deleteProject(p.id)}
                />
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
                  <p className="text-xs text-zinc-500">No incidents yet. Changes in UP/DOWN status will appear here.</p>
                ) : (
                  <div className="space-y-3">
                    {incidents.map((i) => (
                      <div key={i.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/5 bg-black/30 p-4">
                        <div>
                          <p className="text-white text-sm font-bold">{i.projectName}</p>
                          <p className="text-xs text-zinc-500">{i.message}</p>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600">
                          {new Date(i.ts).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {currentTab === 'settings' && (
            <motion.div key="st" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-2xl space-y-6">
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
                  <select 
                    value={refreshRate} 
                    onChange={(e) => setRefreshRate(Number(e.target.value))}
                    className="bg-zinc-800 text-white text-xs p-2 rounded-lg outline-none border border-white/10"
                  >
                    <option value={5000}>High (5s)</option>
                    <option value={10000}>Standard (10s)</option>
                    <option value={30000}>Eco (30s)</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white text-sm font-bold">System Notifications</p>
                    <p className="text-xs text-zinc-500">Enable desktop alerts for downtime.</p>
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

              <div className="bg-zinc-900/40 border border-white/5 p-8 rounded-3xl">
                <div className="flex items-center gap-3 mb-6">
                  <Shield className="text-emerald-500" size={20} />
                  <h3 className="text-white font-bold uppercase text-xs tracking-widest">Security</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-2 font-mono uppercase tracking-tighter">Connection: ENCRYPTED_SSL_TLS_V1.3</p>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 w-full opacity-50" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <motion.form 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onSubmit={handleAddProject} 
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4 text-white">
                <h3 className="font-bold uppercase text-xs tracking-widest">Add New Target</h3>
                <X className="cursor-pointer" size={18} onClick={() => setIsAddModalOpen(false)} />
              </div>
              <input required placeholder="Service Name" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white" onChange={e => setNewProject({...newProject, name: e.target.value})} />
              <input required placeholder="Target URL" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white" onChange={e => setNewProject({...newProject, url: e.target.value})} />
              <select
                value={newProject.language}
                onChange={(e) => setNewProject({ ...newProject, language: e.target.value })}
                className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm outline-none focus:border-blue-500 text-white"
              >
                <option value="Go">Go</option>
                <option value="Node">Node</option>
                <option value="Python">Python</option>
                <option value="Other">Other</option>
              </select>
              <button type="submit" className="w-full py-4 bg-white text-black rounded-xl text-xs font-bold uppercase tracking-widest mt-4 hover:bg-zinc-200 transition-all">Submit to Cloud</button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* TOASTS */}
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
    </div>
  );
}

// --- SUB COMPONENTS ---

const NavBtn = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const ProCard = ({
  project,
  history,
  onDelete,
}: {
  project: Project;
  history: number[];
  onDelete: () => void;
}) => {
  const chartData = history.map((val) => ({ val }));

  return (
    <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-3xl group relative hover:bg-zinc-900/60 transition-all">
      <button onClick={onDelete} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-500 transition-all z-10">
        <Trash2 size={16} />
      </button>
      
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-white font-bold">{project.name}</h3>
          <p className="text-[10px] text-zinc-600 font-mono truncate max-w-[140px]">{project.url}</p>
        </div>
        <div className={`h-2.5 w-2.5 rounded-full ${project.status === 'HEALTHY' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-rose-500 shadow-[0_0_12px_#f43f5e]'} animate-pulse`} />
      </div>

      {/* FIXED CHART: No ResponsiveContainer to avoid Context Crash */}
      <div className="h-16 w-full mb-4 opacity-40 overflow-hidden pointer-events-none">
        <LineChart width={300} height={64} data={chartData.length > 0 ? chartData : [{ val: project.latency ?? 0 }]}>
          <Line 
            type="monotone" 
            dataKey="val" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            dot={false} 
            isAnimationActive={false} // Faster rendering
          />
        </LineChart>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-3xl font-mono font-black text-white tracking-tighter">
          {project.latency}<span className="text-xs text-zinc-600 ml-1 italic">ms</span>
        </div>
        <div className="text-[9px] font-bold text-zinc-600 uppercase bg-black/40 px-2 py-1 rounded border border-white/5">
          Live_Sync
        </div>
      </div>
    </div>
  );
};
