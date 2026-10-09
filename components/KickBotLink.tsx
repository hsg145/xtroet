import React, { useEffect, useState } from 'react';

type Status = { connected: boolean; slug?: string | null; channelId?: number; updatedAt?: string };

export const KickBotLink: React.FC<{ lang: 'ar' | 'en' }> = ({ lang }) => {
    const [status, setStatus] = useState<Status | null>(null);
    const [justLinked, setJustLinked] = useState<string | null>(null);
    const ar = lang === 'ar';

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const ch = params.get('channel');
        if (params.get('kick') === 'connected') {
            setJustLinked(ch || 'OK');
            params.delete('kick');
            params.delete('channel');
            params.delete('code');
            params.delete('state');
            const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
            window.history.replaceState({}, '', clean);
        }
        fetch('/api/kick-status')
            .then((r) => r.json())
            .then((j) => setStatus(j))
            .catch(() => setStatus({ connected: false }));
    }, []);

    const dot = status?.connected ? '#53FC18' : '#F59E0B';
    const label = status == null
        ? (ar ? 'جاري التحقق…' : 'Checking…')
        : status.connected
            ? (ar ? `مربوطة: ${status.slug || status.channelId}` : `Linked: ${status.slug || status.channelId}`)
            : (ar ? 'غير مربوطة بعد' : 'Not linked yet');

    return (
        <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#53FC18]/70 to-transparent" />
            <div className="p-5 sm:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl"
                        style={{ background: 'linear-gradient(160deg,#53FC182e,rgba(255,255,255,0.04))', border: '1.5px solid #53FC1866', color: '#53FC18', boxShadow: '0 0 26px #53FC1833' }}>
                        K
                    </span>
                    <div className="min-w-0">
                        <p className="text-white font-black text-base sm:text-lg leading-tight">
                            {ar ? 'ربط بوت Kick بالقناة' : 'Link Kick bot to channel'}
                        </p>
                        <p className="text-white/50 text-xs sm:text-[13px] mt-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: dot, boxShadow: `0 0 10px ${dot}` }} />
                            <span dir={ar ? 'rtl' : 'ltr'}>{label}</span>
                            {status?.connected && status.updatedAt && (
                                <span className="text-white/30" dir="ltr">• {new Date(status.updatedAt).toLocaleDateString()}</span>
                            )}
                        </p>
                        {justLinked && (
                            <p className="text-[#53FC18] text-xs font-bold mt-1.5">
                                {ar ? `✅ تم ربط القناة (${justLinked}) بنجاح — البوت يقدر يقرأ الشات ويرسل.` : `✅ Channel (${justLinked}) linked — bot can read & send chat.`}
                            </p>
                        )}
                    </div>
                </div>
                <a href="/api/kick-login"
                    className="btn-arena shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-black text-sm text-black"
                    style={{ background: 'linear-gradient(180deg,#8CFF5C,#53FC18 55%,#2b9e1c)', boxShadow: '0 14px 40px -10px rgba(83,252,24,0.6), inset 0 1px 0 rgba(255,255,255,0.55)' }}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                    {ar ? 'ربط قناة Kick' : 'Link Kick channel'}
                </a>
            </div>
            <p className="px-5 sm:px-7 pb-4 text-[11px] text-white/35 leading-relaxed">
                {ar
                    ? 'يفتح تسجيل دخول Kick بحساب مالك القناة، وبعد القبول يرجعك للموقع مربوطاً تلقائياً. لتغيير البوت لاحقاً يكفي تبديل KICK_CLIENT_ID / SECRET في Vercel — نفس الزر يعطي رابط البوت الجديد فوراً.'
                    : 'Opens Kick login with the channel-owner account, then returns you here linked. To swap bots later, just change KICK_CLIENT_ID / SECRET in Vercel — the same button links the new bot instantly.'}
            </p>
        </div>
    );
};
