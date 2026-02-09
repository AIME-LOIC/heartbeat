import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { Activity, Plus, Trash2, Settings, LayoutGrid, AlertCircle, X } from 'lucide-react';

// Replace with your actual credentials from Supabase Settings -> API
const supabase = createClient('https://qhpfdabvjcgnlvobullq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFocGZkYWJ2amNnbmx2b2J1bGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDEwMjcsImV4cCI6MjA4NjIxNzAyN30.gsOHmu03U0ZM-3uigkcYBgBzYRYR3O-6q-NYJOIai2s');

interface Project {
  id: string;
  name: string;
  url: string;
  language: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latency: number;
  lastChecked: string;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentTab, setCurrentTab] = useState<'overview' | 'alerts' | 'settings'>('overview');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', url: '', language: 'Go' });
  const [loading, setLoading] = useState(true);

  // FETCH: Calls your Go Backend which pings the URLs stored in Supabase
  const fetchStatus = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/v1/status');
      if (!res.ok) throw new Error("Backend Offline");
      const data = await res.json();
      setProjects(data || []);
    } catch (e) {
      console.error("Connection to Go Backend failed. Check if main.go is running.");
    } finally {
      setLoading(false);
    }
  };

  // ADD: Saves directly to Supabase cloud
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase
      .from('projects')
      .insert([{ 
        name: newProject.name, 
        url: newProject.url, 
        language: newProject.language,
        status: 'HEALTHY' 
      }]);

    if (!error) {
      setIsAddModalOpen(false);
      fetchStatus();
    } else {
      alert(error.message);
    }
  };

  // DELETE: Removes from Supabase
  const deleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) fetchStatus();
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#030303] text-zinc-300 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-zinc-950/50 flex flex-col z-20">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <Activity className="text-blue-500 w-5 h-5" />
          <h1 className="font-bold text-white text-sm tracking-tighter uppercase italic">Heartbeat <span className="text-blue-500">Pro</span></h1>
        </div>
        <nav className="p-4 space-y-2">
          {['overview', 'alerts', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setCurrentTab(tab as any)}
              className={`w-full text-left p-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                currentTab === tab ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/5' : 'hover:bg-white/5 text-zinc-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4 border-t border-white/5">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="w-full p-3 bg-white text-black rounded-xl text-xs font-bold uppercase hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Add Service
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
        <header className="h-16 border-b border-white/5 bg-zinc-950/20 flex items-center px-8 justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">{currentTab}</h2>
          <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            DB_LINK: SUPABASE_CLOUD_CONNECTED
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
             <div className="h-full flex items-center justify-center text-xs font-mono animate-pulse">BOOTING_SYSTEM...</div>
          ) : (
            <AnimatePresence mode="wait">
              {currentTab === 'overview' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map(p => (
                    <ProjectCard key={p.id} project={p} onOpenLogs={() => setSelectedProject(p)} onDelete={() => deleteProject(p.id)} />
                  ))}
                </motion.div>
              )}

              {currentTab === 'alerts' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <h3 className="text-zinc-500 uppercase text-xs font-bold italic">Incident History</h3>
                  {projects.filter(p => p.status !== 'HEALTHY').map(p => (
                    <div key={p.id} className="p-4 border border-rose-500/20 bg-rose-500/5 rounded-lg text-rose-500 text-xs font-mono">
                      [CRITICAL] {p.name} reported status: {p.status} at {p.lastChecked}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* MODALS (ADD & LOG) */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <motion.form 
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                onSubmit={handleAddProject} 
                className="bg-zinc-900 border border-white/10 p-8 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-white font-bold uppercase text-xs tracking-widest">Register Service</h3>
                <X className="text-zinc-500 cursor-pointer" size={18} onClick={() => setIsAddModalOpen(false)} />
              </div>
              <input required placeholder="Name" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm text-white" onChange={e => setNewProject({...newProject, name: e.target.value})} />
              <input required placeholder="URL" className="w-full bg-black border border-white/10 p-4 rounded-xl text-sm text-white" onChange={e => setNewProject({...newProject, url: e.target.value})} />
              <button type="submit" className="w-full p-4 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-500 transition-all">Deploy to Cloud</button>
            </motion.form>
          </div>
        )}
        {selectedProject && <LogModal project={selectedProject} onClose={() => setSelectedProject(null)} />}
      </AnimatePresence>
    </div>
  );
}

const ProjectCard = ({ project, onOpenLogs, onDelete }: any) => (
  <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-2xl relative group hover:bg-zinc-900/60 transition-all">
    <button onClick={onDelete} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-500 transition-all">
        <Trash2 size={16} />
    </button>
    <div className="flex justify-between items-start mb-8">
      <div>
        <h4 className="text-white font-bold tracking-tight uppercase text-sm">{project.name}</h4>
        <p className="text-[10px] text-zinc-600 font-mono mt-1 truncate max-w-[150px]">{project.url}</p>
      </div>
      <div className={`h-2.5 w-2.5 rounded-full ${project.status === 'HEALTHY' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]'} animate-pulse`} />
    </div>
    <div className="flex items-end justify-between">
      <div className="text-3xl font-mono font-black text-white">{project.latency}ms</div>
      <button onClick={onOpenLogs} className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-white underline decoration-blue-500/30">Inspect Logs</button>
    </div>
  </div>
);

const LogModal = ({ project, onClose }: any) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-zinc-950 border border-white/10 w-full max-w-2xl h-[500px] rounded-3xl flex flex-col overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Console Output: {project.name}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
      </div>
      <div className="flex-1 p-6 font-mono text-[11px] space-y-2 overflow-y-auto bg-black/40">
        <p className="text-emerald-500 opacity-50">[{new Date().toISOString()}] INITIALIZING_SYNC...</p>
        <p className="text-zinc-500">[{new Date().toISOString()}] FETCHING_FROM_SUPABASE_REST_V1</p>
        <p className={project.status === 'DOWN' ? 'text-rose-500' : 'text-emerald-500'}>
          [{new Date().toISOString()}] HEARTBEAT_SUCCESS: {project.status} // {project.latency}ms
        </p>
        <p className="animate-pulse text-blue-500 mt-4">_</p>
      </div>
    </motion.div>
  </div>
);