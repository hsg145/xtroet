import React, { useEffect, useState, useMemo, useRef } from 'react';

interface BotrixEntry {
  level: number;
  watchtime: number;
  xp: number;
  points: number;
  name: string;
}

interface RichEntry extends BotrixEntry {
  avatar: string;
  followers: number | null;
  bio: string;
  verified: boolean;
  role: 'mod' | 'vip' | 'og' | null;
}

interface BotrixLeaderboardProps {
  lang: 'en' | 'ar';
}

const API_URL = '/api/kick?endpoint=' + encodeURIComponent('https://botrix.live/api/public/leaderboard?platform=kick&user=xtroet');
const KICK_CH = (name: string) => '/api/kick?endpoint=' + encodeURIComponent(`https://kick.com/api/v2/channels/${name}`);

const formatDuration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
};

const formatNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return (n || 0).toLocaleString();
};

const SkeletonRow: React.FC<{ delay: number }> = ({ delay }) => (
  <div className="flex items-center gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.02] animate-pulse" style={{ animationDelay: `${delay}ms` }}>
    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/[0.04]"></div>
    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/[0.04]"></div>
    <div className="flex-1 space-y-2">
      <div className="h-3 w-28 bg-white/[0.04] rounded-lg"></div>
      <div className="h-2 w-36 bg-white/[0.02] rounded-lg"></div>
    </div>
    <div className="w-16 h-5 bg-white/[0.04] rounded-lg"></div>
  </div>
);

const PROFILE_CACHE = new Map<string, { avatar: string; followers: number | null; bio: string; verified: boolean }>();

const ROLE_STYLE: Record<string, { pill: string; dot: string; label: string; ring: string }> = {
  mod: { pill: 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300', dot: 'bg-emerald-400', label: 'MOD', ring: 'border-emerald-400/60' },
  vip: { pill: 'bg-pink-400/15 border-pink-400/50 text-pink-300', dot: 'bg-pink-400', label: 'VIP', ring: 'border-pink-400/60' },
  og: { pill: 'bg-amber-400/15 border-amber-400/50 text-amber-300', dot: 'bg-amber-400', label: 'OG', ring: 'border-amber-400/60' },
};

const RoleBadge: React.FC<{ role: 'mod' | 'vip' | 'og' }> = ({ role }) => {
  const s = ROLE_STYLE[role];
  return (
    <span className={`inline-flex items-center gap-1 text-[8px] md:text-[9px] font-black tracking-[0.14em] px-1.5 sm:px-2 py-[3px] rounded-lg border ${s.pill}`}>
      <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
};

const ROLE_RING: Record<string, string> = {
  mod: '#10b981',
  vip: '#ec4899',
  og: '#f59e0b',
};

const MiniIcon: React.FC<{ d: string; className?: string }> = ({ d, className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const BotrixLeaderboard: React.FC<BotrixLeaderboardProps> = ({ lang }) => {
  const [data, setData] = useState<BotrixEntry[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, { avatar: string; followers: number | null; bio: string; verified: boolean }>>({});
  const [roles, setRoles] = useState<Record<string, 'mod' | 'vip' | 'og'>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(API_URL)
      .then(r => r.json())
      .then((json: BotrixEntry[]) => {
        if (!cancelled && Array.isArray(json)) setData(json);
        else if (!cancelled) setData([]);
      })
      .catch(() => { if (!cancelled) setData([]); });
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => (b.watchtime || 0) - (a.watchtime || 0)).slice(0, 50);
  }, [data]);

  // Enrich top chatters with live Kick data (followers, bio, verified, avatar)
  // Top 15 get full enrichment; the rest render instantly with Botrix data.
  useEffect(() => {
    if (!sorted.length) return;
    const toFetch = sorted.slice(0, 15).map(e => e.name).filter(n => !fetchedRef.current.has(n.toLowerCase()));
    if (!toFetch.length) return;
    toFetch.forEach(n => fetchedRef.current.add(n.toLowerCase()));
    let cancelled = false;
    const fetchOne = async (name: string) => {
      try {
        const cached = PROFILE_CACHE.get(name.toLowerCase());
        if (cached) return { name, ...cached };
        const res = await fetch(KICK_CH(name));
        if (!res.ok) return null;
        const json = await res.json();
        const d = json?.data || json;
        const followers = d?.followers_count != null ? parseInt(String(d.followers_count).replace(/[^\d]/g, ''), 10) || null : null;
        const out = {
          name,
          avatar: d?.user?.profile_pic || '',
          followers,
          bio: d?.user?.bio || '',
          verified: d?.verified === true,
        };
        PROFILE_CACHE.set(name.toLowerCase(), { avatar: out.avatar, followers: out.followers, bio: out.bio, verified: out.verified });
        return out;
      } catch { return null; }
    };
    (async () => {
      for (let i = 0; i < toFetch.length; i += 4) {
        const batch = await Promise.all(toFetch.slice(i, i + 4).map(fetchOne));
        if (cancelled) return;
        const next: Record<string, { avatar: string; followers: number | null; bio: string; verified: boolean }> = {};
        batch.forEach(b => { if (b) next[b.name] = { avatar: b.avatar, followers: b.followers, bio: b.bio, verified: b.verified }; });
        setProfiles(prev => ({ ...prev, ...next }));
      }
    })();
    return () => { cancelled = true; };
  }, [sorted]);

  const rich: RichEntry[] = useMemo(() => sorted.map(e => ({
    ...e,
    avatar: profiles[e.name]?.avatar || '',
    followers: profiles[e.name]?.followers ?? null,
    bio: profiles[e.name]?.bio || '',
    verified: profiles[e.name]?.verified || false,
    role: roles[e.name.toLowerCase()] || null,
  })), [sorted, profiles, roles]);

  const maxWatch = Math.max(1, ...rich.map(e => e.watchtime || 0));
  const totalWatch = rich.reduce((s, e) => s + (e.watchtime || 0), 0);

  const t = {
    title: lang === 'ar' ? 'أساطير الشات' : 'Chat Legends',
    subtitle: lang === 'ar' ? 'الأكثر تفاعلاً في جميع البثوث' : 'Most active across all streams',
    empty: lang === 'ar' ? 'لا توجد بيانات حالياً' : 'No data available',
    level: lang === 'ar' ? 'المستوى' : 'Level',
    watchtime: lang === 'ar' ? 'مشاهدة' : 'Watched',
    xp: 'XP',
    points: lang === 'ar' ? 'نقطة' : 'PTS',
    followers: lang === 'ar' ? 'متابع' : 'Followers',
    legends: lang === 'ar' ? 'أسطورة' : 'Legends',
  };

  const podium = rich.slice(0, 3);
  const ringOf = (rank: number) =>
    rank === 1 ? 'conic-gradient(from 200deg,#a7f3d0,#047857,#ecfdf5,#047857,#a7f3d0)'
    : rank === 2 ? 'conic-gradient(from 200deg,#e8e8e8,#6f7b8a,#ffffff,#6f7b8a,#e8e8e8)'
    : rank === 3 ? 'conic-gradient(from 200deg,#f0a35e,#6e3c10,#ffd9ae,#6e3c10,#f0a35e)'
    : 'rgba(255,255,255,0.12)';

  return (
    <div className="w-full animate-fade-in-up">
      <div className="group relative rounded-[28px] overflow-hidden bg-white/[0.03] border border-white/10 backdrop-blur-2xl transition-colors duration-500 hover:border-white/20">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#10B981]/60 to-transparent" aria-hidden="true" />
        <div className="absolute -top-24 start-1/4 w-96 h-96 bg-[#10B981]/[0.08] blur-[110px] pointer-events-none" aria-hidden="true" />
        <div className="absolute -bottom-32 end-0 w-96 h-96 bg-[#10B981]/[0.08] blur-[110px] pointer-events-none" aria-hidden="true" />

        {/* header — modern */}
        <div className="relative p-5 md:p-7 pb-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-[#10B981]/40 blur-2xl opacity-40 group-hover:opacity-80 transition-opacity duration-500 rounded-full" aria-hidden="true" />
            <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-[20px] bg-[#04120D] border border-[#10B981]/50 shadow-[0_16px_40px_-12px_rgba(16,185,129,0.6)] flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 ring-1 ring-[#C9A24B]/30">
              <svg className="w-7 h-7 md:w-8 md:h-8 text-[#10B981] drop-shadow-[0_0_12px_rgba(16,185,129,0.7)]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            </div>
            <span className="absolute -bottom-1.5 -end-1.5 w-6 h-6 rounded-full bg-[#53FC18] border-4 border-[#0B0906] animate-pulse shadow-[0_0_14px_#53FC18]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight leading-none">{t.title}</h3>
            <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.24em] bg-gradient-to-r from-[#A7F3D0] to-[#059669] bg-clip-text text-transparent mt-2">{t.subtitle}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3.5 py-2 rounded-2xl bg-white/[0.05] border border-white/10 text-white/60">{rich.length} {t.legends}</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3.5 py-2 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/30 text-[#6EE7B7]" dir="ltr">{formatDuration(totalWatch)}</span>
          </div>
        </div>

        <div className="relative px-4 md:px-8 pb-4 z-10">
          {!data && (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} delay={i * 60} />)}
            </div>
          )}

          {data && data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4 border border-white/[0.06]">
                <svg className="w-7 h-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.72m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
              </div>
              <p className="text-sm text-white/30 font-medium">{t.empty}</p>
            </div>
          )}

          {rich.length > 0 && (
            <>
              {/* podium top-3 — floating modern */}
              <div className="relative mx-4 md:mx-6 mt-1 rounded-3xl border border-white/[0.07] bg-black/30 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" aria-hidden="true" />
                <div className="relative flex items-end justify-center gap-2 sm:gap-5 px-4 pt-6 pb-4" dir="ltr">
                {([podium[1], podium[0], podium[2]].filter(Boolean)).map((e: any, i: number) => {
                  const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                  return (
                    <div key={e.name} className="flex flex-col items-center w-[30%] max-w-[200px] animate-fade-in-up transition-transform duration-500 hover:-translate-y-1.5" style={{ animationDelay: `${i * 100}ms` }}>
                      <span className={`relative rounded-full p-[2.5px] block transition-transform duration-500 hover:scale-110 ${rank === 1 ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-12 h-12 sm:w-16 sm:h-16'}`} style={{ background: ringOf(rank), boxShadow: rank === 1 ? '0 0 36px rgba(255,215,106,0.55)' : '0 8px 24px rgba(0,0,0,0.5)' }}>
                        {e.avatar
                          ? <img src={e.avatar} alt={e.name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                          : <span className="w-full h-full rounded-full bg-white/[0.06] backdrop-blur flex items-center justify-center font-black text-lg text-white/80">{e.name.charAt(0).toUpperCase()}</span>}
                        <span className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-lg border ${rank === 1 ? 'bg-[#10B981] text-[#04120D] border-white/50' : 'bg-black/80 text-white/80 border-white/20'}`} dir="ltr">#{rank}</span>
                        {rank === 1 && (
                          <svg className="absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_0_10px_rgba(16,185,129,0.9)] animate-float-soft" viewBox="0 0 24 24" fill="none">
                            <path fill="#6EE7B7" d="M2.5 8.5 6.5 12l5.5-7 5.5 7 4-3.5L20 18H4L2.5 8.5z" />
                            <rect x="4" y="18.6" width="16" height="2.2" rx="1.1" fill="#047857" />
                          </svg>
                        )}
                      </span>
                      <p className="mt-3 text-xs sm:text-sm font-black text-white truncate max-w-full flex items-center gap-1" dir="auto">
                        <span className="truncate">{e.name}</span>
                        {e.verified && <svg className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                      </p>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {e.role && <RoleBadge role={e.role} />}
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-white/[0.06] border border-white/10 text-white/60" dir="ltr">Lv.{e.level}</span>
                      </span>
                      <span className="mt-1.5 text-[10px] font-bold text-white/40" dir="ltr">{formatDuration(e.watchtime)}</span>
                    </div>
                  );
                })}
                </div>
              </div>

              {/* rows — glass list */}
              <div className="space-y-1.5 mt-3 max-h-[420px] md:max-h-[520px] overflow-y-auto scrollbar-hide">
                {rich.slice(3).map((e, idx) => {
                  const rank = idx + 4;
                  const pct = Math.max(4, Math.round(((e.watchtime || 0) / maxWatch) * 100));
                  return (
                    <div key={e.name} className="relative rounded-2xl p-2.5 sm:p-3 border border-transparent hover:border-[#10B981]/20 hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-14px_rgba(16,185,129,0.35)] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: `${Math.min(idx * 60, 480)}ms` }}>
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[11px] font-black text-white/40 shrink-0" dir="ltr">{rank < 10 ? `0${rank}` : rank}</span>
                        <span className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full p-[2px] shrink-0 block" style={{ background: e.role ? ROLE_RING[e.role] : 'rgba(255,255,255,0.14)' }}>
                          {e.avatar
                            ? <img src={e.avatar} alt={e.name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                            : <span className="w-full h-full rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-black text-white/60">{e.name.charAt(0).toUpperCase()}</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] sm:text-sm font-black text-white/90 truncate flex items-center gap-1.5" dir="auto">
                            <span className="truncate">{e.name}</span>
                            {e.verified && <svg className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                            {e.role && <RoleBadge role={e.role} />}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-[10px] text-white/40 font-bold">
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] border border-white/10 px-1.5 py-0.5" dir="ltr"><MiniIcon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3 h-3 text-[#6EE7B7]/80" />{formatDuration(e.watchtime)}</span>
                            <span className="rounded-md bg-white/[0.05] border border-white/10 px-1.5 py-0.5" dir="ltr">Lv.{e.level}</span>
                            <span className="hidden md:inline rounded-md bg-white/[0.05] border border-white/10 px-1.5 py-0.5" dir="ltr">{formatNum(e.xp)} XP</span>
                            {e.followers != null && <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-white/[0.05] border border-white/10 px-1.5 py-0.5" dir="ltr"><MiniIcon d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" className="w-3 h-3 text-white/30" />{formatNum(e.followers)}</span>}
                          </p>
                          {e.bio && <p className="hidden md:block text-[10px] text-white/25 truncate mt-1" dir="auto">{e.bio}</p>}
                        </div>
                        <span className="text-[11px] font-black px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-white/60 shrink-0" dir="ltr">{formatDuration(e.watchtime)}</span>
                      </div>
                      <div className="mt-2 ms-[76px] h-1 rounded-full bg-white/[0.06] overflow-hidden" dir="ltr">
                        <div className="bar-grow h-full rounded-full bg-gradient-to-r from-[#A7F3D0] via-[#10B981] to-[#047857]" style={{ width: `${pct}%`, animationDelay: `${Math.min(idx * 60, 480)}ms` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="h-3"></div>
              </div>
            </>
          )}
        </div>

        <div className="relative px-5 md:px-7 pb-5 flex items-center justify-center gap-3 z-10">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
          <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-white/40 bg-white/[0.04] border border-white/10 rounded-full px-3.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse shadow-[0_0_8px_#53FC18]" />
            {lang === 'ar' ? 'نخبة الشات المباشر' : 'Live chat elite'}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
        </div>
      </div>
    </div>
  );
};

export default BotrixLeaderboard;
