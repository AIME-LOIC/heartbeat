import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  const fetchStatus = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/v1/status');
      const data = await res.json();
      setProjects(data);
    } catch (e) { console.error("Sync Error"); }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    // For now, we optimisticly add to UI. Next step: Link to Go POST endpoint.
    const projectToAdd: Project = {
      ...newProject,
      id: Math.random().toString(36).substr(2, 9),
      status: 'HEALTHY',
      latency: 0,
      lastChecked: 'Just Now'
    };
    setProjects([...projects, projectToAdd]);
    setIsAddModalOpen(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[#030303] text-zinc-300 font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/5 bg-zinc-950/50 flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
          <h1 className="font-bold text-white text-sm tracking-tighter uppercase">Heartbeat Pro</h1>
        </div>
        <nav className="p-4 space-y-2">
          {['overview', 'alerts', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setCurrentTab(tab as any)}
              className={`w-full text-left p-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                currentTab === tab ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'hover:bg-white/5 text-zinc-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="w-full p-3 bg-white text-black rounded-lg text-xs font-bold uppercase hover:bg-zinc-200 transition-colors"
          >
            + Add Project
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-white/5 bg-zinc-950/20 flex items-center px-8 justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white">{currentTab}</h2>
          <div className="text-[10px] font-mono text-zinc-500">SYSTEM_STATUS: <span className="text-emerald-500">ENCRYPTED_LINK_ACTIVE</span></div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {currentTab === 'overview' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(p => (
                  <ProjectCard key={p.id} project={p} onOpenLogs={() => setSelectedProject(p)} />
                ))}
              </motion.div>
            )}

            {currentTab === 'alerts' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <h3 className="text-zinc-500 uppercase text-xs font-bold italic">Incident History</h3>
                {projects.filter(p => p.status !== 'HEALTHY').map(p => (
                  <div className="p-4 border border-rose-500/20 bg-rose-500/5 rounded-lg text-rose-500 text-xs font-mono">
                    [CRITICAL] {p.name} reported status: {p.status} at {p.lastChecked}
                  </div>
                ))}
              </motion.div>
            )}

            {currentTab === 'settings' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md space-y-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-2">Polling Interval (ms)</label>
                  <input type="number" defaultValue={10000} className="w-full bg-zinc-900 border border-white/10 p-3 rounded text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-2">API Endpoint</label>
                  <input type="text" defaultValue="http://localhost:8080/api/v1" className="w-full bg-zinc-900 border border-white/10 p-3 rounded text-sm focus:border-blue-500 outline-none" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ADD PROJECT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form onSubmit={handleAddProject} className="bg-zinc-950 border border-white/10 p-8 rounded-2xl w-full max-w-sm space-y-4">
            <h3 className="text-white font-bold uppercase text-xs tracking-[0.2em] mb-4">Register New Service</h3>
            <input required placeholder="Service Name" className="w-full bg-zinc-900 border border-white/5 p-3 rounded text-sm" onChange={e => setNewProject({...newProject, name: e.target.value})} />
            <input required placeholder="Service URL" className="w-full bg-zinc-900 border border-white/5 p-3 rounded text-sm" onChange={e => setNewProject({...newProject, url: e.target.value})} />
            <select className="w-full bg-zinc-900 border border-white/5 p-3 rounded text-sm" onChange={e => setNewProject({...newProject, language: e.target.value})}>
              <option>Go</option><option>Python</option><option>Rust</option><option>Node.js</option>
            </select>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 p-3 text-xs font-bold uppercase border border-white/10 rounded-lg">Cancel</button>
              <button type="submit" className="flex-1 p-3 text-xs font-bold uppercase bg-blue-600 text-white rounded-lg">Deploy</button>
            </div>
          </form>
        </div>
      )}

      {/* LOG MODAL */}
      <AnimatePresence>
        {selectedProject && (
          <LogModal project={selectedProject} onClose={() => setSelectedProject(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

const ProjectCard = ({ project, onOpenLogs }: { project: Project; onOpenLogs: () => void }) => (
  <div className="glass-card p-6 rounded-xl relative group overflow-hidden transition-all hover:bg-zinc-900/60">
    <div className="flex justify-between items-start mb-8">
      <div>
        <h4 className="text-white font-bold tracking-tight">{project.name}</h4>
        <p className="text-[10px] text-zinc-500 font-mono mt-1">{project.url}</p>
      </div>
      <div className={`h-2 w-2 rounded-full ${project.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
    </div>
    <div className="flex items-end justify-between">
      <div className="text-2xl font-mono font-black text-white">{project.latency}ms</div>
      <button onClick={onOpenLogs} className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-white transition-colors">Inspect Logs</button>
    </div>
  </div>
);

const LogModal = ({ project, onClose }: { project: Project; onClose: () => void }) => (
  <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-md">
    <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-zinc-950 border border-white/10 w-full max-w-2xl h-[500px] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Instance Logs: {project.name}</span>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
      </div>
      <div className="flex-1 p-6 font-mono text-[11px] space-y-2 overflow-y-auto bg-black/40">
        <p className="text-emerald-500">[{new Date().toLocaleTimeString()}] INF - Handshake initiated with {project.url}</p>
        <p className="text-zinc-500">[{new Date().toLocaleTimeString()}] DBG - TCP connection established via TLS 1.3</p>
        <p className="text-zinc-500">[{new Date().toLocaleTimeString()}] DBG - Packet received: 456 bytes</p>
        <p className={project.status === 'DOWN' ? 'text-rose-500' : 'text-emerald-500'}>
          [{new Date().toLocaleTimeString()}] RES - Status: {project.status} ({project.latency}ms)
        </p>
        <p className="animate-pulse text-blue-500 mt-4">_</p>
      </div>
    </motion.div>
  </div>
);