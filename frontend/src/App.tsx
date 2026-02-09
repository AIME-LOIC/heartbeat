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
  const [logs, setLogs] = useState<string[]>([]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/v1/status');
      const data = await res.json();
      setProjects(data);
      addLog(`Synchronized ${data.length} services successfully.`);
    } catch (e) {
      addLog(`CRITICAL: Connection to API failed. Retrying...`);
    }
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 15));
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden text-zinc-300">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/5 flex flex-col bg-zinc-950/50">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
            <h1 className="font-bold text-white tracking-tight uppercase text-sm">Pulse Engine</h1>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2 text-xs font-semibold uppercase tracking-wider">
          <div className="p-3 bg-white/5 text-blue-400 rounded-lg cursor-pointer">Overview</div>
          <div className="p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">Alerts</div>
          <div className="p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">Settings</div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-[#030303]">
        {/* Header Stats */}
        <header className="p-8 flex justify-between items-center border-b border-white/5 bg-zinc-950/20">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">System Health</h2>
            <p className="text-xs text-zinc-500 font-mono">Running Node: KALI_REMOTE_01</p>
          </div>
          <div className="flex gap-10">
            <Stat label="Total Services" value={projects.length} />
            <Stat label="Operational" value={projects.filter(p => p.status === 'HEALTHY').length} color="text-emerald-500" />
            <Stat label="Down" value={projects.filter(p => p.status === 'DOWN').length} color="text-rose-500" />
          </div>
        </header>

        {/* Dashboard Grid */}
        <section className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </AnimatePresence>
          </div>
        </section>

        {/* Bottom Activity Console */}
        <footer className="h-48 border-t border-white/5 bg-zinc-950/80 p-6 font-mono text-[10px]">
          <h3 className="text-zinc-500 mb-3 uppercase tracking-widest font-bold">Live System Activity</h3>
          <div className="space-y-1 overflow-y-auto h-28 opacity-70">
            {logs.map((log, i) => (
              <p key={i} className={log.includes('CRITICAL') ? 'text-rose-400' : 'text-zinc-400'}>{log}</p>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}

const Stat = ({ label, value, color = "text-white" }: any) => (
  <div className="text-right">
    <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">{label}</p>
    <p className={`text-xl font-mono font-bold ${color}`}>{value}</p>
  </div>
);

const ProjectCard = ({ project }: { project: Project }) => {
  const isHealthy = project.status === 'HEALTHY';
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 rounded-xl hover:bg-zinc-800/50 transition-all group relative overflow-hidden"
    >
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-white font-bold tracking-tight">{project.name}</h3>
          <p className="text-[10px] text-zinc-500 uppercase">{project.language}</p>
        </div>
        <div className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'} animate-pulse`} />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] text-zinc-600 font-bold uppercase mb-1">Latency</p>
          <p className={`text-lg font-mono font-bold ${project.latency > 500 ? 'text-amber-500' : 'text-white'}`}>
            {project.latency}ms
          </p>
        </div>
        <div className="h-8 w-24 bg-white/5 rounded flex items-end gap-[2px] p-1">
          {/* Simulated Mini Chart */}
          {[4, 7, 5, 8, 6, 9, 4].map((h, i) => (
            <div key={i} className="flex-1 bg-blue-500/20 rounded-t" style={{ height: `${h * 10}%` }} />
          ))}
        </div>
      </div>
    </motion.div>
  );
};