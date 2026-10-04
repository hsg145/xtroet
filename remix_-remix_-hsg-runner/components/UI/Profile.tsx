import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, User, Star, MapPin, Target, Trophy, LogOut } from 'lucide-react';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { supabase } from '../../supabase';
import { audio } from '../System/Audio';

export const ProfileScreen: React.FC = () => {
    const { setStatus, userProfile, score, level, mapId, setSession, setUserProfile } = useStore();
    
    const handleLogout = async () => {
        audio.init();
        await supabase.auth.signOut();
        setSession(null);
        setUserProfile(null);
        setStatus(GameStatus.MENU);
    };

    if (!userProfile) {
        return (
            <div className="absolute inset-0 bg-[#050011]/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-3xl font-cyber text-white">
                <h2 className="text-2xl text-red-500 mb-4">No Profile Found</h2>
                <button 
                    onClick={() => setStatus(GameStatus.MENU)}
                    className="bg-white/10 px-6 py-2 rounded-xl"
                >
                    Back to Menu
                </button>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-[#050011]/98 z-[200] flex items-center justify-center p-4 backdrop-blur-3xl font-cyber pointer-events-auto text-white">
            <div className="absolute top-4 left-4">
                <button 
                    onClick={() => { audio.init(); setStatus(GameStatus.MENU); }}
                    className="flex items-center text-white/50 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 mr-2" /> 
                    <span className="font-bold tracking-widest text-xs uppercase">Menu</span>
                </button>
            </div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-[40px] p-8 relative overflow-hidden"
            >
                {/* Background FX */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)]"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>

                <div className="relative flex flex-col md:flex-row items-center gap-8 mb-12">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border-4 border-cyan-500/50 p-1 flex items-center justify-center bg-black/50 overflow-hidden relative z-10">
                            {userProfile.avatar_url ? (
                                <img src={userProfile.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-16 h-16 text-cyan-400" />
                            )}
                        </div>
                        <div className="absolute -inset-4 bg-cyan-500/20 rounded-full blur-2xl z-0 animate-pulse"></div>
                    </div>

                    <div className="flex-1 text-center md:text-left z-10">
                        <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                            {userProfile.username}
                        </h2>
                        <div className="flex items-center justify-center md:justify-start gap-2 mt-2 text-cyan-400">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-xs uppercase tracking-[0.3em] font-bold">Online</span>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleLogout}
                        className="p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-2xl text-red-400 transition-all z-10 group"
                        title="Sign Out"
                    >
                        <LogOut className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 z-10 relative">
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-6 flex flex-col items-center">
                        <Star className="w-8 h-8 text-yellow-400 mb-2 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                        <span className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Total Credits</span>
                        <span className="text-3xl font-black italic text-white">{score.toLocaleString()}</span>
                    </div>
                    
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-6 flex flex-col items-center">
                        <Trophy className="w-8 h-8 text-cyan-400 mb-2 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                        <span className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Current Level</span>
                        <span className="text-3xl font-black italic text-white">{level}</span>
                    </div>

                    <div className="bg-black/40 border border-white/5 rounded-3xl p-6 flex flex-col items-center">
                        <MapPin className="w-8 h-8 text-purple-400 mb-2 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
                        <span className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Current Map</span>
                        <span className="text-3xl font-black italic text-white">{mapId}</span>
                    </div>
                </div>
                
                <div className="mt-8 text-center opacity-50 z-10 relative">
                    <p className="text-[10px] uppercase tracking-widest font-mono">ID: {userProfile.id}</p>
                </div>
            </motion.div>
        </div>
    );
};
