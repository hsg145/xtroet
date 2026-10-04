import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, FileText, ShieldCheck, Info, Mail, BookOpen } from 'lucide-react';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { audio } from '../System/Audio';

interface PageProps {
    title: string;
    icon: any;
    content: React.ReactNode;
}

const BasePage: React.FC<PageProps> = ({ title, icon: Icon, content }) => {
    const { setStatus } = useStore();

    return (
        <div className="absolute inset-0 bg-[#050011]/98 z-[200] flex flex-col items-center p-4 md:p-12 backdrop-blur-3xl font-cyber pointer-events-auto text-white overflow-y-auto custom-scrollbar">
            <div className="w-full max-w-4xl relative">
                <button 
                    onClick={() => { audio.init(); setStatus(GameStatus.MENU); }}
                    className="absolute top-0 left-0 flex items-center text-white/50 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-6 h-6 mr-2" /> 
                    <span className="font-bold tracking-widest text-xs uppercase">Menu</span>
                </button>

                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-16 bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 relative overflow-hidden"
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>
                    
                    <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-8">
                        <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/30">
                            <Icon className="w-8 h-8 text-cyan-400" />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase">
                            {title}
                        </h2>
                    </div>

                    <div className="prose prose-invert max-w-none prose-headings:font-black prose-headings:italic prose-headings:uppercase prose-a:text-cyan-400">
                        {content}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export const GuidelinesScreen = () => (
    <BasePage 
        title="Guidelines" 
        icon={BookOpen}
        content={
            <div className="space-y-6 text-gray-300 leading-relaxed">
                <p>Welcome to HSG Runner! Here are the core directives for survival in the neon grid:</p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Movement:</strong> Use arrow keys or swipe to navigate between the 3 primary lanes.</li>
                    <li><strong>Jumping:</strong> Press UP to jump over ground obstacles.</li>
                    <li><strong>Collection:</strong> Gather glowing data crystals (points) and collect the letters H-S-G-R-U-N to complete the level.</li>
                    <li><strong>Survival:</strong> Avoid red-glowing obstacles. Hitting them reduces your core integrity (lives).</li>
                    <li><strong>Upgrades:</strong> Visit the Neon Market to spend your credits on permanent upgrades and new character avatars.</li>
                </ul>
            </div>
        }
    />
);

export const PrivacyScreen = () => (
    <BasePage 
        title="Privacy Policy" 
        icon={ShieldCheck}
        content={
            <div className="space-y-6 text-gray-300 leading-relaxed">
                <p>Your privacy in the digital realm is our top priority.</p>
                <h3 className="text-xl text-white">Data Collection</h3>
                <p>We only collect essential data required to maintain your game progress, including your username, high scores, inventory, and Google authentication identifier (if used).</p>
                <h3 className="text-xl text-white">Data Usage</h3>
                <p>Your data is used strictly for saving your game state and populating the global leaderboards. We do not sell your data to third-party megacorporations.</p>
                <h3 className="text-xl text-white">Security</h3>
                <p>All data is encrypted and securely stored in our Supabase backend infrastructure.</p>
            </div>
        }
    />
);

export const AboutScreen = () => (
    <BasePage 
        title="About Us" 
        icon={Info}
        content={
            <div className="space-y-6 text-gray-300 leading-relaxed">
                <p>HSG Runner was forged in the neon-lit depths of the digital underground.</p>
                <p>We are a team of passionate developers dedicated to bringing retro-futuristic arcade experiences to the modern web. Our mission is to create games that look stunning, feel responsive, and push the boundaries of what's possible in browser-based 3D engines.</p>
                <p>Powered by React Three Fiber, Zustand, and Supabase.</p>
            </div>
        }
    />
);

export const ContactScreen = () => (
    <BasePage 
        title="Contact Us" 
        icon={Mail}
        content={
            <div className="space-y-6 text-gray-300 leading-relaxed text-center py-12">
                <p className="text-xl">Transmission encrypted. Awaiting input.</p>
                <p>Reach out to the dev team on our secure channels:</p>
                <div className="text-cyan-400 font-mono text-2xl mt-8 tracking-widest">
                    support@hsgrunner.com
                </div>
            </div>
        }
    />
);

export const TermsScreen = () => (
    <BasePage 
        title="Terms of Use" 
        icon={FileText}
        content={
            <div className="space-y-6 text-gray-300 leading-relaxed">
                <p>By accessing the HSG Runner network, you agree to the following terms:</p>
                <ul className="list-decimal pl-5 space-y-2">
                    <li><strong>Fair Play:</strong> Exploiting glitches, using automated bots, or hacking the game engine is strictly prohibited and will result in immediate neural ban.</li>
                    <li><strong>Account Responsibility:</strong> You are responsible for maintaining the security of your account credentials.</li>
                    <li><strong>Service Availability:</strong> We do our best to maintain 99.9% uptime, but the grid can be unpredictable. We are not liable for lost game progress due to server outages.</li>
                    <li><strong>Modifications:</strong> We reserve the right to update these terms as the game evolves.</li>
                </ul>
            </div>
        }
    />
);
