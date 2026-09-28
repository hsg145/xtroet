import React, { useState, useEffect, useRef } from 'react';
import { DiscordIcon, YoutubeIcon } from './Icons';
import { Language } from '../types';

interface DiscordData {
   name: string;
   instant_invite: string;
   presence_count: number;
   members: Array<{
      username: string;
      avatar_url: string;
      status: string;
      game?: {
         name: string;
      };
   }>;
   channels: Array<{
      id: string;
      name: string;
   }>;
}

interface YoutubeData {
   title: string;
   link: string;
   date: string;
   thumbnail: string;
}

interface CommunityWidgetsProps {
   lang: Language;
}

/* ============ 3D tilt engine (pointer-fine only, GPU transforms) ============ */
function useTilt(max = 9) {
   const ref = useRef<HTMLDivElement>(null);
   const fine = useRef(false);
   const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 20, on: false });
   useEffect(() => {
      fine.current =
         window.matchMedia('(pointer: fine)').matches &&
         !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   }, []);
   const move = (e: React.PointerEvent) => {
      if (!fine.current || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      setTilt({ ry: (px - 0.5) * max * 2, rx: (0.5 - py) * max * 2, gx: px * 100, gy: py * 100, on: true });
   };
   const leave = () => setTilt((s) => ({ ...s, rx: 0, ry: 0, on: false }));
   return { ref, tilt, move, leave };
}

const tiltStyle = (tilt: { rx: number; ry: number; on: boolean }): React.CSSProperties => ({
   transform: `perspective(1100px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.on ? 1.015 : 1})`,
   transition: tilt.on ? 'transform 0.12s ease-out' : 'transform 0.6s cubic-bezier(0.16,1,0.3,1)',
   transformStyle: 'preserve-3d',
   willChange: 'transform',
});

const CardSkeleton: React.FC<{ glow: string }> = ({ glow }) => (
   <div className="w-full rounded-[26px] border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl p-5 animate-pulse" aria-hidden="true">
      <div className="h-20 rounded-2xl bg-white/[0.06]" />
      <div className="flex items-center gap-3 mt-4">
         <div className="w-14 h-14 rounded-2xl" style={{ background: glow }} />
         <div className="flex-1">
            <div className="h-4 rounded-lg bg-white/10 w-2/3" />
            <div className="h-3 rounded-lg bg-white/[0.07] w-1/3 mt-2" />
         </div>
      </div>
      <div className="h-12 rounded-2xl bg-white/[0.06] mt-4" />
   </div>
);

/* ============================ DISCORD — T×M×F×X (Firas official) ============================
   Live guild data, refreshed every 60s:
     1) Server widget API (rich: online members, games, channels, invite)
     2) Invite API fallback (online + total members, always public) */
const DISCORD_GUILD_ID = '1210891850433691668';
const DISCORD_INVITE_CODE = 'tmfx';
const DISCORD_JOIN_URL = 'https://discord.gg/tmfx';

interface DiscordLive {
   name: string;
   invite: string;
   online: number;
   total: number | null;
   icon: string | null;
   members: DiscordData['members'];
}

export const DiscordWidget: React.FC<CommunityWidgetsProps> = ({ lang }) => {
   const [data, setData] = useState<DiscordLive | null>(null);
   const [loading, setLoading] = useState(true);
   const { ref, tilt, move, leave } = useTilt(9);
   const isRTL = lang === 'ar';

   useEffect(() => {
      let dead = false;
      const fetchDiscord = async () => {
         // 1) rich widget
         try {
            const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
            if (res.ok) {
               const json: DiscordData = await res.json();
               if (!dead && json && typeof json.presence_count === 'number') {
                  setData({
                     name: json.name || 'T × M × F × X',
                     invite: json.instant_invite || DISCORD_JOIN_URL,
                     online: json.presence_count,
                     total: null,
                     icon: null,
                     members: Array.isArray(json.members) ? json.members : [],
                  });
                  setLoading(false);
                  return;
               }
            }
            throw new Error('widget unavailable');
         } catch {
            // 2) public invite fallback — always live counts
            try {
               const res = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE_CODE}?with_counts=true`);
               if (!res.ok) throw new Error(`HTTP ${res.status}`);
               const inv = await res.json();
               if (dead) return;
               const iconHash = inv?.guild?.icon as string | undefined;
               setData({
                  name: inv?.guild?.name || 'T × M × F × X',
                  invite: DISCORD_JOIN_URL,
                  online: Number(inv?.approximate_presence_count) || 0,
                  total: Number(inv?.approximate_member_count) || null,
                  icon: iconHash
                     ? `https://cdn.discordapp.com/icons/${DISCORD_GUILD_ID}/${iconHash}.png?size=128`
                     : null,
                  members: [],
               });
            } catch (err) {
               console.error('Discord fetch error:', err);
            } finally {
               if (!dead) setLoading(false);
            }
         }
      };
      fetchDiscord();
      const interval = setInterval(fetchDiscord, 60000);
      return () => { dead = true; clearInterval(interval); };
   }, []);

   if (loading || !data) return <CardSkeleton glow="rgba(88,101,242,0.25)" />;

   const activeMembers = data.members.filter((m: any) => m.game);
   const squad = data.members.slice(0, 6);
   const extra = Math.max(0, data.online - squad.length);
   const crest = data.icon || '/firas-mark.webp';

   return (
      <div className="perspective-1000 h-full">
         <div
            ref={ref}
            onPointerMove={move}
            onPointerLeave={leave}
            style={tiltStyle(tilt)}
            className="group relative h-full rounded-[26px] p-[1.5px] bg-gradient-to-b from-[#5865F2]/70 via-[#5865F2]/15 to-white/[0.06] shadow-[0_24px_70px_-20px_rgba(88,101,242,0.45)]"
         >
            <div className="relative h-full rounded-[24.5px] bg-[#0a0b16]/95 backdrop-blur-xl overflow-hidden flex flex-col">
               {/* pointer glare */}
               <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-10"
                  style={{
                     opacity: tilt.on ? 1 : 0,
                     background: `radial-gradient(420px circle at ${tilt.gx}% ${tilt.gy}%, rgba(88,101,242,0.22), transparent 65%)`,
                  }}
               />
               {/* color bleed — banner tones wash down the whole card, no boundary */}
               <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  <img
                     src="/discord-banner.png"
                     alt=""
                     className="absolute top-0 inset-x-0 h-[48%] w-full object-cover blur-3xl opacity-30"
                     style={{ maskImage: 'linear-gradient(to bottom, black 25%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 25%, transparent 100%)' }}
                  />
               </div>
               {/* orbiting halo */}
               <div className="absolute -top-24 start-1/4 w-72 h-72 rounded-full bg-[#5865F2]/25 blur-[90px] animate-aurora pointer-events-none" />
               {/* banner — single seamless melt, no edge lines */}
               <div className="relative h-28 sm:h-32 overflow-hidden shrink-0">
                  <img
                     src="/discord-banner.png"
                     alt="T × M × F × X community banner"
                     className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-[2.5s] ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#0a0b16]/50 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#0a0b16] via-[#0a0b16]/55 to-transparent" />
                  <span className="absolute top-3 start-3 inline-flex items-center gap-2 px-3 py-1.5 bg-black/55 backdrop-blur border border-white/15 text-white/85">
                     <span className="led bg-green-400 animate-pulse shadow-[0_0_8px_#4ade80]" />
                     <span className="kicker" dir="ltr">Discord // Live</span>
                  </span>
                  <span className="cut-tag absolute top-3 end-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5865F2]/25 backdrop-blur border border-[#5865F2]/50 text-[10px] font-black tracking-[0.2em] text-white" dir="ltr">
                     TMFX
                  </span>
               </div>
                {/* crest + title — straddles the melt */}
                <div className="relative px-5 -mt-10 flex items-end gap-3.5">
                   <div aria-hidden="true" className="absolute -top-8 inset-x-8 h-14 bg-[#5865F2]/15 blur-2xl pointer-events-none" />
                   <div className="relative shrink-0" style={{ transform: 'translateZ(45px)' }}>
                      <div className="absolute -inset-3 bg-[#5865F2]/50 blur-2xl opacity-40 group-hover:opacity-80 transition-opacity duration-500 rounded-full" />
                      <div className="relative w-[72px] h-[72px] rounded-[22px] overflow-hidden border-2 border-[#5865F2]/60 ring-4 ring-[#0a0b16]/90 bg-[#0a0b16] shadow-[0_16px_36px_rgba(0,0,0,0.65)] transition-transform duration-500 group-hover:rotate-6 group-hover:scale-105">
                        <img src={crest} alt="T × M × F × X Discord server" className="w-full h-full object-cover" />
                     </div>
                     <span className="absolute -bottom-1 -end-1 w-5 h-5 rounded-full bg-green-400 border-4 border-[#0a0b16] animate-pulse" />
                  </div>
                  <div className="min-w-0 pb-1">
                     <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-none" dir="ltr">{data.name}</h3>
                     <p className="text-[11px] text-white/45 font-bold mt-1">
                        {lang === 'en' ? 'Firas official community' : 'مجتمع فراس الرسمي'}
                        {data.total ? <span className="text-white/30" dir="ltr"> • {data.total.toLocaleString('en-US')}</span> : null}
                     </p>
                  </div>
                  <p className="ms-auto text-end shrink-0 pb-1">
                     <span className="jersey block text-3xl sm:text-4xl text-white leading-none" dir="ltr">{data.online.toLocaleString('en-US')}</span>
                     <span className="kicker block text-[#8b96ff] mt-1">{lang === 'en' ? 'online' : 'متصل'}</span>
                  </p>
               </div>
               {/* squad — fused into the flow */}
               <div className="px-5 mt-4 relative">
                  <p className="kicker text-white/30 mb-2" dir="ltr">// Squad frequency</p>
                  <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] p-3.5 flex items-center gap-3">
                     {squad.length > 0 ? (
                        <>
                           <div className="flex -space-x-2.5 rtl:space-x-reverse shrink-0">
                              {squad.map((m: any, i: number) => (
                                 <img
                                    key={i}
                                    src={m.avatar_url}
                                    alt={m.username}
                                    loading="lazy"
                                    className="w-9 h-9 rounded-full border-2 border-[#0a0b16] bg-white/10 object-cover transition-transform duration-300 hover:scale-125 hover:-translate-y-1 hover:z-10 relative"
                                    style={{ zIndex: squad.length - i }}
                                 />
                              ))}
                              {extra > 0 && (
                                 <span className="w-9 h-9 rounded-full border-2 border-[#0a0b16] bg-[#5865F2] flex items-center justify-center text-[10px] font-black text-white" dir="ltr">+{extra}</span>
                              )}
                           </div>
                           <div className="min-w-0 flex-1">
                              {activeMembers.length > 0 ? (
                                 <>
                                    <p className="text-[9px] font-black tracking-[0.25em] text-green-400 uppercase flex items-center gap-1.5">
                                       <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                       {lang === 'en' ? 'now playing' : 'يلعب الآن'}
                                    </p>
                                    <p className="text-[13px] font-black text-white truncate mt-0.5">
                                       {activeMembers[0].username} <span className="text-white/35 font-bold">• {activeMembers[0].game.name}</span>
                                    </p>
                                 </>
                              ) : (
                                 <>
                                    <p className="text-[9px] font-black tracking-[0.25em] text-white/35 uppercase">{lang === 'en' ? 'squad standby' : 'الفرقة في الانتظار'}</p>
                                    <p className="text-[13px] font-bold text-white/60 truncate mt-0.5">{lang === 'en' ? 'Be the first to deploy' : 'كن أول المنضمين'}</p>
                                 </>
                              )}
                           </div>
                        </>
                     ) : (
                        <>
                           <span className="relative w-11 h-11 rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/40 flex items-center justify-center shrink-0">
                              <DiscordIcon className="w-6 h-6 text-[#8b96ff]" />
                           </span>
                           <div className="min-w-0 flex-1">
                              <p className="text-[9px] font-black tracking-[0.25em] text-green-400 uppercase flex items-center gap-1.5">
                                 <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                 {lang === 'en' ? 'live fortress' : 'القلعة حيّة'}
                              </p>
                              <p className="text-[13px] font-black text-white truncate mt-0.5" dir="ltr">
                                 {data.online.toLocaleString('en-US')} <span className="text-white/35 font-bold">{lang === 'en' ? 'online' : 'متصل'}</span>
                                 {data.total ? <span className="text-white/60 font-black"> • {data.total.toLocaleString('en-US')} {lang === 'en' ? 'members' : 'عضو'}</span> : null}
                              </p>
                           </div>
                        </>
                     )}
                  </div>
               </div>
               {/* CTA */}
               <div className="px-5 pb-5 mt-4 flex-1 flex items-end">
                  <a
                     href={data.invite}
                     target="_blank"
                     rel="noopener noreferrer"
                     aria-label={lang === 'en' ? 'Join Discord server' : 'انضم لسيرفر الديسكورد'}
                     className="btn-arena card-sheen cut-btn relative w-full min-h-[54px] inline-flex items-center justify-center gap-2.5 bg-gradient-to-b from-[#7b86ff] to-[#5865F2] text-white font-black text-sm tracking-wide shadow-[0_14px_36px_-10px_rgba(88,101,242,0.7)] overflow-hidden"
                  >
                     <DiscordIcon className="w-5 h-5 shrink-0" />
                     {lang === 'en' ? 'JOIN THE SQUAD' : 'انضم للفرقة الآن'}
                     <svg className={`w-4 h-4 shrink-0 ${isRTL ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </a>
               </div>
            </div>
         </div>
      </div>
   );
};

/* ============================ YOUTUBE — LEVEL ONE CLAN (Firas clan) ============================
   Live channel data, refreshed every 5 minutes:
     • Latest video  → YouTube RSS feed (public, no key)
     • Subscribers   → Mixerno counter, Piped fallback */
const CLAN_CHANNEL_ID = 'UCD7EpD4o6bw24c5o5vu4hGQ';
const CLAN_CHANNEL_URL = 'https://www.youtube.com/@leveloneclan';
const CLAN_AVATAR =
   'https://yt3.googleusercontent.com/EG_-83Wmqr7vL5GJ6qzHJqPhyrdDaApGhGByDXfPFW0CL0j5eKP4LSKr_S8DvXAN4A-uZwWNGYI=s176-c-k-c0x00ffffff-no-rj';

export const YoutubeWidget: React.FC<CommunityWidgetsProps> = ({ lang }) => {
   const [video, setVideo] = useState<YoutubeData | null>(null);
   const [subs, setSubs] = useState<string>('111K');
   const [loading, setLoading] = useState(true);
   const { ref, tilt, move, leave } = useTilt(9);
   const isRTL = lang === 'ar';
   const channelId = CLAN_CHANNEL_ID;
   const channelUrl = CLAN_CHANNEL_URL;

   useEffect(() => {
      let dead = false;
      const fmtSubs = (count: number) =>
         count >= 1000000 ? `${(count / 1000000).toFixed(1)}M+` : count >= 1000 ? `${(count / 1000).toFixed(1)}K+` : `${count}`;
      const fetchVideo = async () => {
         try {
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.items && data.items.length > 0) {
               const latest = data.items[0];
               if (!dead) {
                  setVideo({
                     title: latest.title,
                     link: latest.link,
                     date: new Date(latest.pubDate).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
                     thumbnail: String(latest.thumbnail || '').replace('hqdefault.jpg', 'maxresdefault.jpg')
                  });
               }
            } else {
               throw new Error('No items');
            }
         } catch (err) {
            console.error('YouTube fetch error:', err);
            if (!dead) {
               setVideo({
                  title: lang === 'en' ? 'LEVEL ONE CLAN — OFFICIAL VIDEOS' : 'كلان لفل ون — الفيديوهات الرسمية',
                  link: channelUrl,
                  date: 'LEVEL ONE',
                  thumbnail: '/youtube-banner.png'
               });
            }
         } finally {
            if (!dead) setLoading(false);
         }
      };
      const fetchSubs = async () => {
         // 1) Mixerno — exact subscriber count
         try {
            const res = await fetch(`https://mixerno.space/api/youtube-channel-counter/user/${channelId}`);
            const d = await res.json();
            const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
            const n = entry?.count;
            if (!dead && typeof n === 'number' && n > 0) { setSubs(fmtSubs(n)); return; }
         } catch {}
         // 2) Piped fallback
         try {
            const statsRes = await fetch(`https://pipedapi.kavin.rocks/channel/${channelId}`);
            const statsData = await statsRes.json();
            if (!dead && statsData.subscriberCount) setSubs(fmtSubs(statsData.subscriberCount));
         } catch (err) {
            console.warn('Subscriber fetch failed, using fallback:', err);
         }
      };
      fetchVideo();
      fetchSubs();
      const interval = setInterval(() => { fetchVideo(); fetchSubs(); }, 5 * 60 * 1000);
      return () => { dead = true; clearInterval(interval); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [lang]);

   if (loading && !video) return <CardSkeleton glow="rgba(255,0,0,0.25)" />;

   return (
      <div className="perspective-1000 h-full">
         <div
            ref={ref}
            onPointerMove={move}
            onPointerLeave={leave}
            style={tiltStyle(tilt)}
            className="group relative h-full rounded-[26px] p-[1.5px] bg-gradient-to-b from-[#C9A24B]/70 via-[#C9A24B]/15 to-white/[0.06] shadow-[0_24px_70px_-20px_rgba(201,162,75,0.45)]"
         >
            <div className="relative h-full rounded-[24.5px] bg-[#0d0505]/95 backdrop-blur-xl overflow-hidden flex flex-col">
               <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-10"
                  style={{
                     opacity: tilt.on ? 1 : 0,
                     background: `radial-gradient(420px circle at ${tilt.gx}% ${tilt.gy}%, rgba(201,162,75,0.2), transparent 65%)`,
                  }}
               />
               {/* color bleed — banner tones wash down the whole card, no boundary */}
               <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                  <img
                     src="/youtube-banner.png"
                     alt=""
                     className="absolute top-0 inset-x-0 h-[48%] w-full object-cover blur-3xl opacity-30"
                     style={{ maskImage: 'linear-gradient(to bottom, black 25%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 25%, transparent 100%)' }}
                  />
               </div>
               <div className="absolute -top-24 end-1/4 w-72 h-72 rounded-full bg-[#C9A24B]/20 blur-[90px] animate-aurora pointer-events-none" />
               {/* banner — single seamless melt, no edge lines */}
               <div className="relative h-28 sm:h-32 overflow-hidden shrink-0">
                  <img
                     src="/youtube-banner.png"
                     alt="Firas clan YouTube banner"
                     className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-[2.5s] ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#0d0505]/50 via-transparent to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#0d0505] via-[#0d0505]/55 to-transparent" />
                  <span className="absolute top-3 start-3 inline-flex items-center gap-2 px-3 py-1.5 bg-black/55 backdrop-blur border border-white/15 text-white/85">
                     <span className="led bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
                     <span className="kicker" dir="ltr">YouTube // Clan</span>
                  </span>
                  <span className="absolute top-3 end-3 inline-flex items-center gap-1.5 text-[9px] font-black tracking-[0.2em] px-2.5 py-1 rounded-full bg-[#C9A24B]/20 backdrop-blur border border-[#C9A24B]/50 text-white" dir="ltr">
                     <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B] animate-pulse" /> CLAN
                  </span>
               </div>
                {/* crest + title — straddles the melt */}
                <div className="relative px-5 -mt-10 flex items-end gap-3.5">
                   <div aria-hidden="true" className="absolute -top-8 inset-x-8 h-14 bg-[#C9A24B]/15 blur-2xl pointer-events-none" />
                   <div className="relative shrink-0" style={{ transform: 'translateZ(45px)' }}>
                      <div className="absolute -inset-3 bg-[#C9A24B]/50 blur-2xl opacity-40 group-hover:opacity-80 transition-opacity duration-500 rounded-full" />
                      <div className="relative w-[72px] h-[72px] rounded-[22px] overflow-hidden border-2 border-[#C9A24B]/60 ring-4 ring-[#0d0505]/90 bg-[#0d0505] shadow-[0_16px_36px_rgba(0,0,0,0.65)] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-105">
                        <img src={CLAN_AVATAR} alt="Level One Clan channel" className="w-full h-full object-cover"
                           onError={(e) => { const t = e.target as HTMLImageElement; if (!t.src.includes('firas-mark.webp')) t.src = '/firas-mark.webp'; }} />
                     </div>
                     <span className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-[#C9A24B] border-4 border-[#0d0505] flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                     </span>
                  </div>
                  <div className="min-w-0 pb-1">
                     <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-none" dir="ltr">LEVEL ONE CLAN</h3>
                     <p className="text-[11px] text-white/45 font-bold mt-1">{lang === 'en' ? 'Firas clan — official channel' : 'كلان فراس — القناة الرسمية'}</p>
                  </div>
                  <p className="ms-auto text-end shrink-0 pb-1">
                     <span className="jersey block text-3xl sm:text-4xl text-white leading-none" dir="ltr">{subs}</span>
                     <span className="kicker block text-[#D9C08A] mt-1">{lang === 'en' ? 'subs' : 'مشترك'}</span>
                  </p>
               </div>
               {/* latest video — fused into the flow */}
               <div className="px-5 mt-4 relative">
                  <p className="kicker text-white/30 mb-2" dir="ltr">// Latest transmission</p>
                  <a
                     href={video?.link || channelUrl}
                     target="_blank"
                     rel="noopener noreferrer"
                     aria-label={video?.title || 'Latest video'}
                     className="group/vid relative block rounded-2xl overflow-hidden border border-white/10 bg-black shadow-[0_18px_44px_-16px_rgba(201,162,75,0.35)]"
                  >
                     <div className="relative aspect-video">
                        <img
                           src={video?.thumbnail || '/youtube-banner.png'}
                           alt={video?.title || 'Latest video'}
                           loading="lazy"
                           className="w-full h-full object-cover opacity-85 group-hover/vid:opacity-100 group-hover/vid:scale-105 transition-all duration-700"
                           onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              if (target.src.includes('maxresdefault')) target.src = target.src.replace('maxresdefault', 'hqdefault');
                              else target.src = '/youtube-banner.png';
                           }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                        <span className="absolute top-2.5 start-2.5 text-[8px] font-black tracking-[0.2em] px-2 py-1 rounded-lg bg-[#C9A24B] text-white shadow-[0_0_16px_rgba(201,162,75,0.6)]">
                           {lang === 'en' ? 'LATEST' : 'الأحدث'}
                        </span>
                        <span className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/45 backdrop-blur-md border border-white/40 flex items-center justify-center transition-transform duration-300 group-hover/vid:scale-125 shadow-[0_0_28px_rgba(201,162,75,0.5)]">
                           <svg className="w-5 h-5 text-white fill-current translate-x-[1px] rtl:-translate-x-[1px] rtl:rotate-180" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        </span>
                        <span className="absolute bottom-2.5 start-2.5 end-2.5 text-[11px] sm:text-xs font-black text-white leading-snug line-clamp-2 text-start">{video?.title}</span>
                     </div>
                  </a>
               </div>
               {/* CTA */}
               <div className="px-5 pb-5 mt-4 flex-1 flex items-end">
                  <a
                     href={channelUrl}
                     target="_blank"
                     rel="noopener noreferrer"
                     aria-label={lang === 'en' ? 'Visit YouTube channel' : 'زيارة قناة اليوتيوب'}
                     className="btn-arena card-sheen cut-btn relative w-full min-h-[54px] inline-flex items-center justify-center gap-2.5 bg-gradient-to-b from-[#D9C08A] to-[#8A6A3A] text-white font-black text-sm tracking-wide shadow-[0_14px_36px_-10px_rgba(255,0,0,0.7)] overflow-hidden"
                  >
                     <YoutubeIcon className="w-5 h-5 shrink-0" />
                     {lang === 'en' ? 'SUBSCRIBE NOW' : 'اشترك الآن'}
                     <svg className={`w-4 h-4 shrink-0 ${isRTL ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </a>
               </div>
            </div>
         </div>
      </div>
   );
};
