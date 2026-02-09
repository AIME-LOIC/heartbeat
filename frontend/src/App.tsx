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
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
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
    } catch (e) { 
        console.error("API Offline - Using Fallback Data");
        setProjects([
            { id: "1", name: "Google_Srv", url: "google.com", status: "HEALTHY", latency: 45, language: "Go", lastChecked: "12:00" },
            { id: "2", name: "Git_Hub_Srv", url: "github.com", status: "HEALTHY", latency: 112, language: "Python", lastChecked: "12:00" },
            { id: "3", name: "Internal_Node", url: "localhost", status: "DOWN", latency: 0, language: "TypeScript", lastChecked: "12:00" }
        ]);
    }
  };

  useEffect(() => { 
    if (isOn) {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000);
        return () => clearInterval(interval);
    } 
  }, [isOn]);

  return (
    <div className="min-h-screen bg-[#050505] text-sky-500 font-mono relative overflow-hidden">
      
      {/* CRT Scanline Overlay */}
      <div className="crt-overlay" />

      <AnimatePresence mode="wait">
        {!isOn ? (
          /* --- POWER OFF STATE --- */
          <motion.div 
            key="off"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="h-screen w-screen flex flex-col items-center justify-center z-10 relative"
          >
            <motion.button 
              whileHover={{ scale: 1.1, boxShadow: "0 0 30px rgba(14,165,233,0.5)" }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsOn(true)}
              className="w-24 h-24 rounded-full border-4 border-sky-900 flex items-center justify-center transition-all"
            >
              <div className="w-4 h-4 bg-sky-500 rounded-full animate-pulse shadow-[0_0_15px_#0ea5e9]" />
            </motion.button>
            <p className="mt-6 text-[12px] tracking-[0.5em] text-sky-800 uppercase font-black">
              Click_To_Boot
            </p>
          </motion.div>
        ) : (
          /* --- POWER ON STATE --- */
          <motion.div 
            key="on"
            initial={{ scaleY: 0.005, scaleX: 0, opacity: 1 }}
            animate={{ scaleY: 1, scaleX: 1, opacity: 1 }}
            exit={{ scaleY: 0.005, scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: "circOut" }}
            className="h-screen w-screen p-8 overflow-y-auto z-10 relative"
          >
            <div className="max-w-7xl mx-auto">
              <header className="flex justify-between items-center mb-12 border-b-2 border-sky-900 pb-6">
                <div>
                  <h1 className="text-3xl font-black italic tracking-tighter">PULSE_OS_v1.0</h1>
                  <p className="text-[10px] text-sky-800 uppercase">System_Active // User: Aime</p>
                </div>
                <button 
                  onClick={() => setIsOn(false)}
                  className="px-6 py-2 border-2 border-rose-900 text-rose-900 hover:bg-rose-900 hover:text-black font-bold text-xs transition-all uppercase"
                >
                  Terminate
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {projects.map(p => (
                  <motion.div 
                    key={p.id}
                    whileHover={{ scale: 1.02, backgroundColor: "rgba(14,165,233,0.1)" }}
                    onClick={() => setSelectedProject(p)}
                    className="border-2 border-sky-900 p-6 bg-black cursor-pointer transition-all group relative"
                  >
                    <div className="flex justify-between mb-4">
                      <span className="text-[10px] bg-sky-900 text-black px-2 font-bold italic">NODE_{p.id}</span>
                      <div className={`h-3 w-3 ${p.status === 'HEALTHY' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-rose-600 shadow-[0_0_10px_#e11d48]'} rounded-full animate-pulse`} />
                    </div>
                    <h3 className="text-xl font-bold mb-1 uppercase truncate">{p.name}</h3>
                    <p className="text-[10px] text-sky-800 mb-4">{p.language} // STABLE</p>
                    <div className="text-right">
                      <span className="text-2xl font-black">{p.latency}ms</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
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