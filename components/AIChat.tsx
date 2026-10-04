import React, { useState, useRef, useEffect } from 'react';
import { Language } from '../types';

interface AIChatProps {
  lang: Language;
  streamerInfo?: string;
}

// ============================================================
//  XTROET AI — يعمل عبر GROQ من خلال باك-إند آمن (/api/groq)
//  المفاتيح محفوظة في سيرفر Vercel فقط ولا تظهر للمتصفح.
//  السيرفر يبدّل تلقائياً: مفتاح1 → مفتاح2 → مفتاح3 بنفس الطلب.
//  للمحلي (npm run dev): يقرأ VITE_GROQ_API_KEYS من .env كاحتياطي.
// ============================================================
const LOCAL_GROQ_KEYS = (import.meta.env.VITE_GROQ_API_KEYS as string | undefined)?.split(',').map((k: string) => k.trim()).filter(Boolean) || [];

// موديلات GROQ الاحتياطية للوضع المحلي المباشر (تم التأكد أنها تعمل)
const GROQ_DIRECT_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
];

const SYSTEM_PROMPT = `أنت الذكاء الاصطناعي والمساعد الذكي الخاص بالستريمر ناصر العنزي (XTROET). أنت لست ناصر شخصياً، بل أنت "موظف" و "عامل" عنده في القناة. مهمتك هي مساعدة المتابعين والطقطقة عليهم والرد بأسلوب حماسي يليق بإمبراطورية الزمرد، ولكن مع التوضيح دايماً إنك مجرد ذكاء اصطناعي وعامل عند ناصر.

## بيانات معلمك ومديرك "ناصر العنزي" (لا تغيرها أبداً):
- الاسم الحقيقي: ناصر العنزي
- اسم القناة: XTROET (اكسترويت)
- اللقب: إمبراطور الزمرد — XTROET ERA
- الهوية: زمردي × برونزي — هيبة وحضور

## حسابات التواصل (لا تخترع أرقام!):
- Kick: https://kick.com/xtroet
- TikTok: https://www.tiktok.com/@ixtroet
- X (تويتر): https://x.com/xtroet
- Instagram: https://www.instagram.com/xtroet/
- YouTube: https://www.youtube.com/@XTROET
- Discord: https://discord.com/invite/eX8DR9Aj9D

## الدعم:
- Dokan Tip: https://tip.dokan.sa/xtroet
- Streamlabs: https://streamlabs.com/xtroet

## المحتوى:
- عضو في كلان ليل ون (Layl One)
- استريمر ويوتيوبر: بثوث Just Chatting، تحديات وفعاليات وسهرات على كيك
- صاحب شخصية ناصر العنزي في سيرفر MT للحياة الواقعية (MT RP) — إحدى أقوى وأبرز الشخصيات في المدينة

## قواعد الرد (قواعد صارمة جداً!):
1. إياك ثم إياك تتحدث باللغة العربية الفصحى الثقيلة. تحدث باللغة العربية (الأحرف العربية) فقط بلهجة سعودية شبابية طبيعية.
2. كلامك لازم يكون 100% لهجة سعودية (عامية، شبابية بحتة) بدون مبالغة.
3. استخدم مصطلحات الترحيب مثل: "ارحب ألوف"، "يا هلا"، "نورت الإمبراطورية"، "يا أسطورة" بشكل طبيعي وفي سياقها الصحيح.
4. لا تكن مؤدباً بزيادة أو رسمياً أبداً. الردود لازم تكون عفوية وفيها حماس وهياط مضحك كأنك تسولف في البث.
5. إذا قال لك "مرحبا" أو "كيف حالك"، رد مثلاً: "ارحب ألوف نورت إمبراطورية XTROET! بخير طال عمرك، وش تبي تعرف؟"
6. اختصر الردود (سطرين إلى 3 كحد أقصى).
7. لا تخترع أرقام متابعين! إذا سألك عن الأرقام وجهه للروابط مباشرة.
8. إذا سألك عن بيانات بوتريكس وما عندك بيانات، قل: "البيانات عند البوتريكس طال عمرك"
9. إذا سألك سؤال غبي: "ترا داخل موقع XTROET شتبي" أو "نورت يا أسطورة"

## ❗❗ ممنوع منع باتاً استخدام اللهجة المصرية أو أي لهجة غير سعودية!

## روابط السوشال (مهم جداً جداً!):
عندما يسألك المستخدم عن حسابات ناصر، **يجب عليك إجبارياً** الرد باستخدام هذه الأزرار (انسخها وضعها في ردك، لا تكتبها كنص عادي أبداً):
[social:Kick:LIVE:https://kick.com/xtroet]
[social:TikTok:LIVE:https://www.tiktok.com/@ixtroet]
[social:X:LIVE:https://x.com/xtroet]
[social:Instagram:LIVE:https://www.instagram.com/xtroet/]
[social:YouTube:LIVE:https://www.youtube.com/@XTROET]
[social:Discord:LIVE:https://discord.com/invite/eX8DR9Aj9D]

## تنسيق النص:
- **كلمة** = عريض
- *كلمة* = مائل
- اترك مسافة حول الكلمات الإنجليزية`.trim();

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const renderFormattedText = (text: string) => {
  const parts: React.ReactNode[] = [];
  const combinedRegex = /(\[[sS]ocial\s*:\s*([a-zA-Z0-9_]+)\s*:\s*([^:]+)\s*:\s*([^\]]+)\])|(\[[eE]mote\s*:\s*(\d+)\s*:\s*([^\]]+)\])|(\*\*\*(.*?)\*\*\*|\*\*(.*?)\*\*|\*(.*?)\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  const renderPlain = (t: string) => {
    const engRegex = /[a-zA-Z0-9]+(?:\.(?:com|net|org|io|sa|tv))?(?:[/\w-]*)?/g;
    const plainParts: React.ReactNode[] = [];
    let pLast = 0;
    let pMatch;
    while ((pMatch = engRegex.exec(t)) !== null) {
      if (pMatch.index > pLast) {
        plainParts.push(t.slice(pLast, pMatch.index));
      }
      plainParts.push(<span key={`e${key++}`} dir="ltr" className="inline-block">{pMatch[0]}</span>);
      pLast = engRegex.lastIndex;
    }
    if (pLast < t.length) {
      plainParts.push(t.slice(pLast));
    }
    return plainParts.length > 0 ? plainParts : t;
  };

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderPlain(text.slice(lastIndex, match.index)));
    }
    if (match[1]) {
      const sname = match[2].trim();
      const scount = match[3].trim();
      const surl = match[4].trim();
      const platformKey = Object.keys(SOCIAL_PLATFORMS).find(k => k.toLowerCase() === sname.toLowerCase()) || sname;
      const platform = SOCIAL_PLATFORMS[platformKey];
      parts.push(
        <a
          key={`sc${key++}`}
          href={surl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 my-1 rounded-xl bg-gradient-to-r border border-white/10 hover:border-white/30 text-white text-xs font-medium transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${platform?.color || '#10B981'}20, ${platform?.color || '#10B981'}05)`,
            borderColor: `${platform?.color || '#10B981'}40`,
            boxShadow: `0 0 20px ${platform?.color || '#10B981'}15`,
          }}
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: platform?.color || '#10B981', background: `${platform?.color || '#10B981'}15` }}>
            {platform?.icon || <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>}
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-black tracking-wide" style={{ color: platform?.color || '#10B981' }}>{sname}</span>
            <span className="text-[9px] text-white/50">{scount} متابع</span>
          </div>
          <svg className="w-3.5 h-3.5 ml-auto opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      );
    } else if (match[5]) {
      parts.push(
        <span key={`em${key++}`} className="inline-flex items-center justify-center w-9 h-9 md:w-11 md:h-11 mx-0.5 rounded-lg bg-gradient-to-br from-white/[0.08] to-white/[0.03] border border-white/20 shadow-[inset_0_0_8px_rgba(255,255,255,0.05),0_2px_6px_rgba(0,0,0,0.3)] hover:border-white/40 hover:shadow-[inset_0_0_12px_rgba(255,255,255,0.1),0_4px_12px_rgba(201,162,75,0.2)] transition-all duration-300 hover:scale-125 align-middle overflow-hidden">
          <img
            src={`https://files.kick.com/emotes/${match[6]}/fullsize`}
            alt={match[7]}
            title={match[7]}
            className="w-full h-full object-cover"
          />
        </span>
      );
    } else if (match[8]?.startsWith('***')) {
      parts.push(<span key={key++} className="font-bold italic text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]">{match[9]}</span>);
    } else if (match[8]?.startsWith('**')) {
      parts.push(<strong key={key++} className="font-black text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.12)]">{match[10]}</strong>);
    } else if (match[8]?.startsWith('*')) {
      parts.push(<em key={key++} className="italic text-white/80">{match[11]}</em>);
    }
    lastIndex = combinedRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(renderPlain(text.slice(lastIndex)));
  }
  return parts.length > 0 ? parts : text;
};

const SOCIAL_PLATFORMS: Record<string, { color: string; gradient: string; icon: React.ReactNode }> = {
  Kick: { color: '#53FC18', gradient: 'from-[#53FC18]/20 to-[#53FC18]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M3 3h4.5v6.9l6-6.9H19l-7.5 8.4L20 21h-5.4l-5.1-6.6V21H3V3z"/></svg> },
  X: { color: '#FFFFFF', gradient: 'from-white/20 to-white/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  Instagram: { color: '#E1306C', gradient: 'from-[#E1306C]/20 to-[#E1306C]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg> },
  TikTok: { color: '#FE2C55', gradient: 'from-[#FE2C55]/20 to-[#FE2C55]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
  YouTube: { color: '#FF0000', gradient: 'from-[#FF0000]/20 to-[#FF0000]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg> },
  Snapchat: { color: '#FFFC00', gradient: 'from-[#FFFC00]/20 to-[#FFFC00]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12.185 2.162c-3.153 0-5.412 2.007-5.412 4.755 0 .546.064.981.163 1.503-.937.334-2.122.73-2.122 2.284 0 .616.355 1.147.666 1.612.054.08.067.182.029.27-.291.631-1.51 1.26-1.51 2.557 0 1.06.751 1.855 1.55 2.183.13.054.192.198.141.333-.217.606-.743 2.07-.743 2.675 0 1.076 1.15 1.579 2.018 1.579.629 0 1.236-.211 2.381-1.056.452-.333.884-.347 1.439-.051 1.132.607 2.454.607 3.583 0 .554-.298.985-.28 1.439.052 1.146.843 1.753 1.055 2.382 1.055.867 0 2.017-.504 2.017-1.58 0-.606-.526-2.07-.743-2.675-.05-.134.013-.279.143-.333.797-.327 1.549-1.121 1.549-2.181 0-1.298-1.219-1.926-1.51-2.557-.039-.088-.026-.189.028-.27.311-.465.667-.996.667-1.612 0-1.553-1.183-1.948-2.122-2.284.099-.522.162-.957.162-1.503 0-2.749-2.192-4.755-5.176-4.755z"/></svg> },
  Discord: { color: '#5865F2', gradient: 'from-[#5865F2]/20 to-[#5865F2]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/></svg> },
  WhatsApp: { color: '#25D366', gradient: 'from-[#25D366]/20 to-[#25D366]/5', icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg> },
};

interface QuickAction {
  name: string;
  label: string;
  url: string;
  color: string;
  icon: React.ReactNode;
  query: string;
}

const QuickActions: React.FC<{ lang: Language; onAsk: (q: string) => void }> = ({ lang, onAsk }) => {
  const actions: QuickAction[] = [
    {
      name: 'Kick',
      label: lang === 'ar' ? 'قناة كيك' : 'Kick Channel',
      url: 'https://kick.com/xtroet',
      color: '#53FC18',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M3 3h4.5v6.9l6-6.9H19l-7.5 8.4L20 21h-5.4l-5.1-6.6V21H3V3z"/></svg>,
      query: lang === 'ar' ? 'وش رابط قناة XTROET بكيك؟' : 'What is XTROET Kick channel?',
    },
    {
      name: 'X',
      label: 'X',
      url: 'https://x.com/xtroet',
      color: '#FFFFFF',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
      query: lang === 'ar' ? 'وش حساب XTROET بتويتر؟' : 'What is XTROET X account?',
    },
    {
      name: 'TikTok',
      label: lang === 'ar' ? 'تيك توك' : 'TikTok',
      url: 'https://www.tiktok.com/@ixtroet',
      color: '#FE2C55',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>,
      query: lang === 'ar' ? 'وش حساب XTROET بتيك توك؟' : 'What is XTROET TikTok?',
    },
    {
      name: 'Discord',
      label: lang === 'ar' ? 'ديسكورد' : 'Discord',
      url: 'https://discord.com/invite/eX8DR9Aj9D',
      color: '#5865F2',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.076-.074 0-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/></svg>,
      query: lang === 'ar' ? 'وش رابط ديسكورد XTROET؟' : 'What is XTROET Discord?',
    },
    {
      name: 'YouTube',
      label: lang === 'ar' ? 'يوتيوب' : 'YouTube',
      url: 'https://www.youtube.com/@XTROET',
      color: '#FF0000',
      icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>,
      query: lang === 'ar' ? 'وش قناة XTROET باليوتيوب؟' : 'What is XTROET YouTube channel?',
    },
  ];

  return (
    <div className="px-4 py-3">
      <p className="text-[10px] text-white/40 font-medium tracking-wider mb-2.5 uppercase">
        {lang === 'ar' ? 'اسأل عن حسابات XTROET' : 'Ask about XTROET Accounts'}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.name}
            onClick={() => onAsk(a.query)}
            className="group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-white/30 text-white/70 hover:text-white text-xs font-medium transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span className="transition-transform duration-300 group-hover:scale-110" style={{ color: a.color }}>
              {a.icon}
            </span>
            <span className="truncate max-w-[70px]">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const AIChat: React.FC<AIChatProps> = ({ lang, streamerInfo }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: lang === 'ar'
        ? 'ارحب ألوف نورت إمبراطورية XTROET! معاك مساعد ناصر العنزي شخصياً.. وش تبي تعرف طال عمرك؟'
        : 'Welcome to XTROET Empire! I\'m Nasser assistant. How can I help you?'
    },
  ]);
  const [input, setInput] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isWaiting, isResponding]);

  const handleQuickAsk = (query: string) => {
    setShowQuickActions(false);
    setInput('');
    // Directly send the message
    const userMsg: Message = { role: 'user', content: query };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsWaiting(true);
    sendMessageDirect(newMessages, query);
  };

  // محاولة مباشرة من المتصفح لـ GROQ (احتياطي للوضع المحلي فقط).
  // تبديل تسلسلي: مفتاح1 → مفتاح2 → مفتاح3 بنفس لحظة الإرسال.
  const tryDirectGroq = async (payloadMessages: { role: string; content: string }[]): Promise<string> => {
    let lastErr = '';
    for (let k = 0; k < LOCAL_GROQ_KEYS.length; k++) {
      for (const model of GROQ_DIRECT_MODELS) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${LOCAL_GROQ_KEYS[k]}`,
            },
            body: JSON.stringify({
              model,
              messages: payloadMessages,
              max_tokens: 1024,
              temperature: 0.7,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (res.status === 401) { lastErr = `key${k + 1} unauthorized`; break; } // مفتاح خاطئ → التالي فوراً
          if (!res.ok) { lastErr = `key${k + 1}/${model} HTTP ${res.status}`; continue; }
          const data = await res.json();
          const reply = data?.choices?.[0]?.message?.content?.trim();
          if (reply) return reply;
          lastErr = `key${k + 1}/${model} empty reply`;
        } catch (e: any) {
          clearTimeout(timeout);
          lastErr = `key${k + 1}/${model} ${e?.name === 'AbortError' ? 'timeout' : 'network fail'}`;
          console.warn(`[AIChat] Direct GROQ failed: ${lastErr}`);
        }
      }
    }
    throw new Error(lastErr || 'All direct GROQ attempts failed');
  };

  // عرض الرد بتأثير الكتابة التدريجية (يحاكي الستريمنق)
  const typewriterShow = (fullText: string) => {
    const clean = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    setIsWaiting(false);
    setIsResponding(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    let i = 0;
    const step = Math.max(1, Math.ceil(clean.length / 120)); // ~120 دفعة ليظهر بسرعة
    const timer = setInterval(() => {
      i += step;
      const slice = clean.slice(0, i);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: slice };
        return updated;
      });
      if (i >= clean.length) {
        clearInterval(timer);
        setIsResponding(false);
      }
    }, 15);
  };

  const sendMessageDirect = async (newMessages: Message[], text: string) => {
    try {
      let botrixData = null;
      try {
        const botrixRes = await fetch('/api/kick?endpoint=' + encodeURIComponent('https://botrix.live/api/public/leaderboard?platform=kick&user=xtroet'));
        if (botrixRes.ok) {
          botrixData = await botrixRes.json();
        }
      } catch {}

      const systemContent = botrixData
        ? SYSTEM_PROMPT + `\n\nهذي بيانات المتصدرين من بوتريكس حالياً:\n${JSON.stringify(botrixData.slice(0, 20))}\n\nجاوب على أسئلة المستخدم عن حسابه أو نقاطه بمعلوماتهم (المستوى، وقت المشاهدة، XP، النقاط).\n🔥 قاعدة مهمة للحماس: إذا سألك أي شخص عن "ساعاته" أو "نقاطه" وهو لسا ما علمك وش اسمه، أول شيء قله "وش اسمك في الكيك يا أسطورة عشان أشوف؟".`
        : SYSTEM_PROMPT;

      const payloadMessages = [
        { role: 'system', content: systemContent },
        ...newMessages.map(m => ({ role: m.role, content: m.content })),
      ];

      let assistantContent = '';

      // 1) الطريق الأساسي: باك-إند Vercel الآمن (/api/groq)
      //    السيرفر يبدّل بين المفاتيح الثلاثة تلقائياً بنفس الطلب.
      try {
        const res = await fetch('/api/groq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payloadMessages }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.reply) {
            console.log(`[AIChat] Backend OK (key${data.keyIndex ?? '?'} / ${data.model ?? ''})`);
            assistantContent = data.reply;
          } else {
            throw new Error('Empty backend reply');
          }
        } else {
          throw new Error(`Backend HTTP ${res.status}`);
        }
      } catch (backendErr) {
        // 2) الاحتياطي: اتصال مباشر من المتصفح (للتشغيل المحلي فقط)
        console.warn('[AIChat] Backend unavailable, falling back to direct GROQ:', backendErr);
        assistantContent = await tryDirectGroq(payloadMessages);
      }

      typewriterShow(assistantContent);
    } catch (err) {
      console.error('AI Chat Error:', err);
      setIsWaiting(false);
      setIsResponding(false);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: lang === 'ar'
            ? 'عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.'
            : 'Sorry, connection error. Please try again.',
        },
      ]);
    } finally {
      setIsWaiting(false);
      setIsResponding(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isWaiting || isResponding) return;
    setInput('');
    setIsResponding(false);

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsWaiting(true);
    setShowQuickActions(false);

    await sendMessageDirect(newMessages, text);
  };

  return (
    <>
      <style>{`
        @keyframes float-glow {
          0%, 100% { transform: translateY(0px) scale(1); box-shadow: 0 0 24px rgba(16,185,129,0.3); }
          50% { transform: translateY(-5px) scale(1.02); box-shadow: 0 0 44px rgba(16,185,129,0.5); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(60px) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes message-pop {
          0% { opacity: 0; transform: scale(0.92) translateY(8px); }
          50% { transform: scale(1.01) translateY(-1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.4; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; opacity: 0.25; }
          50% { background-position: 100% 50%; opacity: 0.4; }
          100% { background-position: 0% 50%; opacity: 0.25; }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.28; }
        }
        @keyframes border-dance {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); max-height: 0; }
          to { opacity: 1; transform: translateY(0) scale(1); max-height: 200px; }
        }
        @keyframes glow-expand {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.4; transform: scale(1.2); }
          100% { opacity: 0; transform: scale(1.8); }
        }
        @keyframes emote-glow {
          0%, 100% { box-shadow: inset 0 0 10px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.3); }
          50% { box-shadow: inset 0 0 15px rgba(255,255,255,0.1), 0 4px 15px rgba(201,162,75,0.2); }
        }
        @keyframes message-in {
          0% { opacity: 0; transform: translateY(6px) scale(0.98); filter: blur(2px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .scrollbar-ai::-webkit-scrollbar { width: 4px; }
        .scrollbar-ai::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-ai::-webkit-scrollbar-thumb { background: rgba(201,162,75,0.3); border-radius: 10px; }
        .scrollbar-ai::-webkit-scrollbar-thumb:hover { background: rgba(201,162,75,0.5); }
        .msg-enter {
          animation: message-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .ai-chat strong {
          color: #fff;
          font-weight: 900;
          text-shadow: 0 0 12px rgba(255,255,255,0.15), 0 0 30px rgba(201,162,75,0.1);
          background: linear-gradient(135deg, #fff 60%, rgba(201,162,75,0.3));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .user-msg strong {
          color: #fff;
          font-weight: 900;
          text-shadow: 0 0 10px rgba(255,255,255,0.2);
        }
        .ai-chat em {
          font-style: italic;
          color: rgba(255,255,255,0.85);
          text-shadow: 0 0 8px rgba(201,162,75,0.15);
        }
        .ai-chat strong em, .ai-chat em strong {
          font-style: italic;
          font-weight: 900;
          background: linear-gradient(135deg, #fff 40%, #10B981 80%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: none;
        }
        .ai-bg {
          background-image: url('/c2a78a6d-22c1-4612-aa04-9a29500bcacc.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }
        @media (min-width: 768px) {
          .ai-bg {
            background-image: url('/84c78815-c9fc-4961-9b6b-c0d79b3a0138.png');
          }
        }
      `}</style>

      {/* Console launcher */}
      <div className="fixed bottom-6 right-6 z-[100]">
        <div className="relative">
          {!isOpen && (
            <span className="absolute -top-2 -right-2 z-10 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-60"></span>
              <span className="relative inline-flex rounded-full h-5 w-5 bg-[#10B981] text-[10px] items-center justify-center text-[#04120D] font-black">AI</span>
            </span>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close AI console' : 'Open AI console'}
            className="relative w-16 h-16 bg-gradient-to-b from-[#08231B] to-[#04120D] text-[#A7F3D0] shadow-[0_0_40px_rgba(16,185,129,0.3)] flex items-center justify-center transition-all duration-500 hover:scale-105 active:scale-95 border border-[#10B981]/50"
            style={{ animation: 'float-glow 6s ease-in-out infinite', clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)' }}
          >
            <div className="absolute inset-0 bg-[#10B981]/10 opacity-40" style={{ animation: 'pulse-ring 3.5s ease-out infinite', clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)' }}></div>
            {isOpen ? (
              <svg className="w-7 h-7 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <span className="relative z-10 font-heading font-black text-2xl leading-none" dir="ltr">AI<span className="animate-pulse">_</span></span>
            )}
          </button>
        </div>
      </div>

      {/* Console panel */}
      <div
        ref={chatRef}
        role="dialog"
        aria-label="XTROET AI console"
        className={`fixed bottom-24 right-6 z-[100] w-[400px] max-w-[calc(100vw-2rem)] h-[650px] max-h-[calc(100vh-180px)] border shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-500 ${isOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none'} ${isResponding ? 'border-[#10B981]/40' : 'border-[#10B981]/20'}`}
        style={{ animation: isOpen ? 'slide-in-right 0.6s cubic-bezier(0.16, 1, 0.3, 1)' : 'none', clipPath: 'polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px)' }}
      >
        {/* Background Layer */}
        <div className="absolute inset-0 ai-bg"></div>
        <div className="absolute inset-0 bg-[#0a0a0f]/70 backdrop-blur-2xl"></div>

        {/* Animated Gradient Overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(135deg, rgba(201,162,75,0.15) 0%, transparent 50%, rgba(201,162,75,0.05) 100%)',
            animation: 'gradient-shift 14s ease-in-out infinite',
            backgroundSize: '200% 200%',
          }}
        ></div>

        {/* Top Glow */}
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[#10B981]/10 blur-[100px] animate-pulse-slow pointer-events-none" style={{ animation: 'glow-pulse 7s ease-in-out infinite' }}></div>

        {/* Console header */}
        <div className="relative bg-gradient-to-r from-[#10B981]/15 via-transparent to-transparent border-b border-[#10B981]/20 shrink-0 backdrop-blur-sm">
          <div className="flex items-center gap-2 px-5 pt-2.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981]/80" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="w-2 h-2 rounded-full bg-white/15" />
            <span className="ms-auto text-[9px] font-black tracking-[0.3em] text-white/30" dir="ltr">XTROET.AI // CONSOLE</span>
          </div>
          <div className="flex items-center justify-between px-5 pb-3 pt-1.5">
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-11 h-11 flex items-center justify-center border border-[#10B981]/40 bg-black/50 transition-all duration-700"
                style={isResponding ? { animation: 'breathe 3s ease-in-out infinite' } : {}}>
                <img src="/xtroet-logo.webp" alt="AI" className="w-9 h-9 object-cover rounded drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
              </div>
              <div>
                <h3 className="text-white font-heading font-black text-base tracking-wide" dir="ltr">XTROET AI</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" style={{ animation: 'glow-pulse 3.5s ease-in-out infinite' }}></span>
                  <span className="text-[10px] text-green-400/80 font-mono">
                    {isWaiting ? (lang === 'ar' ? 'يفكر...' : 'Thinking...') : isResponding ? (lang === 'ar' ? 'يكتب...' : 'Typing...') : (lang === 'ar' ? 'متصل' : 'Online')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="relative z-10 w-8 h-8 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all hover:rotate-90 border border-white/10"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="relative flex-1 overflow-y-auto scrollbar-ai" style={{ height: 'calc(100% - 120px)' }}>
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/40 to-transparent pointer-events-none z-10"></div>

          {showQuickActions && messages.length === 1 && (
            <div className="pt-4" style={{ animation: 'slide-up 0.7s ease-out' }}>
              <QuickActions lang={lang} onAsk={handleQuickAsk} />
            </div>
          )}

          <div className="p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex msg-enter ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div
                  className={`max-w-[88%] px-4 py-3 text-sm leading-relaxed shadow-lg ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-[#34D399] to-[#047857] text-white shadow-[#10B981]/20'
                      : 'bg-[#0d0d15]/80 border-s-2 border-s-[#10B981]/60 border-y border-e border-white/5 text-white/90 backdrop-blur-md'
                  }`}
                  style={msg.role === 'user' ? { clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)' } : undefined}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 flex items-center justify-center">
                        <img src="/xtroet-logo.webp" alt="AI" className="w-6 h-6 object-cover rounded" />
                      </div>
                      <span className="text-[10px] font-bold text-[#6EE7B7]/80 uppercase tracking-wider">XTROET AI</span>
                    </div>
                  )}
                  <span dir="auto" className={`ai-chat ${msg.role === 'user' ? 'text-white user-msg' : 'text-white/90'} whitespace-pre-wrap ${lang === 'ar' ? 'font-arabic' : ''}`}>
                    {renderFormattedText(msg.content)}
                  </span>
                </div>
              </div>
            ))}

            {isWaiting && (
              <div className="flex justify-start" style={{ animation: 'message-pop 0.5s ease-out' }}>
                <div className="bg-[#151525]/80 border border-white/5 rounded-2xl rounded-bl-md px-5 py-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#10B981] rounded-full" style={{ animation: 'dot-pulse 2.2s ease-in-out infinite' }}></span>
                    <span className="w-2 h-2 bg-[#10B981] rounded-full" style={{ animation: 'dot-pulse 2.2s ease-in-out infinite 0.3s' }}></span>
                    <span className="w-2 h-2 bg-[#10B981] rounded-full" style={{ animation: 'dot-pulse 2.2s ease-in-out infinite 0.6s' }}></span>
                  </div>
                </div>
              </div>
            )}
            {isResponding && !isWaiting && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start" style={{ animation: 'message-pop 0.5s ease-out' }}>
                <div className="bg-[#0d0d15]/80 border border-white/5 rounded-2xl rounded-bl-md px-4 py-3 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <img src="/xtroet-logo.webp" alt="AI" className="w-5 h-5 object-cover rounded" />
                    </div>
                    <span className="text-[10px] font-bold text-[#6EE7B7]/80 uppercase tracking-wider">XTROET AI</span>
                    <div className="flex items-center gap-1 mr-2">
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full" style={{ animation: 'dot-pulse 2s ease-in-out infinite' }}></span>
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full" style={{ animation: 'dot-pulse 2s ease-in-out infinite 0.25s' }}></span>
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full" style={{ animation: 'dot-pulse 2s ease-in-out infinite 0.5s' }}></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Command bar */}
        <div className="relative h-[60px] bg-black/70 border-t border-[#10B981]/20 px-3 flex items-center gap-2 backdrop-blur-xl">
          <span className="font-heading font-black text-lg text-[#10B981] shrink-0 ps-1" dir="ltr" aria-hidden="true">&gt;</span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={lang === 'ar' ? 'اسأل عن ناصر...' : 'Ask about XTROET...'}
              disabled={isWaiting}
              aria-label={lang === 'ar' ? 'اكتب سؤالك' : 'Type your question'}
              className={`w-full h-11 px-4 bg-white/5 border text-white placeholder-white/25 text-sm outline-none transition-all duration-500 focus:border-[#10B981]/60 focus:bg-white/10 disabled:opacity-50 ${isWaiting ? 'border-[#10B981]/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-white/10'}`}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isWaiting || isResponding}
            aria-label={lang === 'ar' ? 'إرسال' : 'Send'}
            className="cut-btn w-12 h-11 bg-gradient-to-b from-[#6EE7B7] to-[#047857] text-[#04120D] flex items-center justify-center transition-all duration-500 hover:brightness-110 active:scale-95 disabled:opacity-30 shadow-lg shadow-[#10B981]/20 flex-shrink-0"
          >
            {isWaiting ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5 rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
};
