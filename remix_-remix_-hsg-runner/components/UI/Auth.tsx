import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, LogIn, UserPlus, Gamepad2, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabase';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { audio } from '../System/Audio';

export const AuthScreen: React.FC = () => {
    const { setStatus, setSession, setUserProfile } = useStore();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleAuth = async () => {
        setLoading(true);
        setError(null);
        audio.init();
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message || 'An error occurred during Google Sign In');
        } finally {
            setLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        audio.init();

        try {
            if (isLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                // Session listener in App.tsx will handle the rest
            } else {
                if (!username.trim()) throw new Error('Username is required');
                
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username: username,
                        }
                    }
                });
                if (error) throw error;
                
                if (data.user) {
                    // Create profile immediately for signups (if not handled by Supabase triggers)
                    const { error: profileError } = await supabase.from('profiles').insert([
                        {
                            id: data.user.id,
                            username: username,
                            points: 0,
                            current_level: 1,
                            current_map: 1,
                        }
                    ]);
                    if (profileError) throw profileError;
                }
                
                setIsLogin(true);
                setError('Registration successful! Please login.');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-[#050011]/98 z-[200] flex items-center justify-center p-4 backdrop-blur-3xl font-cyber pointer-events-auto text-white overflow-y-auto">
            <div className="absolute top-4 left-4 z-50">
                <button 
                    onClick={() => { audio.init(); setStatus(GameStatus.LANDING); }}
                    className="flex items-center text-white/50 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 mr-2" /> 
                    <span className="font-bold tracking-widest text-xs uppercase">Back</span>
                </button>
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-[32px] shadow-[0_0_50px_rgba(6,182,212,0.1)] relative overflow-hidden flex flex-col md:flex-row my-auto"
            >
                {/* Left Column - Branding & Google Auth */}
                <div className="w-full md:w-1/2 p-8 md:p-12 border-t md:border-t-0 md:border-r border-white/10 relative overflow-hidden bg-black/40 flex flex-col justify-between order-2 md:order-1">
                    {/* Neon Accents */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent"></div>
                    <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
                    
                    <div className="relative z-10 mb-8 md:mb-0 hidden md:block">
                        <div className="w-16 h-16 bg-purple-500/10 rounded-2xl border border-purple-500/30 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                            <Gamepad2 className="w-8 h-8 text-purple-400" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase mb-4 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            WELCOME TO<br/><span className="text-purple-400">THE GRID</span>
                        </h2>
                        <p className="text-sm text-gray-400 leading-relaxed font-mono">
                            Sync your neural link. Save your progress across devices. Dominate the global leaderboards with ease.
                        </p>
                    </div>

                    <div className="relative z-10 mt-4 md:mt-0">
                        {/* Mobile Divider */}
                        <div className="relative my-6 md:hidden">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-black/80 px-4 text-white/40 uppercase tracking-[0.2em] rounded-full">Or Sync With</span>
                            </div>
                        </div>

                        <p className="text-[10px] text-white/50 uppercase tracking-widest mb-4 hidden md:flex items-center">
                            <span className="w-8 h-px bg-white/20 mr-2"></span>
                            Fast Access
                        </p>
                        <button 
                            type="button"
                            onClick={handleGoogleAuth}
                            disabled={loading}
                            className="w-full bg-white text-black hover:bg-gray-200 font-bold py-4 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        >
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            GOOGLE PROTOCOL
                        </button>
                    </div>
                </div>

                {/* Right Column - Email/Password Form */}
                <div className="w-full md:w-1/2 p-8 md:p-12 relative order-1 md:order-2">
                    <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-transparent via-cyan-500 to-transparent"></div>
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    {/* Mobile Only Logo & Welcome */}
                    <div className="relative z-10 mb-8 md:hidden">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl border border-purple-500/30 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                                <Gamepad2 className="w-8 h-8 text-purple-400" />
                            </div>
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                                WELCOME TO<br/><span className="text-purple-400">THE GRID</span>
                            </h2>
                            <p className="text-xs text-gray-400 leading-relaxed font-mono px-4">
                                Sync your neural link. Save your progress across devices.
                            </p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase text-cyan-400">
                            {isLogin ? 'SYSTEM LOGIN' : 'CREATE ID'}
                        </h2>
                        <p className="text-xs text-white/40 tracking-[0.2em] mt-1 uppercase">
                            Manual Access Protocol
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6 flex items-start space-x-3"
                            >
                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-200">{error}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleEmailAuth} className="space-y-4 relative z-10">
                        {!isLogin && (
                            <div className="space-y-1">
                                <label className="text-[10px] text-white/50 uppercase tracking-widest ml-1">Username</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                        <UserPlus className="w-5 h-5 text-white/30" />
                                    </div>
                                    <input 
                                        type="text" 
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-white/20"
                                        placeholder="Enter your runner tag"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] text-white/50 uppercase tracking-widest ml-1">Email</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                    <Mail className="w-5 h-5 text-white/30" />
                                </div>
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-white/20"
                                    placeholder="Enter email"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-white/50 uppercase tracking-widest ml-1">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-white/30" />
                                </div>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-white/20"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-black py-4 rounded-xl flex items-center justify-center transition-all uppercase tracking-widest mt-6 disabled:opacity-50 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                        >
                            {loading ? 'Processing...' : (isLogin ? 'Initialize' : 'Register')}
                            {!loading && <LogIn className="w-5 h-5 ml-2" />}
                        </button>
                    </form>

                    <div className="mt-8 text-center relative z-10">
                        <button 
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-cyan-400 hover:text-cyan-300 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                            {isLogin ? 'Request New Access Card' : 'Return to Login Portal'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
