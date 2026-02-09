import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface Project {
  id: string;
  name: string;
  url: string;
  language: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latency: number;
  lastChecked: string;
}

// --- Detail Modal Component ---
const LogModal = ({ project, onClose }: { project: Project; onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div 
      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
      className="bg-zinc-900 border-2 border-sky-500 w-full max-w-2xl overflow-hidden rounded-lg shadow-[0_0_50px_rgba(14,165,233,0.3)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="bg-sky-500 text-black px-4 py-1 flex justify-between items-center font-bold text-xs uppercase">
        <span>System_Diagnostics // {project.name}</span>
        <button onClick={onClose} className="hover:bg-black hover:text-white px-2">X</button>
      </div>
      <div className="p-6 font-mono text-sm space-y-2 max-h-[400px] overflow-y-auto">
        <p className="text-sky-400">{`> INITIALIZING_CONNECTION_TO: ${project.url}`}</p>
        <p className="text-zinc-500">{`> HANDSHAKE_PROTOCOL: ${project.language}_STD_v2`}</p>
        <p className={project.status === 'DOWN' ? 'text-rose-500' : 'text-emerald-500'}>
          {`> STATUS: ${project.status}`}
        </p>
        <p className="text-zinc-400">{`> LATENCY_MEASURED: ${project.latency}ms`}</p>
        <p className="text-zinc-400">{`> TIMESTAMP: ${project.lastChecked}`}</p>
        <div className="pt-4 border-t border-zinc-800 mt-4 text-xs text-zinc-500">
          <p>[LOG] - Attempting ping...</p>
          <p>[LOG] - Buffer allocated 1024kb</p>
          <p>[LOG] - Response received in {project.latency}ms</p>
          <p className="animate-pulse">_</p>
        </div>
      </div>
    </motion.div>
  </motion.div>
);

export default function App() {
  const [isOn, setIsOn] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/v1/status');
      const data = await res.json();
      setProjects(data);
    } catch (e) { console.error("API Offline"); }
  };

  useEffect(() => { if (isOn) fetchStatus(); }, [isOn]);

  return (
    <div className="min-h-screen bg-[#050505] text-sky-500 font-mono overflow-hidden relative">
      
      {/* CRT Scanline Overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />

      {/* Main Container with TV "Power On" Animation */}
      <AnimatePresence>
        {isOn ? (
          <motion.div 
            key="screen"
            initial={{ scaleY: 0.005, scaleX: 0, opacity: 0 }}
            animate={{ scaleY: 1, scaleX: 1, opacity: 1 }}
            exit={{ scaleY: 0.005, scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="h-screen w-screen p-8 overflow-y-auto"
          >
            <header className="flex justify-between items-center mb-12 border-b border-sky-900 pb-4">
              <h1 className="text-2xl font-black italic tracking-tighter">PULSE_OS v1.0</h1>
              <button 
                onClick={() => setIsOn(false)}
                className="bg-rose-950 text-rose-500 border border-rose-500 px-4 py-1 text-xs hover:bg-rose-500 hover:text-black transition-all"
              >
                SHUTDOWN
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {projects.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className="border border-sky-900 p-4 bg-sky-500/5 hover:bg-sky-500/20 cursor-pointer group transition-all"
                >
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] text-sky-700">ID_{p.id}</span>
                    <div className={`h-2 w-2 rounded-full ${p.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                  </div>
                  <h3 className="text-lg font-bold truncate">{p.name}</h3>
                  <p className="text-[10px] mb-4 text-sky-800">{p.language} // STABLE</p>
                  <div className="text-right text-xs">
                    <span className="text-sky-300">{p.latency}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="off-btn"
            className="h-screen w-screen flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 rounded-full border-2 border-sky-900 flex items-center justify-center cursor-pointer hover:border-sky-400 group transition-all"
                 onClick={() => setIsOn(true)}>
              <div className="w-2 h-2 bg-sky-900 group-hover:bg-sky-400 rounded-full" />
            </div>
            <p className="mt-4 text-[10px] tracking-widest text-sky-900 uppercase">System Offline // Click to Boot</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedProject && (
          <LogModal project={selectedProject} onClose={() => setSelectedProject(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}