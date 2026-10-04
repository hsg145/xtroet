
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Heart, Zap, Trophy, MapPin, Diamond, Rocket, ArrowUpCircle, Shield, Activity, PlusCircle, Play, Cpu, ChevronRight, ShoppingCart, MoreVertical, LogOut, Eye, EyeOff, Settings, RefreshCw, Volume2, VolumeX, Pause, User, Store, CheckCircle, Users, Home, Magnet, Clock, Star, Target } from 'lucide-react';
import { useStore, OnlinePlayer } from '../../store';
import { GameStatus, GEMINI_COLORS, ShopItem, RUN_SPEED_BASE } from '../../types';
import { audio } from '../System/Audio';
import { LevelSelect } from './LevelSelect';

import { Multiplayer } from './Multiplayer';
import { AuthScreen } from './Auth';
import { ProfileScreen } from './Profile';
import { LandingScreen } from './Landing';
import { GuidelinesScreen, PrivacyScreen, AboutScreen, ContactScreen, TermsScreen } from './InfoPages';
import { AnimatePresence } from 'motion/react';

const PlayerTrack = () => {
    const { onlinePlayers, distance, targetDistance, localUserId, status } = useStore();
    
    if (status !== GameStatus.ONLINE) return null;

    const maxDist = Math.max(targetDistance, ...onlinePlayers.map(p => p.distance));

    return (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[90%] md:w-[80%] max-w-3xl h-12 flex flex-col justify-center pointer-events-none z-[60]">
            <div className="relative w-full h-1 bg-white/10 rounded-full border border-white/5">
                {/* Background markers */}
                <div className="absolute inset-0 flex justify-between px-1">
                    {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className="w-[1px] h-2 bg-white/20 -translate-y-1/2 mt-0.5" />
                    ))}
                </div>

                <AnimatePresence>
                    {onlinePlayers.map(p => (
                        <motion.div
                            key={p.user_id}
                            layout
                            initial={{ x: 0, opacity: 0 }}
                            animate={{ 
                                x: `${Math.min(100, (p.distance / maxDist) * 100)}%`,
                                opacity: 1
                            }}
                            className="absolute top-1/2 -translate-y-1/2 -ml-2 transition-all"
                        >
                            <div className="relative group">
                                {p.is_dead ? (
                                    <div className="w-4 h-4 bg-red-500/50 rounded-full flex items-center justify-center border border-red-500 scale-75">
                                        <div className="w-1.5 h-1.5 bg-red-200 rounded-full" />
                                    </div>
                                ) : (
                                    <motion.div 
                                        animate={{ 
                                            scale: p.user_id === localUserId ? [1, 1.3, 1] : 1,
                                            boxShadow: p.user_id === localUserId ? ["0 0 10px #0ff", "0 0 20px #0ff", "0 0 10px #0ff"] : "none"
                                        }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className={`w-4 h-4 rounded-full flex items-center justify-center border-2 ${
                                            p.user_id === localUserId ? 'bg-cyan-500 border-white' : 'bg-white/40 border-white/20'
                                        }`}
                                    >
                                        {p.user_id === localUserId && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                    </motion.div>
                                )}
                                
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                    <span className={`text-[8px] font-black uppercase tracking-tighter px-1 rounded ${
                                        p.user_id === localUserId ? 'text-black bg-cyan-400' : 'text-white/60 bg-black/40'
                                    }`}>
                                        {p.name.split(' ')[0]}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};

const OnlineCountdown = () => {
    const { countdown, status, onlinePlayers, localUserId } = useStore();

    if (status !== GameStatus.ONLINE || countdown <= 0) return null;

    const myData = onlinePlayers.find(p => p.user_id === localUserId);
    const opponent = onlinePlayers.find(p => p.user_id !== localUserId);

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[200] pointer-events-none bg-black/40 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, y: -50 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-12 mb-12"
            >
                <div className="text-right">
                    <div className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase mb-1">Local_Link</div>
                    <div className="text-2xl md:text-4xl font-black italic text-white uppercase">YOU</div>
                </div>
                <div className="relative">
                    <div className="text-4xl md:text-6xl font-black text-white italic opacity-20">VS</div>
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-white blur-xl -z-10"
                    />
                </div>
                <div className="text-left">
                    <div className="text-[10px] text-red-400 font-mono tracking-widest uppercase mb-1">Remote_Link</div>
                    <div className="text-2xl md:text-4xl font-black italic text-white uppercase truncate max-w-[150px]">
                        {opponent ? opponent.name : 'SYNCING...'}
                    </div>
                </div>
            </motion.div>

            <motion.div
                key={countdown}
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1.5, opacity: 1, rotate: 0 }}
                exit={{ scale: 4, opacity: 0, filter: 'blur(20px)' }}
                className="text-8xl md:text-[15rem] font-black italic text-white drop-shadow-[0_0_50px_rgba(34,211,238,0.8)]"
            >
                {countdown}
            </motion.div>
            
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-12 text-cyan-500 font-black tracking-[0.5em] uppercase text-xs md:text-sm animate-pulse"
            >
                Neural Sync Initializing
            </motion.div>
        </div>
    );
};

const RankingRow = ({ player, rank, isLocal }: { player: OnlinePlayer, rank: number, isLocal: boolean }) => (
    <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex items-center justify-between p-3 rounded-xl border ${isLocal ? 'bg-cyan-500/20 border-cyan-500/50' : 'bg-white/5 border-white/5'}`}
    >
        <div className="flex items-center space-x-3">
            <span className={`text-sm font-black italic ${rank === 1 ? 'text-yellow-400' : 'text-white/40'}`}>#{rank}</span>
            <span className={`text-xs font-bold uppercase ${isLocal ? 'text-white' : 'text-white/60'}`}>{player.name}</span>
        </div>
        <div className="text-xs font-mono text-cyan-400">{Math.floor(player.distance)}m</div>
    </motion.div>
);

const OnlineResultActions = () => {
    const { setStatus, resetOnlineState } = useStore();
    return (
        <div className="flex flex-col sm:flex-row gap-3 w-full relative z-[200] pointer-events-auto">
            <button 
                onClick={(e) => { 
                    e.stopPropagation();
                    audio.init(); 
                    setStatus(GameStatus.LOBBY); 
                }}
                className="flex-1 py-4 bg-cyan-600 text-black font-black text-sm md:text-lg rounded-2xl hover:bg-cyan-500 transition-all active:scale-95 shadow-[0_10px_20px_rgba(6,182,212,0.4)] flex items-center justify-center uppercase tracking-widest cursor-pointer relative z-[210]"
            >
                Ready Room <Users className="ml-2 w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button 
                onClick={async (e) => { 
                    e.stopPropagation();
                    audio.init(); 
                    const { roomId, localUserId, isHost, resetOnlineState } = useStore.getState();
                    if (roomId && localUserId) {
                        try {
                            if (isHost) {
                                await supabase.from('rooms').delete().eq('id', roomId);
                            } else {
                                await supabase.from('players').delete().eq('user_id', localUserId).eq('room_id', roomId);
                                const { data: room } = await supabase.from('rooms').select('player_count').eq('id', roomId).single();
                                if (room) {
                                    await supabase.from('rooms').update({ player_count: Math.max(0, room.player_count - 1) }).eq('id', roomId);
                                }
                            }
                        } catch (err) {
                            console.error("Failed to evict player:", err);
                        }
                    }
                    resetOnlineState(); 
                }}
                className="flex-1 py-4 bg-white/10 text-white font-black text-xs md:text-sm rounded-2xl border border-white/20 hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center uppercase tracking-widest cursor-pointer relative z-[210]"
            >
                Exit Party <LogOut className="ml-2 w-4 h-4 text-white/40" />
            </button>
        </div>
    );
};

const OnlineDeathResults = () => {
    const { onlinePlayers, localUserId, status } = useStore();
    const [hidden, setHidden] = useState(false);
    
    if (status !== GameStatus.ONLINE) return null;

    const myData = onlinePlayers.find(p => p.user_id === localUserId);
    if (!myData || !myData.is_dead) return null;

    const sorted = [...onlinePlayers].sort((a, b) => b.distance - a.distance);
    const myRank = sorted.findIndex(p => p.user_id === localUserId) + 1;

    if (hidden) {
        return (
            <button 
                onClick={() => setHidden(false)}
                className="absolute bottom-6 left-6 p-4 bg-cyan-500 text-black rounded-full z-[150] shadow-xl animate-bounce pointer-events-auto"
            >
                <Eye className="w-6 h-6" />
            </button>
        );
    }

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-md bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[40px] p-6 md:p-8 z-[150] pointer-events-auto shadow-[0_0_100px_rgba(0,0,0,0.8)]"
        >
            <button 
                onClick={() => setHidden(true)}
                className="absolute top-6 right-6 p-2 text-white/40 hover:text-white transition-colors"
            >
                <EyeOff className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                    <Activity className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-3xl font-black italic text-white uppercase tracking-tighter">Terminated</h2>
                <p className="text-[10px] text-red-400 font-mono tracking-[0.3em] mt-1 uppercase opacity-60">Spectator_Mode_Active</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                    <p className="text-[8px] text-white/30 uppercase mb-1">Final Rank</p>
                    <p className="text-2xl font-black text-cyan-400 italic">#{myRank}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                    <p className="text-[8px] text-white/30 uppercase mb-1">Distance</p>
                    <p className="text-2xl font-black text-white italic">{Math.floor(myData.distance)}m</p>
                </div>
            </div>

            <div className="space-y-2 mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-[8px] text-white/30 uppercase tracking-widest ml-1 mb-2">Live Standings</p>
                {sorted.map((p, i) => (
                    <RankingRow key={p.user_id} player={p} rank={i + 1} isLocal={p.user_id === localUserId} />
                ))}
            </div>

            <div className="flex flex-col space-y-3">
                <div className="text-[8px] text-white/20 uppercase tracking-widest text-center mb-1">Network Actions</div>
                <OnlineResultActions />
            </div>
        </motion.div>
    );
};

const EliminationAlerts = () => {
    const { onlinePlayers, status } = useStore();
    const [notifications, setNotifications] = useState<{ id: string, name: string }[]>([]);
    const notifiedIds = useRef<Set<string>>(new Set());

    // Reset tracking on menu/lobby
    useEffect(() => {
        if (status === GameStatus.MENU || status === GameStatus.LOBBY) {
            notifiedIds.current.clear();
        }
    }, [status]);

    useEffect(() => {
        if (status !== GameStatus.ONLINE) return;

        onlinePlayers.forEach(p => {
            if (p.is_dead && !notifiedIds.current.has(p.user_id)) {
                // Permanently mark this user as notified for this session
                notifiedIds.current.add(p.user_id);
                
                const id = Math.random().toString(36);
                setNotifications(prev => [...prev, { id, name: p.name }]);
                setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.id !== id));
                }, 4000);
            }
        });
    }, [onlinePlayers, status]);

    return (
        <div className="absolute top-48 left-1/2 -translate-x-1/2 flex flex-col space-y-2 z-[120] pointer-events-none">
            <AnimatePresence>
                {notifications.map(n => (
                    <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
                        className="bg-red-500/80 backdrop-blur-md px-6 py-2 rounded-xl border border-red-400 shadow-[0_0_30px_rgba(255,0,0,0.4)]"
                    >
                        <div className="text-white font-black italic tracking-widest uppercase text-[10px] md:text-sm">
                            <span className="text-red-200">{n.name}</span> ELIMINATED
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

const Leaderboard = () => {
    const { onlinePlayers, status, localUserId } = useStore();
    
    if (status !== GameStatus.ONLINE) return null;

    const sortedPlayers = [...onlinePlayers].sort((a, b) => b.distance - a.distance);

    return (
        <div className="absolute top-32 md:top-44 right-4 md:right-6 flex flex-col space-y-2 md:space-y-3 pointer-events-none z-[60] scale-75 md:scale-100 origin-top-right">
            <AnimatePresence mode="popLayout">
                {sortedPlayers.map((p, index) => (
                    <motion.div
                        key={p.user_id}
                        layout
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 50, scale: 0.9 }}
                        className={`flex items-center space-x-3 md:space-x-4 px-3 md:px-5 py-2 md:py-3 rounded-xl md:rounded-2xl border backdrop-blur-xl transition-all ${
                            p.user_id === localUserId 
                            ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]' 
                            : 'bg-black/60 border-white/10 shadow-xl'
                        }`}
                    >
                        <div className="relative">
                            <div className={`text-sm md:text-lg font-black italic ${
                                index === 0 ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 
                                index === 1 ? 'text-slate-300' :
                                index === 2 ? 'text-orange-400' : 'text-white/40'
                            }`}>
                                {index + 1}
                            </div>
                            {index === 0 && <Trophy className="w-2 h-2 md:w-3 md:h-3 text-yellow-400 absolute -top-1 -right-1 md:-top-2 md:-right-2 animate-bounce" />}
                        </div>
                        
                        <div className="flex-1 min-w-[80px] md:min-w-[120px]">
                            <div className="flex justify-between items-end mb-0.5 md:mb-1">
                                <div className={`text-[9px] md:text-[11px] font-black uppercase tracking-wider truncate max-w-[60px] md:max-w-none ${p.user_id === localUserId ? 'text-white' : 'text-white/70'}`}>
                                    {p.name}
                                    {p.user_id === localUserId && <span className="ml-1 md:ml-2 text-[7px] md:text-[8px] text-cyan-400 opacity-70">(YOU)</span>}
                                </div>
                                <div className="text-[8px] md:text-[9px] font-mono text-cyan-400 font-bold">
                                    {Math.floor(p.distance)}m
                                </div>
                            </div>
                            <div className="h-1 md:h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                    className={`h-full relative ${p.is_dead ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-600 to-blue-400'}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (p.distance / 2000) * 100)}%` }}
                                    transition={{ type: "spring", stiffness: 50 }}
                                >
                                    {!p.is_dead && <div className="absolute right-0 top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_#fff]" />}
                                </motion.div>
                            </div>
                        </div>
                        
                        {p.is_dead && (
                            <div className="text-[7px] md:text-[8px] font-black text-red-500 uppercase tracking-tighter animate-pulse">Out</div>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

const SHOP_ITEMS: ShopItem[] = [
    {
        id: 'DOUBLE_JUMP',
        name: 'FLIGHT DRIVE',
        description: 'Initiate secondary vertical thrust mid-air.',
        cost: 15000,
        icon: ArrowUpCircle,
        oneTime: true,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'DOUBLE_JUMP'
    },
    {
        id: 'MAX_LIFE',
        name: 'CORE UPGRADE',
        description: 'Expand physical integrity systems permanently.',
        cost: 25000,
        icon: Activity,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'LIFE_UP'
    },
    {
        id: 'HEART_POWER',
        name: 'HEART SHIELD',
        description: 'Increases heart durability to resist more damage.',
        cost: 25000,
        icon: Shield,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'HEART_POWER'
    },
    {
        id: 'HEAL',
        name: 'NANOBOT REPAIR',
        description: 'Immediate restoration of one life unit.',
        cost: 10000,
        icon: PlusCircle,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'HEAL'
    },
    {
        id: 'IMMORTAL',
        name: 'PHASE SHIFT',
        description: 'Briefly become untargetable by cosmic matter.',
        cost: 50000,
        icon: Shield,
        oneTime: true,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'IMMORTAL'
    },
    {
        id: 'MAGNET',
        name: 'GRAVITY WELL',
        description: 'Magnetize nearby gems and powerups.',
        cost: 75000,
        icon: Magnet,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'MAGNET'
    },
    {
        id: 'SHIELD',
        name: 'ENERGY AEGIS',
        description: 'Permanent kinetic barrier absorbing one fatal impact.',
        cost: 100000,
        icon: Shield,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'SHIELD_PERM'
    },
    {
        id: 'DASH',
        name: 'HYPER DASH',
        description: 'Forward spatial displacement module.',
        cost: 150000,
        icon: Rocket,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'DASH'
    },
    {
        id: 'TIME_WARP',
        name: 'CHRONO DRIVE',
        description: 'Temporarily dilate local time relative to runner.',
        cost: 200000,
        icon: Clock,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'TIME_WARP'
    },
    {
        id: 'MULTIPLIER',
        name: 'SCORE NEXUS',
        description: 'Permanent 2x multiplier for all collected credits.',
        cost: 500000,
        icon: Star,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'MULTIPLIER'
    },
    {
        id: 'LASER',
        name: 'PLASMA CANNON',
        description: 'Destructive beam vaporizing obstacles in path.',
        cost: 1000000,
        icon: Target,
        category: 'UPGRADE',
        previewType: 'ANIMATION',
        previewValue: 'LASER'
    },
    // Colors
    {
        id: 'char_neon',
        name: 'NEON PHANTOM',
        description: 'A high-speed digital entity with enhanced agility.',
        cost: 100000,
        icon: Cpu,
        category: 'COLOR',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_NEON'
    },
    {
        id: 'char_gold',
        name: 'GOLDEN GUARDIAN',
        description: 'Ancient technology fused with modern cybernetics.',
        cost: 250000,
        icon: Trophy,
        category: 'COLOR',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_GOLD'
    },
    {
        id: 'char_void',
        name: 'VOID WALKER',
        description: 'A mysterious traveler from the dark sectors.',
        cost: 500000,
        icon: Zap,
        category: 'COLOR',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_VOID'
    },
    // Accessories
    {
        id: 'char_samurai',
        name: 'RONIN HAT',
        description: 'Equipped with an ancestral cyber-hat.',
        cost: 750000,
        icon: Shield,
        category: 'ACCESSORY',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_SAMURAI'
    },
    {
        id: 'char_hacker',
        name: 'GHOST HOOD',
        description: 'Concealed by a cloaking hoodie and neon visor.',
        cost: 1000000,
        icon: EyeOff,
        category: 'ACCESSORY',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_HACKER'
    },
    {
        id: 'char_cyborg',
        name: 'MECHA JACKET',
        description: 'Heavy armored jacket radiating pure plasma energy.',
        cost: 1500000,
        icon: Activity,
        category: 'ACCESSORY',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_CYBORG'
    },
    {
        id: 'char_assassin',
        name: 'SHADOW CLOAK',
        description: 'Dark flowing robes woven from quantum threads.',
        cost: 2000000,
        icon: MapPin,
        category: 'ACCESSORY',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_ASSASSIN'
    },
    {
        id: 'char_king',
        name: 'ASTRAL CROWN',
        description: 'Adorned with a halo of floating golden crystals.',
        cost: 5000000,
        icon: Diamond,
        category: 'ACCESSORY',
        previewType: 'ANIMATION',
        previewValue: 'CHAR_KING'
    }
];

const LifeUnit: React.FC<{ active: boolean; index: number; wasLost: boolean }> = ({ active, index, wasLost }) => {
    return (
        <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
            {/* Background Empty State */}
            <div className={`absolute inset-0 border-2 border-white/10 rounded-lg rotate-45 transition-colors duration-500 ${active ? 'bg-transparent' : 'bg-black/20'}`} />
            
            {/* Active Life Icon */}
            {active && !wasLost && (
                <div className="relative z-10 animate-heart-pulse">
                    <Heart className="w-4 h-4 md:w-6 md:h-6 fill-pink-500 text-pink-400" />
                    {/* Inner Glow Overlay */}
                    <div className="absolute inset-0 blur-sm bg-pink-500/30 rounded-full scale-150 -z-10" />
                </div>
            )}

            {/* Loss Animation Placeholder */}
            {wasLost && (
                <div className="relative z-20 animate-heart-shatter">
                    <Heart className="w-4 h-4 md:w-6 md:h-6 fill-red-500 text-white" />
                    <div className="absolute inset-0 bg-white blur-md animate-pulse" />
                </div>
            )}
        </div>
    );
};

const PreviewArea: React.FC<{ item: ShopItem | null }> = ({ item }) => {
    if (!item) return (
        <div className="w-full h-48 md:h-64 bg-black/40 rounded-[32px] border border-white/5 flex flex-col items-center justify-center text-white/20 italic text-xs tracking-[0.2em] uppercase">
            <Cpu className="w-8 h-8 mb-4 opacity-20 animate-pulse" />
            Select Item to Preview
        </div>
    );

    const getCharacterColor = (id: string) => {
        if (id === 'CHAR_NEON') return 'text-cyan-400';
        if (id === 'CHAR_GOLD') return 'text-yellow-400';
        if (id === 'CHAR_VOID') return 'text-purple-400';
        if (id === 'CHAR_SAMURAI') return 'text-red-500';
        if (id === 'CHAR_HACKER') return 'text-green-500';
        if (id === 'CHAR_CYBORG') return 'text-orange-500';
        if (id === 'CHAR_ASSASSIN') return 'text-slate-800';
        if (id === 'CHAR_KING') return 'text-amber-300';
        return 'text-white';
    };

    const getCharacterGlow = (id: string) => {
        if (id === 'CHAR_NEON') return 'shadow-[0_0_50px_rgba(34,211,238,0.4)]';
        if (id === 'CHAR_GOLD') return 'shadow-[0_0_50px_rgba(234,179,8,0.4)]';
        if (id === 'CHAR_VOID') return 'shadow-[0_0_50px_rgba(168,85,247,0.4)]';
        if (id === 'CHAR_SAMURAI') return 'shadow-[0_0_50px_rgba(239,68,68,0.4)]';
        if (id === 'CHAR_HACKER') return 'shadow-[0_0_50px_rgba(34,197,94,0.4)]';
        if (id === 'CHAR_CYBORG') return 'shadow-[0_0_50px_rgba(249,115,22,0.4)]';
        if (id === 'CHAR_ASSASSIN') return 'shadow-[0_0_50px_rgba(30,41,59,0.8)]';
        if (id === 'CHAR_KING') return 'shadow-[0_0_50px_rgba(252,211,77,0.6)]';
        return 'shadow-[0_0_50px_rgba(255,255,255,0.2)]';
    };

    const getStats = (id: string) => {
        if (id === 'CHAR_NEON') return { speed: '115%', agility: 'MAX', armor: 'LOW' };
        if (id === 'CHAR_GOLD') return { speed: '90%', agility: 'MED', armor: 'MAX' };
        if (id === 'CHAR_VOID') return { speed: '105%', agility: 'HIGH', armor: 'MED' };
        if (id === 'CHAR_SAMURAI') return { speed: '120%', agility: 'HIGH', armor: 'LOW' };
        if (id === 'CHAR_HACKER') return { speed: '100%', agility: 'MAX', armor: 'LOW' };
        if (id === 'CHAR_CYBORG') return { speed: '80%', agility: 'LOW', armor: 'ULTRA' };
        if (id === 'CHAR_ASSASSIN') return { speed: '130%', agility: 'ULTRA', armor: 'NONE' };
        if (id === 'CHAR_KING') return { speed: '100%', agility: 'HIGH', armor: 'HIGH' };
        return { speed: '100%', agility: 'MED', armor: 'MED' };
    };

    return (
        <div className="w-full h-48 md:h-64 bg-[#0a0a0f] rounded-[32px] border border-white/10 relative overflow-hidden flex items-center justify-center group">
            {/* Background Grid/Scanner Effect */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] opacity-50"></div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]"></div>
            
            {/* Scanning Line */}
            <motion.div 
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-[2px] bg-cyan-500/20 z-10"
            />

            {item.previewValue === 'DOUBLE_JUMP' && (
                <div className="relative flex flex-col items-center">
                    <motion.div 
                        animate={{ 
                            y: [0, -60, -80, 0],
                            scale: [1, 1.1, 1.2, 1],
                            opacity: [1, 1, 0.8, 1]
                        }}
                        transition={{ duration: 2, repeat: Infinity, times: [0, 0.4, 0.6, 1] }}
                        className="relative"
                    >
                        <ArrowUpCircle className="w-20 h-20 text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
                        <motion.div 
                            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                            className="absolute inset-0 bg-cyan-400 rounded-full blur-xl -z-10"
                        />
                    </motion.div>
                    <div className="mt-4 w-24 h-1 bg-cyan-900/50 rounded-full overflow-hidden">
                        <motion.div 
                            animate={{ x: ['-100%', '100%'] }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-full h-full bg-cyan-400 shadow-[0_0_10px_cyan]"
                        />
                    </div>
                </div>
            )}

            {item.previewValue === 'LIFE_UP' && (
                <div className="relative flex flex-col items-center">
                    <motion.div 
                        animate={{ 
                            scale: [1, 1.3, 1],
                            filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    >
                        <Heart className="w-24 h-24 text-pink-500 fill-pink-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.6)]" />
                    </motion.div>
                    <div className="absolute -inset-8 bg-pink-500/5 rounded-full blur-3xl animate-pulse"></div>
                </div>
            )}

            {item.previewValue === 'HEAL' && (
                <div className="relative flex flex-col items-center">
                    <div className="relative">
                        <Heart className="w-20 h-20 text-pink-500 fill-pink-500" />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <motion.div 
                                key={i}
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 2, opacity: [0, 1, 0] }}
                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                                className="absolute inset-0 bg-white rounded-full blur-2xl -z-10"
                            />
                        ))}
                    </div>
                    <motion.div 
                        animate={{ y: [0, -10], opacity: [0, 1, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="mt-4 text-[10px] font-black text-pink-400 tracking-widest uppercase"
                    >
                        Repairing...
                    </motion.div>
                </div>
            )}

            {item.previewValue === 'IMMORTAL' && (
                <div className="relative flex flex-col items-center">
                    <motion.div 
                        animate={{ 
                            rotate: 360,
                            scale: [1, 1.1, 1]
                        }}
                        transition={{ 
                            rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                            scale: { duration: 2, repeat: Infinity }
                        }}
                        className="relative w-24 h-24 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center"
                    >
                        <Shield className="w-12 h-12 text-white drop-shadow-[0_0_20px_white]" />
                        <div className="absolute inset-0 bg-white/5 rounded-full animate-pulse"></div>
                    </motion.div>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)] animate-pulse"></div>
                </div>
            )}

            {item.previewValue === 'MAGNET' && (
                <div className="relative flex flex-col items-center">
                    <Magnet className="w-20 h-20 text-purple-500 drop-shadow-[0_0_20px_rgba(168,85,247,0.8)]" />
                    <motion.div 
                        animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 bg-purple-500 rounded-full blur-2xl -z-10"
                    />
                    <motion.div 
                        animate={{ x: [-50, 0, 50, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute top-1/2 left-1/2 w-4 h-4 bg-white rounded-full blur-sm"
                    />
                </div>
            )}

            {item.previewValue === 'SHIELD_PERM' && (
                <div className="relative flex flex-col items-center">
                    <Shield className="w-20 h-20 text-blue-500 fill-blue-500/20 drop-shadow-[0_0_20px_rgba(59,130,246,0.8)]" />
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -inset-4 border-[6px] border-blue-400 rounded-full blur-sm"
                    />
                </div>
            )}

            {item.previewValue === 'DASH' && (
                <div className="relative flex flex-col items-center overflow-hidden w-full h-full justify-center">
                    <motion.div 
                        animate={{ x: [-100, 100] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                    >
                        <Rocket className="w-20 h-20 text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.8)]" />
                    </motion.div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/20 to-transparent blur-xl" />
                </div>
            )}

            {item.previewValue === 'TIME_WARP' && (
                <div className="relative flex flex-col items-center">
                    <motion.div 
                        animate={{ rotate: -360 }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    >
                        <Clock className="w-24 h-24 text-teal-400 drop-shadow-[0_0_30px_rgba(45,212,191,0.8)]" />
                    </motion.div>
                    <div className="absolute inset-0 bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
                    <div className="mt-4 text-[10px] font-black text-teal-400 tracking-[0.5em] uppercase">Time Dilation</div>
                </div>
            )}

            {item.previewValue === 'MULTIPLIER' && (
                <div className="relative flex flex-col items-center">
                    <motion.div 
                        animate={{ scale: [1, 1.5, 1], rotate: [0, 180, 360] }}
                        transition={{ duration: 3, repeat: Infinity }}
                    >
                        <Star className="w-24 h-24 text-yellow-400 fill-yellow-400/50 drop-shadow-[0_0_40px_rgba(250,204,21,1)]" />
                    </motion.div>
                    <div className="absolute font-black text-4xl text-white drop-shadow-md">2x</div>
                </div>
            )}

            {item.previewValue === 'LASER' && (
                <div className="relative flex flex-col items-center justify-center w-full h-full">
                    <Target className="w-16 h-16 text-red-500 mb-4 z-10 drop-shadow-[0_0_10px_rgba(239,68,68,1)]" />
                    <motion.div 
                        animate={{ height: ['0%', '100%'], opacity: [0.8, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute bottom-1/2 w-4 bg-red-500 blur-sm shadow-[0_0_20px_red]"
                    />
                </div>
            )}

            {item.previewValue?.startsWith('CHAR_') && (
                <div className="relative w-full h-full flex items-center justify-center">
                    {/* Stats Panel */}
                    <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="absolute left-6 top-6 bottom-6 w-24 bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-between z-20"
                    >
                        {Object.entries(getStats(item.previewValue)).map(([key, value]) => (
                            <div key={key} className="flex flex-col">
                                <span className="text-[7px] text-white/30 uppercase tracking-widest">{key}</span>
                                <span className="text-[10px] font-black text-cyan-400 tracking-tighter">{value}</span>
                            </div>
                        ))}
                    </motion.div>

                    <div className="relative flex flex-col items-center">
                        {/* Hologram Base */}
                        <div className="absolute bottom-[-20px] w-32 h-8 bg-cyan-500/20 blur-xl rounded-full"></div>
                        
                        <motion.div 
                            animate={{ 
                                y: [-5, 5, -5],
                                rotateY: [0, 10, -10, 0]
                            }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className={`relative w-20 h-32 flex flex-col items-center justify-center ${getCharacterColor(item.previewValue)}`}
                        >
                            {/* Stylized Cyber Runner Shape */}
                            <div className={`w-12 h-12 rounded-full border-4 border-current mb-2 bg-current/10 ${getCharacterGlow(item.previewValue)} relative flex items-center justify-center`}>
                                {/* Head accessories based on character */}
                                {item.previewValue === 'CHAR_SAMURAI' && (
                                    <div className="absolute -top-4 w-16 h-6 border-t-8 border-current rounded-t-[50%]" />
                                )}
                                {item.previewValue === 'CHAR_HACKER' && (
                                    <div className="absolute inset-0 bg-current/20 rounded-full flex items-center justify-center">
                                        <div className="w-8 h-2 bg-black rounded-full shadow-[0_0_10px_black]" />
                                    </div>
                                )}
                                {item.previewValue === 'CHAR_KING' && (
                                    <div className="absolute -top-6 w-10 h-6 border-x-4 border-b-4 border-current flex justify-between">
                                        <div className="w-2 h-4 bg-current -mt-2" />
                                        <div className="w-2 h-6 bg-current -mt-4" />
                                        <div className="w-2 h-4 bg-current -mt-2" />
                                    </div>
                                )}
                                {item.previewValue === 'CHAR_ASSASSIN' && (
                                    <div className="absolute -inset-2 bg-current/80 rounded-t-full rounded-b-md opacity-80 mix-blend-overlay" />
                                )}
                            </div>
                            <div className="w-16 h-20 rounded-2xl border-4 border-current bg-current/5 relative overflow-hidden flex justify-center">
                                {/* Body accessories */}
                                {item.previewValue === 'CHAR_CYBORG' && (
                                    <div className="absolute inset-x-2 top-2 bottom-2 border-x-4 border-t-8 border-current opacity-50" />
                                )}
                                {item.previewValue === 'CHAR_KING' && (
                                    <div className="absolute top-0 w-12 h-full bg-current/20 border-x border-current/40" />
                                )}
                                <motion.div 
                                    animate={{ top: ['-100%', '200%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="absolute left-0 right-0 h-4 bg-white/20 blur-sm"
                                />
                            </div>
                            
                            {/* Floating Tech Bits */}
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                className="absolute -inset-4 border border-current/20 rounded-full border-dashed"
                            />
                        </motion.div>
                        
                        <div className="mt-8 flex space-x-2">
                            <div className="w-2 h-2 bg-current rounded-full animate-ping"></div>
                            <span className="text-[8px] font-mono tracking-[0.3em] uppercase opacity-50">Identity Verified</span>
                        </div>
                    </div>
                </div>
            )}


            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-20">
                <div className="flex flex-col">
                    <span className="text-[8px] text-cyan-400 font-mono tracking-[0.3em] uppercase opacity-50">System Status</span>
                    <span className="text-[10px] text-white font-black tracking-widest uppercase">Live Preview v4.0</span>
                </div>
                <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></div>
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse delay-75"></div>
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse delay-150"></div>
                </div>
            </div>
        </div>
    );
};

const ShopScreen: React.FC = () => {
    const { score, buyItem, closeShop, hasDoubleJump, hasImmortality, unlockedCharacters, selectedCharacter, selectCharacter, maxLives, heartPowerLevel, unlockedColors, selectedColor, selectColor, unlockedAccessories, selectedAccessory, selectAccessory } = useStore();
    const storeState = useStore();
    const [activeTab, setActiveTab] = useState<'UPGRADE' | 'COLOR' | 'ACCESSORY'>('UPGRADE');
    const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);

    const getDynamicCost = (item: ShopItem) => {
        if (item.id === 'MAX_LIFE') return item.cost * Math.pow(2, maxLives - 3);
        if (item.id === 'HEART_POWER') return item.cost * Math.pow(2, heartPowerLevel - 1);
        return item.cost;
    };

    const isMaxedOut = (item: ShopItem) => {
        if (item.id === 'MAX_LIFE' && maxLives >= 6) return true;
        if (item.id === 'HEART_POWER' && heartPowerLevel >= 6) return true;
        return false;
    };

    const filteredItems = SHOP_ITEMS.filter(item => item.category === activeTab);

    const handlePurchase = (item: ShopItem) => {
        const success = buyItem(item.category as any, getDynamicCost(item), item.id);
        if (success) {
            audio.init();
        }
    };

    const isUnlocked = (item: ShopItem) => {
        if (item.category === 'UPGRADE') {
            if (item.id === 'DOUBLE_JUMP') return storeState.hasDoubleJump;
            if (item.id === 'IMMORTAL') return storeState.hasImmortality;
            if (item.id === 'MAGNET') return storeState.hasMagnet;
            if (item.id === 'SHIELD') return storeState.hasShield;
            if (item.id === 'DASH') return storeState.hasDash;
            if (item.id === 'TIME_WARP') return storeState.hasTimeWarp;
            if (item.id === 'MULTIPLIER') return storeState.hasMultiplier;
            if (item.id === 'LASER') return storeState.hasLaser;
            return false;
        }
        if (item.category === 'COLOR') return unlockedColors.includes(item.id);
        if (item.category === 'ACCESSORY') return unlockedAccessories.includes(item.id);
        if (item.category === 'CHARACTER') return unlockedCharacters.includes(item.id);
        return false;
    };

    const isSelected = (item: ShopItem) => {
        if (item.category === 'COLOR') return selectedColor === item.id;
        if (item.category === 'ACCESSORY') return selectedAccessory === item.id;
        if (item.category === 'CHARACTER') return selectedCharacter === item.id;
        return false;
    };

    return (
        <div className="absolute inset-0 bg-[#050011]/98 z-[100] text-white pointer-events-auto backdrop-blur-2xl overflow-y-auto no-scrollbar font-cyber">
             <div className="flex flex-col items-center min-h-full py-12 md:py-20 px-4 max-w-6xl mx-auto">
                 
                 <div className="flex flex-col items-center mb-12">
                    <div className="flex items-center space-x-4 mb-2">
                        <div className="p-3 bg-cyan-500/20 rounded-2xl border border-cyan-500/30">
                            <ShoppingCart className="text-cyan-400 w-8 h-8" />
                        </div>
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase italic">NEON MARKET</h2>
                    </div>
                    <div className="h-1 w-32 bg-gradient-to-r from-transparent via-cyan-500 to-transparent rounded-full shadow-[0_0_20px_cyan]"></div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
                     <div className="lg:col-span-4 space-y-6">
                         <div className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-md">
                             <h3 className="text-xs font-bold text-cyan-400 mb-4 tracking-[0.3em] uppercase">Digital Wallet</h3>
                             <div className="flex items-end space-x-2">
                                 <span className="text-4xl font-black italic">{score.toLocaleString()}</span>
                                 <span className="text-cyan-400 text-xs mb-2 font-bold">CREDITS</span>
                             </div>
                         </div>

                         <PreviewArea item={selectedItem} />

                         {selectedItem && (
                             <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white/5 border border-white/10 p-6 rounded-[32px]"
                             >
                                 <h4 className="text-xl font-black italic mb-2 text-cyan-400">{selectedItem.name}</h4>
                                 <p className="text-gray-400 text-sm leading-relaxed">{selectedItem.description}</p>
                             </motion.div>
                         )}
                     </div>

                         <div className="lg:col-span-8">
                         <div className="flex space-x-2 mb-8 bg-white/5 p-2 rounded-2xl border border-white/10">
                             {(['UPGRADE', 'COLOR', 'ACCESSORY'] as const).map(tab => (
                                 <button
                                    key={tab}
                                    onClick={() => { setActiveTab(tab); setSelectedItem(null); }}
                                    className={`flex-1 py-3 rounded-xl font-black text-xs tracking-widest transition-all ${
                                        activeTab === tab 
                                        ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)]' 
                                        : 'text-white/40 hover:text-white hover:bg-white/5'
                                    }`}
                                 >
                                     {tab}S
                                 </button>
                             ))}
                         </div>

                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             {filteredItems.map(item => {
                                 const Icon = item.icon;
                                 const currentCost = getDynamicCost(item);
                                 const canAfford = score >= currentCost;
                                 const unlocked = isUnlocked(item);
                                 const active = isSelected(item);
                                 const maxed = isMaxedOut(item);
                                 const isCurrentSelection = selectedItem?.id === item.id;

                                 return (
                                     <motion.div 
                                        key={item.id}
                                        whileHover={{ scale: 1.02 }}
                                        onClick={() => setSelectedItem(item)}
                                        className={`relative p-6 rounded-3xl border-2 cursor-pointer transition-all duration-300 ${
                                            isCurrentSelection 
                                            ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.2)]' 
                                            : 'bg-white/5 border-white/5 hover:border-white/20'
                                        }`}
                                     >
                                         <div className="flex items-start justify-between mb-4">
                                             <div className={`p-3 rounded-xl ${unlocked || maxed ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
                                                 <Icon size={24} />
                                             </div>
                                             {maxed ? (
                                                 <span className="text-[10px] font-black text-yellow-400 tracking-widest uppercase bg-yellow-400/10 px-2 py-1 rounded-md">MAXED</span>
                                             ) : unlocked && item.category !== 'UPGRADE' ? (
                                                 <span className="text-[10px] font-black text-green-400 tracking-widest uppercase bg-green-400/10 px-2 py-1 rounded-md">Unlocked</span>
                                             ) : (
                                                 <div className="flex items-center text-yellow-400">
                                                     <span className="text-sm font-bold">{currentCost.toLocaleString()}</span>
                                                 </div>
                                             )}
                                         </div>

                                         <h3 className="text-lg font-black italic mb-1">{item.name}</h3>
                                         
                                         {unlocked && item.category !== 'UPGRADE' ? (
                                                 <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (item.category === 'CHARACTER') selectCharacter(item.id);
                                                        if (item.category === 'COLOR') selectColor(item.id);
                                                        if (item.category === 'ACCESSORY') selectAccessory(item.id);
                                                    }}
                                                    className={`mt-4 w-full py-2 rounded-lg font-black text-[10px] tracking-[0.2em] uppercase transition-all ${
                                                        active 
                                                        ? 'bg-green-500 text-black' 
                                                        : 'bg-white/10 text-white hover:bg-white/20'
                                                    }`}
                                                 >
                                                     {active ? 'Active Unit' : 'Select Unit'}
                                                 </button>
                                         ) : maxed ? (
                                             <button 
                                                disabled
                                                className="mt-4 w-full py-3 rounded-xl font-black text-xs tracking-widest transition-all bg-yellow-500/20 text-yellow-500 cursor-not-allowed"
                                             >
                                                 MAXIMUM POWER
                                             </button>
                                         ) : (
                                             <button 
                                                onClick={(e) => { e.stopPropagation(); handlePurchase(item); }}
                                                disabled={!canAfford}
                                                className={`mt-4 w-full py-3 rounded-xl font-black text-xs tracking-widest transition-all ${
                                                    canAfford 
                                                    ? 'bg-white text-black hover:bg-cyan-400' 
                                                    : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-40'
                                                }`}
                                             >
                                                 PURCHASE DATA
                                             </button>
                                         )}
                                     </motion.div>
                                 );
                             })}
                         </div>
                     </div>
                 </div>

                 <div className="mt-16 w-full flex justify-center">
                    <button 
                        onClick={closeShop}
                        className="group flex items-center px-16 py-6 bg-white text-black font-black text-2xl rounded-2xl hover:bg-cyan-400 transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:shadow-cyan-500/30 hover:-translate-y-1 active:translate-y-0"
                    >
                        RETURN TO SECTOR <ChevronRight className="ml-3 w-8 h-8 group-hover:translate-x-2 transition-transform" />
                    </button>
                 </div>
             </div>
        </div>
    );
};

const LevelCompleteScreen: React.FC = () => {
    const { level, score, levelScore, gemsCollected, startNextLevel, setStatus, openShop, distance } = useStore();
    return (
        <div className="absolute inset-0 bg-[#050011]/95 z-[100] text-white pointer-events-auto backdrop-blur-2xl flex items-center justify-center font-cyber overflow-y-auto pt-10 pb-5 no-scrollbar">
            <div className="relative flex flex-col items-center w-[95%] max-w-xl p-5 md:p-8 bg-black/40 border-2 border-cyan-500/30 rounded-[48px] shadow-[0_0_80px_rgba(6,182,212,0.15)] animate-in zoom-in slide-in-from-bottom-10 duration-700 mx-auto">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/10 blur-3xl rounded-full translate-y-1/2 -translate-x-1/2" />

                <motion.div 
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="relative mb-4"
                >
                    <div className="absolute inset-0 bg-cyan-400 blur-3xl opacity-20 animate-pulse"></div>
                    <div className="p-4 bg-cyan-500/20 rounded-full border border-cyan-500/40 relative z-10">
                        <CheckCircle className="w-12 h-12 text-cyan-400" />
                    </div>
                </motion.div>

                <h1 className="text-2xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                    SECTOR <span className="text-cyan-400">{level}</span><br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 uppercase">Secured</span>
                </h1>
                <p className="text-cyan-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Neural_Stream_Stable</p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full mb-6">
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center group hover:bg-white/10 transition-colors">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Data Yield</span>
                        <div className="flex items-center space-x-2">
                            <span className="text-xl md:text-3xl font-black text-cyan-400 italic font-title">{levelScore.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center group hover:bg-white/10 transition-colors">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Distance</span>
                        <div className="flex items-center space-x-2">
                            <span className="text-xl md:text-3xl font-black text-white italic">{Math.floor(distance)}<span className="text-xs text-white/40 ml-1">LY</span></span>
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center group hover:bg-white/10 transition-colors">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Gem Matrix</span>
                        <div className="flex items-center space-x-2">
                            <Diamond className="w-4 h-4 text-yellow-400 mr-1" />
                            <span className="text-xl md:text-3xl font-black text-yellow-400 italic">{gemsCollected}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col w-full space-y-3">
                    <button 
                        onClick={() => { audio.init(); startNextLevel(); }}
                        className="group relative w-full py-4 md:py-5 bg-cyan-500 text-black font-black text-lg md:text-xl rounded-2xl md:rounded-3xl hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_15px_30px_rgba(6,182,212,0.3)] flex items-center justify-center overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                        NEXT SECTOR <ChevronRight className="ml-2 w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-2 transition-transform" />
                    </button>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => { audio.init(); openShop(); }}
                            className="group py-3 bg-white/5 text-white font-black text-[10px] md:text-xs rounded-2xl border border-white/10 hover:bg-white/10 hover:border-yellow-500/50 transition-all flex flex-col items-center justify-center space-y-1"
                        >
                            <ShoppingCart className="w-4 h-4 text-yellow-400 group-hover:scale-110 transition-transform" />
                            <span className="uppercase tracking-widest">Upgrade</span>
                        </button>
                        <button 
                            onClick={() => { audio.init(); setStatus(GameStatus.LEVEL_SELECT); }}
                            className="group py-3 bg-white/5 text-white font-black text-[10px] md:text-xs rounded-2xl border border-white/10 hover:bg-white/10 hover:border-cyan-500/50 transition-all flex flex-col items-center justify-center space-y-1"
                        >
                            <MapPin className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                            <span className="uppercase tracking-widest">Map</span>
                        </button>
                    </div>

                    <button 
                        onClick={() => { audio.init(); setStatus(GameStatus.MENU); }}
                        className="w-full py-4 text-white/30 hover:text-white font-black text-[10px] md:text-xs tracking-[0.4em] transition-all uppercase"
                    >
                        Disengage Neural_Link
                    </button>
                </div>
            </div>
        </div>
    );
};

export const HUD: React.FC = () => {
  const score = useStore(state => state.score);
  const levelScore = useStore(state => state.levelScore);
  const lives = useStore(state => state.lives);
  const maxLives = useStore(state => state.maxLives);
  const collectedLetters = useStore(state => state.collectedLetters);
  const status = useStore(state => state.status);
  const level = useStore(state => state.level);
  const unlockedLevels = useStore(state => state.unlockedLevels);
  const restartGame = useStore(state => state.restartGame);
  const startGame = useStore(state => state.startGame);
  const setStatus = useStore(state => state.setStatus);
  const gemsCollected = useStore(state => state.gemsCollected);
  const distance = useStore(state => state.distance);
  const targetDistance = useStore(state => state.targetDistance);
  const isImmortalityActive = useStore(state => state.isImmortalityActive);
  const speed = useStore(state => state.speed);
  const openShop = useStore(state => state.openShop);
  const effectsEnabled = useStore(state => state.effectsEnabled);
  const toggleEffects = useStore(state => state.toggleEffects);
  const soundEnabled = useStore(state => state.soundEnabled);
  const toggleSound = useStore(state => state.toggleSound);
  const pauseGame = useStore(state => state.pauseGame);
  const resumeGame = useStore(state => state.resumeGame);
  const roomId = useStore(state => state.roomId);
  const localUserId = useStore(state => state.localUserId);
  const isHost = useStore(state => state.isHost);
  const resetOnlineState = useStore(state => state.resetOnlineState);
  const onlinePlayers = useStore(state => state.onlinePlayers);

  const target = ['H', 'S', 'G', 'R', 'U', 'N'];
  
  // Ref for tracking life loss animations
  const prevLivesRef = useRef(lives);
  const [lostLifeIndex, setLostLifeIndex] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (lives < prevLivesRef.current) {
        // A life was lost!
        setLostLifeIndex(lives); // The index that just went inactive
        setTimeout(() => setLostLifeIndex(null), 1000);
    }
    prevLivesRef.current = lives;
  }, [lives]);

  const isSpectating = status === GameStatus.ONLINE && lives <= 0;

  const progress = Math.min(100, Math.max(0, (distance / targetDistance) * 100));

  const containerClass = "absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-12 z-50 overflow-hidden";

  if (status === GameStatus.SHOP) {
      return <ShopScreen />;
  }

  if (status === GameStatus.LEVEL_SELECT) {
      return <LevelSelect />;
  }

  if (status === GameStatus.LOBBY) {
      return <Multiplayer />;
  }

  if (status === GameStatus.LEVEL_COMPLETE) {
      return <LevelCompleteScreen />;
  }

  if (status === GameStatus.PAUSED) {
      return (
          <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-[200] bg-black/95 backdrop-blur-3xl pointer-events-auto"
          >
              {/* Animated Background Elements */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-500/10 blur-[150px] rounded-full animate-pulse" />
                  <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-500/10 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
                  <div className="absolute inset-0 opacity-10" 
                       style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
              </div>

              <div className="relative flex flex-col items-center max-w-xl w-full p-4 md:p-8 max-h-[90vh] overflow-y-auto no-scrollbar">
                  <motion.div 
                      initial={{ y: -30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-center mb-16 relative"
                  >
                      <div className="flex items-center justify-center space-x-4 mb-4">
                          <div className="h-[2px] w-16 bg-gradient-to-r from-transparent to-cyan-500" />
                          <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/50">
                             <Pause className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div className="h-[2px] w-16 bg-gradient-to-l from-transparent to-cyan-500" />
                      </div>
                      <h2 className="text-5xl md:text-8xl font-black text-white italic tracking-tighter uppercase drop-shadow-[0_0_40px_rgba(6,182,212,0.6)]">
                          Paused
                      </h2>
                      <p className="text-cyan-400 font-mono text-xs tracking-[0.6em] uppercase font-black mt-4 opacity-80">Neural_Link_Standby</p>
                  </motion.div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                      {/* Resume Button - Primary Action */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              resumeGame();
                          }}
                          className="md:col-span-2 group relative flex items-center justify-between p-7 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-[2rem] transition-all active:scale-95 overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.4)]"
                      >
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                          <div className="flex items-center space-x-6">
                              <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl">
                                  <Play className="w-8 h-8 text-white fill-white" />
                              </div>
                              <div className="text-left">
                                  <div className="text-3xl font-black text-white italic uppercase leading-none tracking-tight">Resume Mission</div>
                                  <div className="text-[10px] text-white/80 font-mono uppercase mt-2 font-bold tracking-widest">Re-establish_Connection</div>
                              </div>
                          </div>
                          <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                              <ChevronRight className="w-8 h-8 text-white" />
                          </div>
                      </button>

                      {/* Shop Button - The "Extra" Button */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              openShop();
                          }}
                          className="group relative flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className="p-3 bg-pink-500/20 rounded-xl group-hover:bg-pink-500/30 transition-colors">
                                  <Store className="w-6 h-6 text-pink-400" />
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-white italic uppercase leading-none">Cyber Shop</div>
                                  <div className="text-[8px] text-pink-400/60 font-mono uppercase mt-1">Acquire_Upgrades</div>
                              </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-pink-400 transition-colors" />
                      </button>

                      {/* Character Select - Another "Extra" Button */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              setStatus(GameStatus.MENU); // Usually character select is in menu
                          }}
                          className="group relative flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className="p-3 bg-indigo-500/20 rounded-xl group-hover:bg-indigo-500/30 transition-colors">
                                  <User className="w-6 h-6 text-indigo-400" />
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-white italic uppercase leading-none">Character</div>
                                  <div className="text-[8px] text-indigo-400/60 font-mono uppercase mt-1">Switch_Avatar</div>
                              </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-indigo-400 transition-colors" />
                      </button>

                      {/* Effects Toggle */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              toggleEffects();
                          }}
                          className="group relative flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className={`p-3 ${effectsEnabled ? 'bg-purple-500/20' : 'bg-red-500/20'} rounded-xl transition-colors`}>
                                  {effectsEnabled ? <Eye className="w-6 h-6 text-purple-400" /> : <EyeOff className="w-6 h-6 text-red-400" />}
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-white italic uppercase leading-none">Visuals</div>
                                  <div className="text-[8px] text-white/40 font-mono uppercase mt-1">{effectsEnabled ? 'Active' : 'Offline'}</div>
                              </div>
                          </div>
                          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${effectsEnabled ? 'bg-purple-500/40' : 'bg-white/10'}`}>
                              <motion.div 
                                  animate={{ x: effectsEnabled ? 24 : 0 }}
                                  className="w-4 h-4 bg-white rounded-full shadow-lg"
                              />
                          </div>
                      </button>

                      {/* Sound Toggle */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              toggleSound();
                          }}
                          className="group relative flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className={`p-3 ${soundEnabled ? 'bg-emerald-500/20' : 'bg-red-500/20'} rounded-xl transition-colors`}>
                                  {soundEnabled ? <Volume2 className="w-6 h-6 text-emerald-400" /> : <VolumeX className="w-6 h-6 text-red-400" />}
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-white italic uppercase leading-none">Audio</div>
                                  <div className="text-[8px] text-white/40 font-mono uppercase mt-1">{soundEnabled ? 'Active' : 'Muted'}</div>
                              </div>
                          </div>
                          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${soundEnabled ? 'bg-emerald-500/40' : 'bg-white/10'}`}>
                              <motion.div 
                                  animate={{ x: soundEnabled ? 24 : 0 }}
                                  className="w-4 h-4 bg-white rounded-full shadow-lg"
                              />
                          </div>
                      </button>

                      {/* Restart Level */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              restartGame();
                          }}
                          className="group relative flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className="p-3 bg-yellow-500/20 rounded-xl">
                                  <RefreshCw className="w-6 h-6 text-yellow-400" />
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-white italic uppercase leading-none">Restart</div>
                                  <div className="text-[8px] text-yellow-400/60 font-mono uppercase mt-1">Reload_Sector</div>
                              </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-yellow-400 transition-colors" />
                      </button>

                      {/* Confirm & Restart - The "Last" Button */}
                      <button 
                          onClick={() => {
                              audio.playClick();
                              restartGame();
                              resumeGame();
                          }}
                          className="group relative flex items-center justify-between p-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl transition-all active:scale-95"
                      >
                          <div className="flex items-center space-x-4">
                              <div className="p-3 bg-emerald-500/20 rounded-xl">
                                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                              </div>
                              <div className="text-left">
                                  <div className="text-xl font-black text-emerald-500 italic uppercase leading-none">Confirm</div>
                                  <div className="text-[8px] text-emerald-500/60 font-mono uppercase mt-1">Apply_&_Restart</div>
                              </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-emerald-500/20 group-hover:text-emerald-500 transition-colors" />
                      </button>
                  </div>

                  {/* Stats Summary */}
                  <div className="mt-12 w-full grid grid-cols-3 gap-4 p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
                      <div className="text-center">
                          <div className="text-[10px] text-white/30 uppercase font-mono mb-1 tracking-widest">Score</div>
                          <div className="text-2xl font-black text-white italic tracking-tight">{levelScore.toLocaleString()}</div>
                      </div>
                      <div className="text-center border-x border-white/10">
                          <div className="text-[10px] text-white/30 uppercase font-mono mb-1 tracking-widest">Sector</div>
                          <div className="text-2xl font-black text-cyan-400 italic tracking-tight">{level}</div>
                      </div>
                      <div className="text-center">
                          <div className="text-[10px] text-white/30 uppercase font-mono mb-1 tracking-widest">Progress</div>
                          <div className="text-2xl font-black text-white italic tracking-tight">{Math.floor(progress)}%</div>
                      </div>
                  </div>
              </div>
          </motion.div>
      );
  }

  if (status === GameStatus.LANDING) return <LandingScreen />;
  if (status === GameStatus.AUTH) return <AuthScreen />;
  if (status === GameStatus.PROFILE) return <ProfileScreen />;
  if (status === GameStatus.GUIDELINES) return <GuidelinesScreen />;
  if (status === GameStatus.PRIVACY) return <PrivacyScreen />;
  if (status === GameStatus.ABOUT) return <AboutScreen />;
  if (status === GameStatus.CONTACT) return <ContactScreen />;
  if (status === GameStatus.TERMS) return <TermsScreen />;

  if (status === GameStatus.MENU) {
      return (
          <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-[100] bg-[#050011] overflow-hidden pointer-events-auto"
          >
              <div className="scanline z-50 pointer-events-none"></div>
              
              {/* Background Glows & Grid */}
              <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]"></div>
              
              {/* Floating Particles */}
              {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-cyan-400 rounded-full pointer-events-none"
                      style={{
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                      }}
                      animate={{
                          y: [0, -100],
                          opacity: [0, 0.8, 0],
                          scale: [0, 1.5, 0]
                      }}
                      transition={{
                          duration: Math.random() * 4 + 3,
                          repeat: Infinity,
                          ease: "linear",
                          delay: Math.random() * 3
                      }}
                  />
              ))}

              <motion.div 
                  animate={{ 
                      scale: [1, 1.1, 1],
                      opacity: [0.3, 0.5, 0.3]
                  }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-cyan-600/20 rounded-full blur-[120px]"
              />
              <motion.div 
                  animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.2, 0.4, 0.2]
                  }}
                  transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/20 rounded-full blur-[120px]"
              />

              <div className="relative flex flex-col items-center max-w-7xl w-full p-4 md:p-8 text-center z-10 h-full justify-center pt-10 md:pt-40 overflow-y-auto overflow-visible overscroll-none no-scrollbar">
                
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="mb-2 md:mb-6 text-cyan-400 font-cyber text-[8px] md:text-sm tracking-[0.3em] md:tracking-[0.5em] opacity-80 uppercase"
                >
                    NEON SYNTHWAVE ODYSSEY
                </motion.div>

                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1, type: "spring", bounce: 0.5 }}
                    className="relative mt-4 md:mt-12 mb-6 md:mb-16 p-6 md:p-16 overflow-visible"
                >
                    <h1 className="text-4xl sm:text-7xl md:text-9xl font-title font-black italic tracking-normal text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-100 to-cyan-400 drop-shadow-[0_0_30px_rgba(0,255,255,0.5)] md:drop-shadow-[0_0_50px_rgba(0,255,255,0.7)] leading-[1.1] py-2 md:py-4">
                        HSG<br/><span className="text-cyan-400 drop-shadow-[0_0_15px_rgba(0,255,255,0.8)] md:drop-shadow-[0_0_25px_rgba(0,255,255,1)] tracking-widest">RUNNER</span>
                    </h1>
                </motion.div>

                <div className="flex flex-col items-center w-full max-w-[320px] md:max-w-md space-y-2 md:space-y-4">
                    <motion.button 
                      initial={{ x: -50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                      whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(34, 211, 238, 0.6)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { audio.init(); startGame(unlockedLevels); }}
                      className="w-full relative py-3 md:py-4 bg-cyan-500 text-black font-black text-lg md:text-2xl uppercase tracking-tighter rounded-xl overflow-hidden group border border-cyan-300"
                    >
                        <span className="relative z-10 flex items-center justify-center italic">
                            INITIALIZE RUN <Play className="ml-2 md:ml-3 w-4 h-4 md:w-6 md:h-6 fill-black" />
                        </span>
                        <div className="absolute inset-0 bg-white/30 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                    </motion.button>

                    <div className="flex flex-row w-full gap-2 md:gap-4">
                        <motion.button 
                          initial={{ x: -50, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ duration: 0.5, delay: 0.5 }}
                          whileHover={{ scale: 1.05, backgroundColor: "rgba(34, 211, 238, 0.1)" }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { audio.init(); setStatus(GameStatus.LEVEL_SELECT); }}
                          className="flex-1 relative py-2.5 md:py-4 bg-black/50 backdrop-blur-md border-2 border-cyan-500/30 text-cyan-400 font-black text-[10px] md:text-lg uppercase tracking-widest rounded-xl group"
                        >
                            <span className="relative z-10 flex items-center justify-center italic">
                                MAP <MapPin className="ml-1 md:ml-3 w-3 h-3 md:w-5 md:h-5" />
                            </span>
                        </motion.button>

                        <motion.button 
                          initial={{ x: 50, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ duration: 0.5, delay: 0.6 }}
                          whileHover={{ scale: 1.05, backgroundColor: "rgba(234, 179, 8, 0.1)", borderColor: "rgba(234, 179, 8, 0.8)", boxShadow: "0 0 20px rgba(234, 179, 8, 0.4)" }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { audio.init(); openShop(); }}
                          className="flex-1 relative py-2.5 md:py-4 bg-black/50 backdrop-blur-md border-2 border-yellow-500/30 text-yellow-400 font-black text-[10px] md:text-lg uppercase tracking-widest rounded-xl group transition-colors"
                        >
                            <span className="relative z-10 flex items-center justify-center italic">
                                SHOP <ShoppingCart className="ml-1 md:ml-3 w-3 h-3 md:w-5 md:h-5" />
                            </span>
                        </motion.button>
                    </div>
                    <div className="flex flex-row w-full gap-2 md:gap-4 mt-2 md:mt-4">
                        {useStore.getState().userProfile ? (
                            <motion.button 
                              initial={{ y: 50, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ duration: 0.5, delay: 0.7 }}
                              whileHover={{ scale: 1.05, backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.8)", boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)" }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => { audio.init(); setStatus(GameStatus.PROFILE); }}
                              className="flex-1 relative py-2.5 md:py-4 bg-black/50 backdrop-blur-md border-2 border-blue-500/30 text-blue-400 font-black text-[10px] md:text-lg uppercase tracking-widest rounded-xl group transition-colors"
                            >
                                <span className="relative z-10 flex items-center justify-center italic">
                                    PROFILE <User className="ml-1 md:ml-3 w-3 h-3 md:w-5 md:h-5" />
                                </span>
                            </motion.button>
                        ) : (
                            <motion.button 
                              initial={{ y: 50, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ duration: 0.5, delay: 0.7 }}
                              whileHover={{ scale: 1.05, backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.8)", boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)" }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => { audio.init(); setStatus(GameStatus.AUTH); }}
                              className="flex-1 relative py-2.5 md:py-4 bg-black/50 backdrop-blur-md border-2 border-emerald-500/30 text-emerald-400 font-black text-[10px] md:text-lg uppercase tracking-widest rounded-xl group transition-colors"
                            >
                                <span className="relative z-10 flex items-center justify-center italic">
                                    LOGIN <LogOut className="ml-1 md:ml-3 w-3 h-3 md:w-5 md:h-5" />
                                </span>
                            </motion.button>
                        )}
                        
                        <motion.button 
                          initial={{ y: 50, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ duration: 0.5, delay: 0.8 }}
                          whileHover={{ scale: 1.05, backgroundColor: "rgba(168, 85, 247, 0.1)", borderColor: "rgba(168, 85, 247, 0.8)", boxShadow: "0 0 20px rgba(168, 85, 247, 0.4)" }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { audio.init(); setStatus(GameStatus.LOBBY); }}
                          className="flex-1 relative py-2.5 md:py-4 bg-black/50 backdrop-blur-md border-2 border-purple-500/30 text-purple-400 font-black text-[10px] md:text-lg uppercase tracking-widest rounded-xl group transition-colors"
                        >
                            <span className="relative z-10 flex items-center justify-center italic">
                                ONLINE <Users className="ml-1 md:ml-3 w-3 h-3 md:w-5 md:h-5" />
                            </span>
                        </motion.button>
                    </div>
                    
                    {/* Footer Links */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 1 }}
                        className="flex flex-wrap justify-center gap-2 md:gap-4 w-full text-[8px] md:text-[10px] font-mono text-cyan-500/50 tracking-widest uppercase py-2 md:py-3 border-t border-cyan-500/20 mt-4 md:mt-6 pt-4"
                    >
                        <button onClick={() => { audio.init(); setStatus(GameStatus.ABOUT); }} className="hover:text-cyan-400 transition-colors">About Us</button>
                        <span>|</span>
                        <button onClick={() => { audio.init(); setStatus(GameStatus.GUIDELINES); }} className="hover:text-cyan-400 transition-colors">Guidelines</button>
                        <span>|</span>
                        <button onClick={() => { audio.init(); setStatus(GameStatus.PRIVACY); }} className="hover:text-cyan-400 transition-colors">Privacy</button>
                        <span>|</span>
                        <button onClick={() => { audio.init(); setStatus(GameStatus.TERMS); }} className="hover:text-cyan-400 transition-colors">Terms</button>
                        <span>|</span>
                        <button onClick={() => { audio.init(); setStatus(GameStatus.CONTACT); }} className="hover:text-cyan-400 transition-colors">Contact</button>
                    </motion.div>
                </div>

                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 1.2 }}
                    className="mt-4 md:mt-8 grid grid-cols-2 gap-4 md:gap-8 text-cyan-500/40 font-cyber text-[8px] md:text-[10px] uppercase tracking-widest"
                >
                    <div className="flex flex-col items-center">
                        <span className="mb-1 md:mb-2">STEER</span>
                        <div className="p-1.5 md:p-2 border border-cyan-500/20 rounded bg-cyan-500/5">ARROWS / SWIPE</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="mb-1 md:mb-2">JUMP</span>
                        <div className="p-1.5 md:p-2 border border-cyan-500/20 rounded bg-cyan-500/5">SPACE / UP</div>
                    </div>
                </motion.div>
              </div>
          </motion.div>
      );
  }

  if (status === GameStatus.GAME_OVER) {
      const isOnlineLoss = roomId !== null;
      const sorted = [...onlinePlayers].sort((a,b) => b.distance - a.distance);
      const isTie = isOnlineLoss && sorted.length >= 2 && sorted[0].distance === sorted[1].distance;

      return (
          <div className="absolute inset-0 bg-[#050011]/95 z-[100] text-white pointer-events-auto backdrop-blur-3xl flex items-center justify-center font-cyber overflow-y-auto pt-10 pb-5 no-scrollbar">
              <div className="relative flex flex-col items-center w-[95%] max-w-xl p-5 md:p-8 bg-black/40 border-2 border-red-500/30 rounded-[48px] shadow-[0_0_80px_rgba(239,68,68,0.15)] animate-in zoom-in duration-500 mx-auto">
                <div className="absolute top-0 left-0 w-24 h-24 bg-red-500/10 blur-3xl rounded-full -translate-y-1/2 -translate-x-1/2" />
                
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="relative mb-4"
                >
                    <div className="absolute inset-0 bg-red-500 blur-3xl opacity-20 animate-pulse"></div>
                    <div className="p-4 bg-red-500/20 rounded-full border border-red-500/40 relative z-10">
                        <Activity className="w-12 h-12 text-red-500 animate-pulse" />
                    </div>
                </motion.div>

                {isTie ? (
                    <>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                            NEURAL<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-white uppercase">Parity</span>
                        </h1>
                        <p className="text-yellow-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Synchronization_Complete</p>
                    </>
                ) : isOnlineLoss ? (
                    <>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                            MISSION<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 uppercase">Failed</span>
                        </h1>
                        <p className="text-red-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Neural_Link_Severed</p>
                    </>
                ) : (
                    <>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                            SYSTEM<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-red-400 uppercase">Critical</span>
                        </h1>
                        <p className="text-red-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Structural_Failure_Detected</p>
                    </>
                )}
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full mb-6">
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center transition-transform hover:scale-105">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Peak Dist</span>
                        <span className="text-xl md:text-3xl font-black text-cyan-400 italic">{Math.floor(distance)}<span className="text-xs text-cyan-400/40 ml-1">LY</span></span>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center transition-transform hover:scale-105">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Gems</span>
                        <div className="flex items-center">
                            <Diamond className="w-3 h-3 text-yellow-400 mr-1" />
                            <span className="text-xl md:text-3xl font-black text-yellow-400 italic">{gemsCollected}</span>
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center transition-transform hover:scale-105">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Run Yield</span>
                        <span className="text-xl md:text-3xl font-black text-white italic">{levelScore.toLocaleString()}</span>
                    </div>
                </div>

                <div className="flex flex-col w-full space-y-4">
                    {isOnlineLoss ? (
                        <OnlineResultActions />
                    ) : (
                        <>
                            <button 
                                onClick={() => { audio.init(); restartGame(); }}
                                className="group relative w-full py-5 md:py-6 bg-red-600 text-white font-black text-xl md:text-2xl rounded-2xl md:rounded-3xl hover:bg-red-500 transition-all active:scale-95 shadow-[0_20px_40px_rgba(220,38,38,0.3)] flex items-center justify-center overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                RECOVER DATA <RefreshCw className="ml-2 w-6 h-6 md:w-8 md:h-8 group-hover:rotate-180 transition-transform duration-700" />
                            </button>
                            
                            <button 
                                onClick={() => { audio.init(); setStatus(GameStatus.MENU); }}
                                className="w-full py-5 bg-white/5 text-white font-black text-sm md:text-lg rounded-2xl border border-white/10 hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
                            >
                                ABORT MISSION <LogOut className="ml-2 w-4 h-4 md:w-5 md:h-5 text-white/40" />
                            </button>
                        </>
                    )}

                    <p className="text-center text-[10px] text-white/20 italic tracking-widest uppercase mt-4">Security Lockdown Level: {level}</p>
                </div>
              </div>
          </div>
      );
  }

  if (status === GameStatus.VICTORY) {
    const isOnlineWin = roomId !== null;
    return (
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/40 via-purple-900/40 to-[#050011] z-[100] text-white pointer-events-auto backdrop-blur-3xl flex items-center justify-center font-cyber overflow-y-auto pt-10 pb-5 no-scrollbar">
            <div className="relative flex flex-col items-center w-[95%] max-w-xl p-5 md:p-8 bg-black/40 border-2 border-cyan-500/30 rounded-[48px] shadow-[0_0_100px_rgba(6,182,212,0.2)] animate-in zoom-in slide-in-from-bottom duration-1000 mx-auto">
                <div className="absolute inset-0 overflow-hidden rounded-[48px] pointer-events-none">
                    <motion.div 
                        animate={{ 
                            scale: [1, 1.1, 1],
                            opacity: [0.3, 0.5, 0.3]
                        }}
                        transition={{ duration: 5, repeat: Infinity }}
                        className="absolute -top-1/2 -right-1/2 w-full h-full bg-cyan-500/10 blur-[100px] rounded-full"
                    />
                </div>

                <motion.div 
                    initial={{ scale: 0, rotate: 180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 100, damping: 15 }}
                    className="relative mb-4"
                >
                    <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-30 animate-pulse"></div>
                    <div className="p-6 bg-yellow-400/10 rounded-full border-2 border-yellow-400 shadow-[0_0_50px_rgba(250,204,21,0.5)] relative z-10">
                        <Trophy className="w-12 h-12 text-yellow-400" />
                    </div>
                </motion.div>

                {isOnlineWin ? (
                    <>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                            VICTORY<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-cyan-400 uppercase">Confirmed</span>
                        </h1>
                        <p className="text-cyan-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Neural_Dominance_Established</p>
                    </>
                ) : (
                    <>
                        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter italic text-center leading-[0.9]">
                            ZENITH<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-white uppercase">Reached</span>
                        </h1>
                        <p className="text-cyan-400 font-mono text-[8px] md:text-[10px] mb-4 tracking-[0.6em] uppercase font-black opacity-60">Evolutionary_Milestone_Achieved</p>
                    </>
                )}
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full mb-6">
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Data Harvest</span>
                        <span className="text-xl md:text-3xl font-black text-white italic">{levelScore.toLocaleString()}</span>
                    </div>
                    <div className="bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Sector Length</span>
                        <span className="text-xl md:text-3xl font-black text-cyan-400 italic">{Math.floor(distance)}<span className="text-xs ml-1 font-normal opacity-50">LY</span></span>
                    </div>
                    <div className="col-span-2 md:col-span-1 bg-white/5 backdrop-blur-md p-4 md:p-6 rounded-[24px] border border-white/10 flex flex-col items-center">
                        <span className="text-[8px] md:text-[10px] text-white/30 mb-2 uppercase tracking-widest font-bold">Gems Synced</span>
                        <div className="flex items-center">
                            <Diamond className="w-4 h-4 text-yellow-400 mr-2" />
                            <span className="text-xl md:text-3xl font-black text-yellow-400 italic font-title">{gemsCollected}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col w-full space-y-4">
                    {isOnlineWin ? (
                        <OnlineResultActions />
                    ) : (
                        <button 
                          onClick={() => { audio.init(); setStatus(GameStatus.LEVEL_SELECT); }}
                          className="group relative w-full py-4 md:py-5 bg-cyan-500 text-black font-black text-lg md:text-xl rounded-2xl md:rounded-3xl hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_15px_30px_rgba(6,182,212,0.4)] flex items-center justify-center overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/30 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                            CHART NEW SECTOR <MapPin className="ml-2 w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
                        </button>
                    )}
                    
                    {!isOnlineWin && (
                        <button 
                            onClick={() => { audio.init(); setStatus(GameStatus.MENU); }}
                            className="w-full py-3 text-white/40 hover:text-white font-black text-[10px] md:text-xs tracking-[0.5em] transition-all uppercase"
                        >
                            Exit to Hub
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className={containerClass}>
      <Leaderboard />
      <EliminationAlerts />
      <OnlineDeathResults />
      <OnlineCountdown />
      
        {/* Spectating Banner */}
        <AnimatePresence>
            {isSpectating && (
                <motion.div 
                    className="absolute top-32 left-0 right-0 flex justify-center pointer-events-none z-[110]"
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                >
                    <div className="bg-red-600/90 text-white px-8 py-3 rounded-full font-black tracking-[0.2em] text-xl md:text-2xl shadow-[0_0_30px_rgba(255,0,0,0.6)] uppercase border-2 border-red-400 backdrop-blur-md animate-pulse">
                        Eliminated - Spectating
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

      {/* Top Header Overlay */}
        <div className="absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-[#050011] to-transparent pointer-events-none"></div>

        {/* Top HUD Section */}
        <div className="relative z-10 flex flex-col space-y-3 md:space-y-0 w-full">
            <div className="flex justify-between items-center w-full bg-black/20 backdrop-blur-md p-3 rounded-2xl border border-white/5 md:bg-transparent md:backdrop-blur-none md:p-0 md:border-none">
                <div className="flex flex-col items-center md:items-start">
                    <div className="text-2xl md:text-6xl font-black text-white italic tracking-tighter font-cyber drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] leading-none">
                        {levelScore.toLocaleString()}
                    </div>
                    <div className="text-[6px] md:text-[10px] text-cyan-400 font-black tracking-[0.2em] mt-1 uppercase opacity-80">DATA_STREAM (LEVEL)</div>
                </div>
                
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col items-end">
                        <div className="flex items-center space-x-2 md:space-x-3 mb-1 p-1.5 md:p-3 bg-white/5 rounded-xl md:rounded-2xl border border-white/10">
                            {[...Array(maxLives)].map((_, i) => (
                                <LifeUnit 
                                    key={i} 
                                    index={i}
                                    active={i < lives}
                                    wasLost={i === lostLifeIndex}
                                />
                            ))}
                        </div>
                        <div className="text-[7px] md:text-[10px] text-pink-500/70 font-cyber tracking-widest uppercase italic pr-1">BIO_CORE_LINK</div>
                    </div>

                    {/* More Menu Button / Home Button in Online */}
                    <div className="relative pointer-events-auto">
                        <button 
                            onClick={async () => {
                                audio.playClick();
                                if (status === GameStatus.ONLINE) {
                                    // Evict player from DB
                                    if (roomId && localUserId) {
                                        try {
                                            if (isHost) {
                                                await supabase.from('rooms').delete().eq('id', roomId);
                                            } else {
                                                await supabase.from('players').delete().eq('user_id', localUserId).eq('room_id', roomId);
                                                // Update count
                                                const { data: room } = await supabase.from('rooms').select('player_count').eq('id', roomId).single();
                                                if (room) {
                                                    await supabase.from('rooms').update({ player_count: Math.max(0, room.player_count - 1) }).eq('id', roomId);
                                                }
                                            }
                                        } catch (e) {
                                            console.error("Failed to evict player:", e);
                                        }
                                    }
                                    resetOnlineState();
                                } else {
                                    pauseGame();
                                }
                            }}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all active:scale-95"
                        >
                            {status === GameStatus.ONLINE ? (
                                <Home className="w-4 h-4 text-white" />
                            ) : (
                                <MoreVertical className="w-4 h-4 text-white" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Progress & Letters Container */}
            <div className="md:absolute md:top-16 md:left-1/2 md:transform md:-translate-x-1/2 flex flex-col items-center w-full md:max-w-md px-0 md:px-4 space-y-4 md:space-y-3 mt-4 md:mt-0">
                {/* Progress Bar - Hidden in Online */}
                {status !== GameStatus.ONLINE && (
                    <div className="w-full">
                        <div className="flex justify-between text-[8px] md:text-[10px] text-cyan-400 font-mono mb-1.5 px-1 tracking-widest uppercase font-black">
                            <span className="flex items-center"><MapPin className="w-2 h-2 mr-1" /> Sector {level}</span>
                            <span>{Math.floor(progress)}%</span>
                        </div>
                        <div className="h-2 bg-black/60 border border-cyan-500/20 rounded-full overflow-hidden backdrop-blur-xl">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                            />
                        </div>
                    </div>
                )}

                {/* Letters */}
                {status !== GameStatus.ONLINE && (
                    <div className="flex space-x-2 md:space-x-4">
                        {target.map((char, idx) => {
                            const isCollected = collectedLetters.includes(idx);
                            const color = GEMINI_COLORS[idx];

                            return (
                                <motion.div 
                                    key={idx}
                                    animate={isCollected ? { scale: [1, 1.2, 1] } : {}}
                                    style={{
                                        borderColor: isCollected ? color : 'rgba(255, 255, 255, 0.1)',
                                        color: isCollected ? '#000' : 'rgba(255, 255, 255, 0.2)',
                                        boxShadow: isCollected ? `0 0 200px ${color}` : 'none',
                                        backgroundColor: isCollected ? color : 'rgba(0, 0, 0, 0.6)'
                                    }}
                                    className={`w-7 h-9 md:w-12 md:h-14 flex items-center justify-center border-2 font-black text-lg md:text-2xl italic font-cyber rounded-lg md:rounded-xl transition-all duration-500`}
                                >
                                    {char}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {isImmortalityActive && (
             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 md:top-48 text-white font-black text-lg md:text-2xl italic tracking-tighter animate-pulse flex items-center bg-cyan-500 px-4 md:px-6 py-2 rounded-lg shadow-[0_0_30px_rgba(6,182,212,0.6)] z-20">
                 <Shield className="mr-2 fill-white w-4 h-4 md:w-6 md:h-6" /> PHASE_SHIFT_ACTIVE
             </div>
        )}

        {/* Bottom Details */}
        <div className="w-full flex flex-row justify-between items-end relative z-10 px-2 md:px-0">
             <div className="flex flex-col text-white/40 font-cyber text-[7px] md:text-[10px] uppercase tracking-[0.2em] bg-black/20 backdrop-blur-sm p-2 rounded-xl border border-white/5 md:bg-transparent md:backdrop-blur-none md:p-0 md:border-none max-w-[45%]">
                 <div className="flex items-center space-x-1.5 mb-1 md:mb-1.5">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping shadow-[0_0_10px_rgba(34,197,94,0.8)]"></span>
                    <span className="text-white/80 font-black truncate">ACTIVE</span>
                 </div>
                 <div className="flex flex-col space-y-0.5 md:space-y-0 md:flex-row md:space-x-4">
                    <div className="flex items-center truncate"><MapPin className="w-2 h-2 mr-1 text-cyan-400" /> {Math.round(distance)}LY</div>
                    <span className="hidden md:inline opacity-20">|</span>
                    <div className="hidden md:flex items-center"><Trophy className="w-2.5 h-2.5 mr-1 text-yellow-400" /> {targetDistance}LY</div>
                 </div>
             </div>

             <div className="flex items-center space-x-2 bg-gradient-to-br from-black/80 to-black/40 backdrop-blur-xl px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl border border-white/10 shadow-2xl group">
                 <Zap className="w-4 h-4 md:w-6 md:h-6 text-yellow-400 animate-pulse group-hover:scale-110 transition-transform" />
                 <div className="flex flex-col md:flex-row md:items-center md:space-x-3">
                    <span className="text-[6px] md:text-[9px] text-yellow-400/50 font-black tracking-[0.3em] uppercase hidden md:block">Thrust_Output</span>
                    <span className="font-cyber font-black text-sm md:text-2xl italic text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                        {Math.round((speed / RUN_SPEED_BASE) * 100)}<span className="text-[10px] ml-0.5 opacity-50">%</span>
                    </span>
                 </div>
             </div>
        </div>
    </div>
  );
};
