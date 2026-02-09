import React, { useState, useEffect } from 'react';

// --- Types & Interfaces ---
interface Project {
  id: string;
  name: string;
  url: string;
  language: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latency: number;
  uptime: number;
  lastChecked: string;
}

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
          <p className="text-zinc-500 text-[10px] font-mono uppercase mt-1 truncate max-w-[150px]">{project.url}</p>
        </div>
        <div className="flex flex-col items-end">
          <div className={`h-2.5 w-2.5 rounded-full ${styles.color} ${project.status !== 'DOWN' && 'animate-pulse'}`} />
          <span className={`text-[10px] mt-2 font-bold ${styles.text}`}>{project.status}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-zinc-500 uppercase tracking-tighter">Response Time</span>
            <span className="text-zinc-200 font-mono">{project.latency}ms</span>
          </div>
          <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-700 ${project.latency > 500 ? 'bg-amber-500' : 'bg-sky-500'}`}
              style={{ width: `${Math.min(100, (project.latency / 1000) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-zinc-900 text-[10px]">
            <span className="text-zinc-600 font-bold uppercase tracking-widest">Runtime: {project.language}</span>
            <span className="text-zinc-500 font-mono italic">Checked: {project.lastChecked}</span>
        </div>
      </div>
    </div>
  );
};

// --- Main Application Component ---
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Function to fetch real pings from Go Backend
  const fetchHeartbeats = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/v1/status');
      if (!response.ok) throw new Error('API_CONNECTION_FAILED');
      const data = await response.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError("COULD NOT CONNECT TO GO BACKEND. ENSURE SERVER IS RUNNING ON :8080");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeartbeats();
    const statusTimer = setInterval(fetchHeartbeats, 30000); // Ping every 30s
    const clockTimer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    
    return () => {
      clearInterval(statusTimer);
      clearInterval(clockTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-zinc-400 font-sans selection:bg-sky-500/30">
      {/* Header */}
      <nav className="border-b border-zinc-900 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 bg-sky-500 rounded-sm flex items-center justify-center animate-pulse">
                <div className="h-2 w-2 bg-black rounded-full" />
            </div>
            <h1 className="text-white font-black text-xl tracking-tighter uppercase italic">
              PULSE<span className="text-sky-500">_OPS</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-8 font-mono text-[11px] tracking-widest text-zinc-500">
            <div className="hidden sm:block uppercase">
              Node: <span className="text-emerald-500">Local_Kali</span>
            </div>
            <div className="uppercase">
              Time: <span className="text-white">{currentTime}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main UI */}
      <main className="max-w-[1600px] mx-auto px-6 py-10">
        {error && (
            <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/50 rounded-lg flex items-center gap-4 text-rose-500 font-mono text-xs">
                <span className="font-bold">[SYSTEM_ERROR]</span> {error}
            </div>
        )}

        {loading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-zinc-600 font-mono space-y-4">
                <div className="w-12 h-1 bg-zinc-800 overflow-hidden rounded-full">
                    <div className="w-1/2 h-full bg-sky-500 animate-[loading_1s_infinite_linear]" />
                </div>
                <p className="text-[10px] tracking-[0.3em] uppercase">Initializing Pings...</p>
            </div>
        ) : (
            <>
                <div className="mb-10 flex justify-between items-end">
                    <div>
                        <h2 className="text-3xl font-bold text-white mb-2">Service Grid</h2>
                        <p className="text-zinc-500 text-sm">Concurrent health monitoring via Go-routines.</p>
                    </div>
                    <button 
                        onClick={() => {setLoading(true); fetchHeartbeats();}}
                        className="px-4 py-2 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all"
                    >
                        Force Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {projects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            </>
        )}
      </main>

      <footer className="max-w-[1600px] mx-auto px-6 py-20 border-t border-zinc-900 flex justify-between items-center text-zinc-700 font-mono text-[10px]">
        <p>HEARTBEAT_STABLE // 2026</p>
        <p>V1.0.0_PRODUCTION</p>
      </footer>
    </div>
  );
}