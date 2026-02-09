import React, { useState, useEffect } from 'react';

// --- Types & Interfaces ---
// Defining these early ensures type safety across your polyglot stack.
interface Project {
  id: string;
  name: string;
  language: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latency: number;
  uptime: number;
  lastChecked: string;
  version: string;
}

// --- Mock Data: The 10 Hosted Projects ---
// This represents the 10 languages you plan to monitor.
const INITIAL_PROJECTS: Project[] = [
  { id: '1', name: 'Auth-Engine', language: 'Go', status: 'HEALTHY', latency: 42, uptime: 99.99, lastChecked: 'Just now', version: 'v1.0.2' },
  { id: '2', name: 'Neural-Parser', language: 'Python', status: 'HEALTHY', latency: 156, uptime: 98.50, lastChecked: '2m ago', version: 'v2.4.0' },
  { id: '3', name: 'Legacy-Portal', language: 'Java', status: 'DEGRADED', latency: 1240, uptime: 92.10, lastChecked: '1m ago', version: 'v0.8.9' },
  { id: '4', name: 'Realtime-Chat', language: 'Node.js', status: 'DOWN', latency: 0, uptime: 74.20, lastChecked: '5m ago', version: 'v1.1.0' },
  { id: '5', name: 'Crypto-Vault', language: 'Rust', status: 'HEALTHY', latency: 18, uptime: 100.00, lastChecked: 'Just now', version: 'v3.0.1' },
  { id: '6', name: 'Query-Optimizer', language: 'C++', status: 'HEALTHY', latency: 8, uptime: 99.95, lastChecked: '30s ago', version: 'v1.4.2' },
  { id: '7', name: 'Data-Pipeline', language: 'Scala', status: 'HEALTHY', latency: 210, uptime: 99.00, lastChecked: '4m ago', version: 'v2.1.0' },
  { id: '8', name: 'Worker-Node', language: 'Ruby', status: 'HEALTHY', latency: 85, uptime: 97.80, lastChecked: '1m ago', version: 'v1.0.0' },
  { id: '9', name: 'Storage-API', language: 'C#', status: 'DEGRADED', latency: 980, uptime: 94.50, lastChecked: 'Just now', version: 'v2.0.5' },
  { id: '10', name: 'Frontend-BFF', language: 'TypeScript', status: 'HEALTHY', latency: 64, uptime: 99.90, lastChecked: '2m ago', version: 'v4.2.1' },
];

// --- Sub-Component: ProjectCard ---
const ProjectCard: React.FC<{ project: Project }> = ({ project }) => {
  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'HEALTHY': return { color: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/20' };
      case 'DEGRADED': return { color: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/20' };
      case 'DOWN': return { color: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/20' };
      default: return { color: 'bg-zinc-500', text: 'text-zinc-500', border: 'border-zinc-500/20' };
    }
  };

  const styles = getStatusStyles(project.status);

  return (
    <div className={`bg-zinc-950 border ${styles.border} rounded-lg p-5 transition-all hover:scale-[1.02] shadow-xl`}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-white font-bold text-lg tracking-tight">{project.name}</h3>
          <p className="text-zinc-500 text-xs font-mono uppercase mt-1">Runtime: {project.language}</p>
        </div>
        <div className="flex flex-col items-end">
          <div className={`h-2.5 w-2.5 rounded-full ${styles.color} shadow-[0_0_10px_rgba(0,0,0,0.5)] ${project.status !== 'DOWN' && 'animate-pulse'}`} />
          <span className={`text-[10px] mt-2 font-bold ${styles.text}`}>{project.status}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Latency Section */}
        <div>
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-zinc-500 uppercase tracking-tighter">Response Time</span>
            <span className="text-zinc-200 font-mono">{project.latency}ms</span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${project.latency > 1000 ? 'bg-rose-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.min(100, (project.latency / 2000) * 100)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-900">
          <div>
            <p className="text-[10px] text-zinc-600 uppercase font-bold">Uptime</p>
            <p className="text-sm text-zinc-300 font-mono">{project.uptime}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-zinc-600 uppercase font-bold">Version</p>
            <p className="text-sm text-zinc-300 font-mono">{project.version}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-900 flex justify-between items-center">
        <span className="text-[9px] text-zinc-700 font-mono">ID: {project.id}</span>
        <button className="text-[10px] text-zinc-500 hover:text-white transition-colors uppercase font-bold tracking-widest">
          View Logs
        </button>
      </div>
    </div>
  );
};

// --- Main Application Component ---
export default function App() {
  const [projects] = useState<Project[]>(INITIAL_PROJECTS);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-black text-zinc-400 selection:bg-sky-500/30">
      {/* Top Navigation / Header */}
      <nav className="border-b border-zinc-900 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 bg-white rounded flex items-center justify-center">
              <div className="h-4 w-4 bg-black rotate-45" />
            </div>
            <h1 className="text-white font-black text-xl tracking-tighter uppercase italic">
              Pulse <span className="text-sky-500">v1.0</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-8 font-mono text-[11px] tracking-widest text-zinc-500">
            <div className="hidden sm:block">
              NETWORK_STATUS: <span className="text-emerald-500">OPTIMAL</span>
            </div>
            <div>
              SYSTEM_TIME: <span className="text-white">{currentTime}</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white cursor-pointer hover:bg-zinc-800">
              A
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-[1600px] mx-auto px-6 py-10">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-white mb-2">Service Overview</h2>
          <p className="text-zinc-500 max-w-2xl">
            Real-time monitoring across 10 distributed microservices. Data aggregated from 
            multi-region clusters via Go-backend orchestration and Python-logic triggers.
          </p>
        </header>

        {/* Grid System for Project Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>

        {/* Console / Activity Feed (Visual Placeholder) */}
        <section className="mt-12 bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden">
          <div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Global Activity Stream</span>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-zinc-700" />
              <div className="w-2 h-2 rounded-full bg-zinc-700" />
              <div className="w-2 h-2 rounded-full bg-zinc-700" />
            </div>
          </div>
          <div className="p-4 font-mono text-[11px] space-y-2 h-48 overflow-y-auto">
            <p className="text-emerald-500">[SUCCESS] - Health check passed for Auth-Engine (Go)</p>
            <p className="text-zinc-600">[INFO] - Retrying connection to Legacy-Portal...</p>
            <p className="text-rose-500">[ERROR] - Socket timeout on Realtime-Chat (Node.js)</p>
            <p className="text-sky-500">[DEPLOY] - New version v3.0.1 pushed to Crypto-Vault (Rust)</p>
            <p className="text-zinc-500">[LOG] - Memory usage at 14% on Neural-Parser (Python)</p>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <footer className="border-t border-zinc-900 mt-20 py-10">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-xs text-zinc-600">
            &copy; 2026 Pulse Infrastructure Group. All rights reserved.
          </div>
          <div className="flex gap-8 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">API Status</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}