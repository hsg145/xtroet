import React, { useEffect, useState } from 'react';
import { Language } from '../types';
import { KickIcon } from './Icons';
import { kickFetch } from '../utils/kickApi';

interface KICKsSectionProps {
  lang: Language;
}

interface KickerEntry {
  username: string;
  quantity: number;
  avatar?: string;
  rank?: number;
}

interface KickerData {
  all_time: KickerEntry[];
  monthly: KickerEntry[];
  weekly: KickerEntry[];
}

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num || 0);
};

// Custom Icons for KICKs
const CrownIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth="0">
    <defs>
      <linearGradient id="crownGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFD700" />
        <stop offset="50%" stopColor="#FFA500" />
        <stop offset="100%" stopColor="#FF8C00" />
      </linearGradient>
    </defs>
    <path fill="url(#crownGradient)" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm7-13c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>
    <path stroke="url(#crownGradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
  </svg>
);

const FireIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth="0">
    <defs>
      <linearGradient id="fireGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D9C08A" />
        <stop offset="100%" stopColor="#C9A24B" />
      </linearGradient>
    </defs>
    <path fill="url(#fireGradient)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    <path stroke="url(#fireGradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
  </svg>
);

const LightningIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth="0">
    <defs>
      <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#53FC18" />
        <stop offset="100%" stopColor="#32CD32" />
      </linearGradient>
    </defs>
    <path fill="url(#lightningGradient)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    <path stroke="url(#lightningGradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

interface KickerCardProps {
  title: string;
  subtitle: string;
  data: KickerEntry[];
  icon: React.ReactNode;
  accentColor: 'gold' | 'fire' | 'lightning';
  isMain?: boolean;
  lang: Language;
  t: any;
  delay: number;
  emptyLabel?: string;
  className?: string;
}

const KickerCard: React.FC<KickerCardProps> = ({ title, subtitle, data, icon, accentColor, isMain, lang, t, delay, emptyLabel, className }) => {
  
  const config = {
    gold: {
      border: 'border-yellow-500/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(255,215,0,0.15)]',
      text: 'text-yellow-400',
      bgIcon: 'bg-yellow-500/10',
      gradient: 'from-yellow-400 to-amber-600',
      subText: 'text-yellow-200/50'
    },
    fire: {
      border: 'border-[#C9A24B]/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(201,162,75,0.15)]',
      text: 'text-[#C9A24B]',
      bgIcon: 'bg-[#C9A24B]/10',
      gradient: 'from-[#C9A24B] to-red-800',
      subText: 'text-red-200/50'
    },
    lightning: {
      border: 'border-[#53FC18]/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(83,252,24,0.15)]',
      text: 'text-[#53FC18]',
      bgIcon: 'bg-[#53FC18]/10',
      gradient: 'from-[#53FC18] to-green-600',
      subText: 'text-green-200/50'
    }
  }[accentColor];

  const renderRankBadge = (rank: number) => {
    if (rank === 1) return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-[#FFD700] to-[#FDB931] shadow-[0_0_15px_rgba(255,215,0,0.5)] border border-[#FFFACD]/50 text-black font-black text-sm shrink-0">
        1
      </div>
    );
    if (rank === 2) return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-[#E0E0E0] to-[#BDBDBD] shadow-[0_0_10px_rgba(192,192,192,0.3)] border border-white/50 text-black font-black text-xs shrink-0">
        2
      </div>
    );
    if (rank === 3) return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-[#E6A373] to-[#8B4513] shadow-[0_0_10px_rgba(205,127,50,0.3)] border border-[#FFDAB9]/30 text-white font-black text-[10px] shrink-0">
        3
      </div>
    );
    return (
      <span className="w-6 text-center text-xs font-bold text-white/30 font-mono shrink-0">
        {rank < 10 ? `0${rank}` : rank}
      </span>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className={`
                 relative flex flex-col items-center justify-center p-6 text-center rounded-[32px] overflow-hidden
                 bg-black/60 backdrop-blur-lg border border-white/5
                 transition-all duration-700 hover:border-white/10 group
                 ${isMain ? 'lg:-mt-4 z-10 min-h-[300px] md:min-h-[440px]' : 'min-h-[250px] md:min-h-[380px]'}
                 ${className}
             `}
        style={{ animationDelay: `${delay}ms` }}>
        <div className={`p-4 md:p-5 rounded-full ${config.bgIcon} mb-4 md:mb-5 opacity-50 group-hover:opacity-100 transition-opacity duration-500 ring-1 ring-white/5`}>
          {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-6 h-6 md:w-8 md:h-8 ${config.text} drop-shadow-lg` })}
        </div>
        <h3 className={`text-sm md:text-base font-bold text-white/60 mb-1 uppercase tracking-[0.2em]`}>{title}</h3>
        <p className={`text-[10px] md:text-xs ${config.subText} font-medium`}>{emptyLabel || t.noData}</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.quantity - a.quantity).slice(0, 10);

  return (
    <div
      className={`
                group relative flex flex-col rounded-[24px] md:rounded-[32px] overflow-hidden transition-all duration-700
                bg-[#050505]/80 backdrop-blur-lg border border-white/5
                ${config.glow} hover:border-white/20
                ${isMain ? 'md:-mt-8 z-20 md:scale-105 shadow-2xl ring-1 ring-white/10' : 'shadow-xl'}
                ${className}
            `}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute top-0 left-0 right-0 h-24 md:h-32 bg-gradient-to-b ${config.bgIcon.replace('bg-', 'from-').replace('/10', '/20')} to-transparent pointer-events-none opacity-40 blur-2xl`}></div>

      <div className="relative p-4 md:p-6 flex flex-col items-center justify-center text-center border-b border-white/5 z-10">
        <div className={`
                    w-10 h-10 md:w-14 md:h-14 mb-2 md:mb-3 rounded-2xl flex items-center justify-center 
                    bg-gradient-to-br from-white/10 to-transparent border border-white/10 
                    shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform duration-500
                 `}>
          {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5 md:w-7 md:h-7 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" }) : icon}
        </div>
        <div>
          <h3 className={`text-base md:text-2xl font-black text-white tracking-tight leading-none mb-0.5 md:mb-1 ${lang === 'ar' ? 'font-arabic' : ''}`}>{title}</h3>
          <span className={`text-[8px] md:text-[10px] font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent opacity-80`}>{subtitle}</span>
        </div>
      </div>

      <div className="flex-1 p-2 md:p-3 space-y-1.5 md:space-y-2 relative overflow-y-auto max-h-[300px] md:max-h-[400px] scrollbar-hide">
        {sorted.map((entry, idx) => {
          const isTop3 = idx < 3;
          return (
            <div
              key={idx}
              className={`
                                relative flex items-center justify-between p-2 md:p-3.5 rounded-xl md:rounded-2xl transition-all duration-300 group/row
                                ${isTop3 ? 'bg-gradient-to-r from-white/[0.03] to-transparent border border-white/5' : 'hover:bg-white/[0.02]'}
                            `}
            >
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                <div className="shrink-0 flex justify-center w-6 md:w-8">
                  {renderRankBadge(idx + 1)}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`
                                         text-sm md:text-base font-bold truncate transition-colors pr-2
                                         ${idx === 0 ? 'text-white drop-shadow-lg' : 'text-white/95 drop-shadow-md'}
                                         group-hover/row:text-white
                                         leading-tight
                                     `}>
                    {entry.username}
                  </span>
                  {isTop3 && (
                    <div className="hidden md:block h-0.5 w-12 rounded-full bg-gradient-to-r from-white/30 to-transparent mt-1"></div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pl-3 bg-black/30 rounded-lg px-3 py-1.5 border border-white/10">
                <span className={`
                                         text-sm md:text-base font-black tracking-wide 
                                         ${idx === 0 ? 'text-white drop-shadow-lg' : config.text}
                                         group-hover/row:scale-105 transition-all
                                         leading-none
                                     `}>
                  {formatNumber(entry.quantity)}
                </span>
                {idx === 0 && (
                  <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_10px_white]"></div>
                )}
              </div>
            </div>
          );
        })}

        <div className="h-4"></div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-12 md:h-16 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-20"></div>
    </div>
  );
};

export const KICKsSection: React.FC<KICKsSectionProps> = ({ lang }) => {
  const [kickerData, setKickerData] = useState<KickerData | null>(null);

  const t = {
    kickers: lang === 'en' ? 'Top KICKers' : 'أفضل الكيكرز',
    allTime: lang === 'en' ? 'All Time' : 'الأفضل',
    monthly: lang === 'en' ? 'Monthly' : 'شهرياً',
    weekly: lang === 'en' ? 'Weekly' : 'أسبوعياً',
    noData: lang === 'en' ? 'No Data' : 'لا يوجد بيانات',
    noDataWeekly: lang === 'en' ? 'No active kickers this week' : 'لا يوجد كيكرز هذا الأسبوع',
    noDataMonthly: lang === 'en' ? 'No active kickers this month' : 'لا يوجد كيكرز لهذا الشهر',
    noDataAllTime: lang === 'en' ? 'No records found' : 'لا يوجد سجلات بعد',
  };

  useEffect(() => {
    // Mock data for now - replace with actual API call when available
    const mockData: KickerData = {
      all_time: [
        { username: 'Firas_Fan1', quantity: 15420 },
        { username: 'SuperKicker', quantity: 12350 },
        { username: 'KickMaster', quantity: 10200 },
        { username: 'ProSupporter', quantity: 8900 },
        { username: 'TopDonor', quantity: 7650 },
      ],
      monthly: [
        { username: 'MonthlyKing', quantity: 3200 },
        { username: 'WeekStar', quantity: 2890 },
        { username: 'ActiveUser', quantity: 2100 },
        { username: 'RegularKicker', quantity: 1850 },
        { username: 'NewFan', quantity: 1200 },
      ],
      weekly: [
        { username: 'WeekChampion', quantity: 890 },
        { username: 'DailyActive', quantity: 650 },
        { username: 'RisingStar', quantity: 420 },
        { username: 'Newcomer', quantity: 280 },
        { username: 'CasualFan', quantity: 150 },
      ]
    };

    setKickerData(mockData);
  }, []);

  return (
    <div className="w-full space-y-16 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
      <div className="relative space-y-12">
        <div className="flex flex-col items-center justify-center gap-2 text-center relative z-10">
          <h2 className={`text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-xl ${lang === 'ar' ? 'font-arabic' : ''}`}>
            {t.kickers}
          </h2>
          <div className="h-px w-20 bg-gradient-to-r from-transparent via-[#53FC18]/30 to-transparent"></div>
        </div>

        {kickerData ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8 items-start relative px-1">

            <KickerCard
              title={t.weekly}
              subtitle="Active"
              data={kickerData.weekly}
              icon={<FireIcon />}
              accentColor="fire"
              lang={lang}
              t={t}
              delay={100}
              emptyLabel={t.noDataWeekly}
              className="col-span-1 md:col-span-1 order-2 md:order-1"
            />

            <KickerCard
              title={t.allTime}
              subtitle="Legends"
              data={kickerData.all_time}
              icon={<CrownIcon />}
              accentColor="gold"
              isMain={true}
              lang={lang}
              t={t}
              delay={0}
              emptyLabel={t.noDataAllTime}
              className="col-span-2 md:col-span-1 order-1 md:order-2"
            />

            <KickerCard
              title={t.monthly}
              subtitle="Stars"
              data={kickerData.monthly}
              icon={<LightningIcon />}
              accentColor="lightning"
              lang={lang}
              t={t}
              delay={200}
              emptyLabel={t.noDataMonthly}
              className="col-span-1 md:col-span-1 order-3 md:order-3"
            />

          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
            <div className="col-span-2 md:col-span-1 order-1 md:order-2 h-80 md:h-[480px] w-full rounded-3xl -mt-0 md:-mt-8 bg-white/5 animate-pulse" />
            <div className="col-span-1 order-2 md:order-1 h-64 md:h-96 w-full rounded-3xl bg-white/5 animate-pulse" />
            <div className="col-span-1 order-3 md:order-3 h-64 md:h-96 w-full rounded-3xl bg-white/5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
};
