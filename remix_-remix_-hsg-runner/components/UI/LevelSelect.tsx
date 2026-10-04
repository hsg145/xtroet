import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { Lock, Play, ChevronLeft, ShoppingCart, Crosshair, ShieldAlert, Cpu, Zap, Activity } from 'lucide-react';
import { audio } from '../System/Audio';
import { motion, AnimatePresence } from 'motion/react';

const LEVELS_PER_SECTOR = 10;

const SECTOR_THEMES = [
  { name: 'NEON SLUMS', color: 'from-cyan-500 to-blue-600', shadow: 'shadow-cyan-500/50', text: 'text-cyan-400', accent: 'cyan' },
  { name: 'SYNTH DISTRICT', color: 'from-purple-500 to-pink-600', shadow: 'shadow-purple-500/50', text: 'text-purple-400', accent: 'purple' },
  { name: 'INDUSTRIAL ZONE', color: 'from-yellow-400 to-orange-500', shadow: 'shadow-yellow-500/50', text: 'text-yellow-400', accent: 'yellow' },
  { name: 'BIO-DOME', color: 'from-green-400 to-emerald-600', shadow: 'shadow-green-500/50', text: 'text-green-400', accent: 'green' },
  { name: 'RED LIGHT', color: 'from-red-500 to-rose-700', shadow: 'shadow-red-500/50', text: 'text-red-400', accent: 'red' },
  { name: 'CORPORATE SECTOR', color: 'from-indigo-500 to-violet-700', shadow: 'shadow-indigo-500/50', text: 'text-indigo-400', accent: 'indigo' },
  { name: 'AQUA LABS', color: 'from-teal-400 to-cyan-600', shadow: 'shadow-teal-500/50', text: 'text-teal-400', accent: 'teal' },
  { name: 'VOID EDGE', color: 'from-fuchsia-500 to-purple-700', shadow: 'shadow-fuchsia-500/50', text: 'text-fuchsia-400', accent: 'fuchsia' },
  { name: 'SOLAR CORE', color: 'from-amber-400 to-orange-600', shadow: 'shadow-amber-500/50', text: 'text-amber-400', accent: 'amber' },
  { name: 'THE MAINFRAME', color: 'from-slate-700 to-black', shadow: 'shadow-slate-500/50', text: 'text-slate-400', accent: 'slate' },
];

export const LevelSelect: React.FC = () => {
  const unlockedLevels = useStore(state => state.unlockedLevels);
  const startGame = useStore(state => state.startGame);
  const setStatus = useStore(state => state.setStatus);
  const openShop = useStore(state => state.openShop);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);

  // Dynamically calculate total levels to show (always at least 100, or current + 20)
  const TOTAL_LEVELS = Math.max(100, Math.ceil((unlockedLevels + 20) / 10) * 10);
  const mapHeight = TOTAL_LEVELS * 120 + 400;
  
  const levelNodes = React.useMemo(() => {
    const nodes = [];
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      const level = i + 1;
      const sector = Math.floor(i / LEVELS_PER_SECTOR);
      
      // Create a more organic, winding path
      const t = i / (TOTAL_LEVELS - 1);
      const basePulse = Math.sin(i * 0.8) * 25;
      const winding = Math.sin(i * 0.3) * 15;
      const x = 50 + basePulse + winding;
      
      nodes.push({
        level,
        sector,
        x: Math.max(15, Math.min(85, x)),
        y: i * 120 + 200,
        distance: 800 + (level * 200),
      });
    }
    return nodes;
  }, [TOTAL_LEVELS]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        const targetLevel = Math.min(unlockedLevels, TOTAL_LEVELS);
        const element = document.getElementById(`level-node-${targetLevel}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [unlockedLevels, TOTAL_LEVELS]);

  const handlePlayLevel = (level: number) => {
    if (level <= unlockedLevels) {
      audio.init();
      startGame(level);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 bg-[#02000a] z-[100] text-white pointer-events-auto font-cyber flex flex-col overflow-hidden"
    >
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.05)_0%,transparent_70%)]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.3)_50%)] bg-[size:100%_4px] z-10"></div>
      </div>

      {/* Header - High Tech Glassmorphism */}
      <div className="relative flex items-center justify-between p-4 md:p-6 bg-black/40 backdrop-blur-2xl border-b border-white/10 z-50">
        <motion.button 
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setStatus(GameStatus.MENU)}
          className="p-2 rounded-xl border border-white/10 transition-all"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </motion.button>

        <div className="flex flex-col items-center">
          <motion.div 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-xl md:text-4xl font-black italic tracking-tighter text-white md:text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-400 to-blue-500 drop-shadow-[0_0_15px_rgba(0,255,255,0.3)]"
          >
            NEURAL MAP
          </motion.div>
          <div className="flex items-center space-x-2 mt-1">
            <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] md:text-[10px] text-cyan-500/70 tracking-[0.2em] md:tracking-[0.3em] font-black uppercase">Sector Navigation Active</span>
          </div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(234,179,8,0.1)' }}
          whileTap={{ scale: 0.9 }}
          onClick={() => openShop()}
          className="p-3 rounded-2xl border border-yellow-500/20 text-yellow-400 transition-all relative group"
        >
          <ShoppingCart className="w-6 h-6" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-bounce"></div>
        </motion.button>
      </div>

      {/* Map Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar scroll-smooth"
      >
        <div 
          className="relative w-full max-w-5xl mx-auto" 
          style={{ height: `${mapHeight}px` }}
        >
          {/* Path SVG - Glowing Circuitry */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none z-0" 
            viewBox={`0 0 100 ${mapHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="pathGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Base Path (Locked) */}
            <path
              d={`M ${levelNodes.map((n, i) => {
                const x = n.x;
                const y = mapHeight - n.y;
                if (i === 0) return `${x} ${y}`;
                const prev = levelNodes[i - 1];
                const midY = mapHeight - (n.y + prev.y) / 2;
                return `C ${prev.x} ${midY}, ${x} ${midY}, ${x} ${y}`;
              }).join(' ')}`}
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="2"
              strokeDasharray="10, 10"
            />

            {/* Unlocked Path */}
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: "easeInOut" }}
              d={`M ${levelNodes.slice(0, unlockedLevels).map((n, i) => {
                const x = n.x;
                const y = mapHeight - n.y;
                if (i === 0) return `${x} ${y}`;
                const prev = levelNodes[i - 1];
                const midY = mapHeight - (n.y + prev.y) / 2;
                return `C ${prev.x} ${midY}, ${x} ${midY}, ${x} ${y}`;
              }).join(' ')}`}
              fill="none"
              stroke="url(#pathGradient)"
              strokeWidth="3"
              filter="url(#glow)"
            />
          </svg>

          {/* Sector Dividers & Environment Visuals */}
          {Array.from({ length: Math.ceil(TOTAL_LEVELS / LEVELS_PER_SECTOR) }).map((_, i) => {
            const sectorY = mapHeight - (i * LEVELS_PER_SECTOR * 120 + 100);
            const theme = SECTOR_THEMES[i % SECTOR_THEMES.length];
            return (
              <div key={`sector-${i}`} className="absolute w-full pointer-events-none" style={{ top: `${sectorY}px` }}>
                <div className="relative flex flex-col items-center justify-center w-full">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    className="flex items-center space-x-6 px-8 py-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl"
                  >
                    <div className={`p-3 rounded-2xl bg-gradient-to-br ${theme.color} ${theme.shadow} shadow-lg`}>
                      <Cpu className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-white/40 tracking-[0.4em] font-black uppercase">Sector {i + 1}</span>
                      <span className={`text-xl md:text-2xl font-black italic tracking-tighter ${theme.text}`}>{theme.name}</span>
                    </div>
                  </motion.div>
                  
                  {/* Decorative Elements */}
                  <div className={`absolute left-0 w-32 h-px bg-gradient-to-r from-transparent to-${theme.accent}-500/30`}></div>
                  <div className={`absolute right-0 w-32 h-px bg-gradient-to-l from-transparent to-${theme.accent}-500/30`}></div>
                </div>
              </div>
            );
          })}

          {/* Level Nodes */}
          {levelNodes.map((node) => {
            const isUnlocked = node.level <= unlockedLevels;
            const isCurrent = node.level === unlockedLevels;
            const theme = SECTOR_THEMES[node.sector % SECTOR_THEMES.length];
            const isHovered = hoveredLevel === node.level;
            
            return (
              <div
                key={node.level}
                id={`level-node-${node.level}`}
                className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center ${isHovered ? 'z-50' : 'z-20'}`}
                style={{
                  left: `${node.x}%`,
                  bottom: `${node.y}px`,
                }}
              >
                <motion.div
                  onHoverStart={() => setHoveredLevel(node.level)}
                  onHoverEnd={() => setHoveredLevel(null)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className="relative"
                >
                  {/* Node Button */}
                  <button
                    onClick={() => handlePlayLevel(node.level)}
                    disabled={!isUnlocked}
                    className={`relative w-20 h-20 md:w-28 md:h-28 flex items-center justify-center transition-all duration-500 ${
                      isUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-30 grayscale'
                    }`}
                  >
                    {/* Outer Ring */}
                    <div className={`absolute inset-0 rounded-full border-2 border-dashed ${isUnlocked ? `border-${theme.accent}-500/50 animate-spin-slow` : 'border-white/10'}`}></div>
                    
                    {/* Main Hexagon */}
                    <div 
                      className={`relative w-14 h-14 md:w-20 md:h-20 flex items-center justify-center overflow-hidden shadow-2xl transition-all duration-500 ${
                        isUnlocked ? `bg-gradient-to-br ${theme.color} ${theme.shadow}` : 'bg-white/5'
                      }`}
                      style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                    >
                      <div className="absolute inset-[2px] bg-[#0a0a0f] flex flex-col items-center justify-center" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
                        {isUnlocked ? (
                          <>
                            <span className="text-[7px] md:text-[10px] font-black text-white/30 tracking-widest uppercase mb-[-2px]">Node</span>
                            <span className="text-xl md:text-3xl font-black italic text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">{node.level}</span>
                          </>
                        ) : (
                          <Lock className="w-5 h-5 md:w-6 md:h-6 text-white/20" />
                        )}
                      </div>
                      
                      {/* Scanline Effect */}
                      {isUnlocked && (
                        <motion.div 
                          animate={{ top: ['-100%', '200%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          className="absolute left-0 right-0 h-4 bg-white/10 blur-md pointer-events-none"
                        />
                      )}
                    </div>

                    {/* Current Level Pulse */}
                    {isCurrent && (
                      <div className="absolute -inset-4 bg-cyan-500/20 rounded-full blur-2xl animate-pulse"></div>
                    )}
                  </button>

                  {/* Tooltip / Info Card */}
                  <AnimatePresence>
                    {(isHovered && isUnlocked) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                      >
                        <div className={`bg-black/95 backdrop-blur-2xl border border-${theme.accent}-500/50 p-4 rounded-2xl shadow-2xl min-w-[200px] shadow-${theme.accent}-500/20`}>
                          <div className="flex items-center justify-between mb-3">
                            <span className={`text-[10px] font-black tracking-widest uppercase ${theme.text}`}>Sector Node {node.level}</span>
                            <Zap className={`w-3 h-3 ${theme.text}`} />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-white/40">Distance</span>
                              <span className="font-bold">{node.distance} LY</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-white/40">Difficulty</span>
                              <div className="flex space-x-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < Math.min(5, Math.floor(node.level / 10) + 1) ? theme.text.replace('text-', 'bg-') : 'bg-white/10'}`}></div>
                                ))}
                              </div>
                            </div>
                          </div>
                          {node.level % 5 === 0 && (
                            <div className="mt-3 pt-3 border-t border-white/5 flex items-center space-x-2 text-red-400">
                              <ShieldAlert className="w-3 h-3" />
                              <span className="text-[8px] font-black tracking-widest uppercase">High Threat Sector</span>
                            </div>
                          )}
                        </div>
                        {/* Arrow */}
                        <div className={`w-3 h-3 bg-black/95 border-r border-b border-${theme.accent}-500/50 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2`}></div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Current Level Pointer */}
                {isCurrent && (
                  <motion.div 
                    animate={{ x: [0, 10, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute -right-16 top-1/2 -translate-y-1/2 flex items-center space-x-2"
                  >
                    <div className="w-8 h-[2px] bg-cyan-400 shadow-[0_0_15px_cyan]"></div>
                    <div className="p-2 bg-cyan-500 rounded-lg shadow-[0_0_20px_cyan]">
                      <Play className="w-4 h-4 text-black fill-black" />
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="p-4 md:p-6 bg-black/60 backdrop-blur-xl border-t border-white/10 flex items-center justify-around text-[10px] md:text-[10px] font-mono text-white/40 tracking-[0.2em] md:tracking-[0.3em] uppercase">
        <div className="flex items-center space-x-2">
          <Activity className="w-3 h-3 text-cyan-500" />
          <span>Synced: {unlockedLevels}/{TOTAL_LEVELS}</span>
        </div>
        <div className="hidden md:flex items-center space-x-2">
          <Zap className="w-3 h-3 text-yellow-500" />
          <span>Stability: 99.8%</span>
        </div>
        <div className="flex items-center space-x-2">
          <Cpu className="w-3 h-3 text-purple-500" />
          <span>Link: Secure</span>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
};
