/**
 * أنماط ساحات المنافسة (التحدي + الفرق) — ملف واحد مشترك.
 *
 * كانت هذه الأصناف معرّفة داخل ChallengeTab فقط، فصفحة الفرق كانت تطلع
 * بدون تنسيق (مربعات رمادية). الآن التبويبان يستوردان نفس السلسلة.
 */

const GOLD = '#D4AF37';
const GOLD_LT = '#F5DE84';
const GOLD_DK = '#9E7C21';
const EMERALD = '#10B981';

export const ARENA_CSS = `
.ch-card{position:relative;overflow:hidden}
.ch-card::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 80% at 50% -20%,rgba(212,175,55,.14),transparent 60%)}
.ch-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem}
.ch-side{position:relative;padding:1.15rem .9rem;border-radius:1.15rem;text-align:center;
  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);
  transition:transform .35s cubic-bezier(.16,1,.3,1),border-color .35s,box-shadow .35s}
.ch-side.win{border-color:${GOLD}AA;background:linear-gradient(180deg,rgba(212,175,55,.16),rgba(212,175,55,.04));
  box-shadow:0 0 0 1px ${GOLD}33,0 18px 44px -22px ${GOLD}99}
.ch-side.lose{opacity:.42;filter:grayscale(.55)}
.ch-vs-badge{font-size:1.55rem;line-height:1;filter:drop-shadow(0 3px 10px rgba(0,0,0,.7));
  animation:chPulse 2.4s ease-in-out infinite}
@keyframes chPulse{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.12);opacity:1}}
.ch-key{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.35rem;border-radius:1rem;
  font-weight:900;font-size:1.35rem;letter-spacing:.02em;direction:ltr;
  background:linear-gradient(180deg,${GOLD_LT},${GOLD} 55%,${GOLD_DK});color:#0B0906;
  box-shadow:0 14px 40px -12px ${GOLD}CC,inset 0 1px 0 rgba(255,255,255,.4);
  animation:chGlow 1.8s ease-in-out infinite}
@keyframes chGlow{0%,100%{box-shadow:0 14px 40px -14px ${GOLD}AA,inset 0 1px 0 rgba(255,255,255,.4)}
  50%{box-shadow:0 16px 52px -10px ${GOLD}EE,inset 0 1px 0 rgba(255,255,255,.5)}}
.ch-count{font-size:3rem;font-weight:900;line-height:1;direction:ltr;
  background:linear-gradient(180deg,#fff,${GOLD});-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;filter:drop-shadow(0 6px 18px rgba(212,175,55,.35))}
.ch-pop{animation:chPop .45s cubic-bezier(.34,1.56,.64,1)}
@keyframes chPop{0%{transform:scale(.82);opacity:.2}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
.ch-list{display:flex;flex-direction:column;gap:.4rem;max-height:330px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:rgba(212,175,55,.35) transparent}
.ch-list::-webkit-scrollbar{width:6px}
.ch-list::-webkit-scrollbar-thumb{background:rgba(212,175,55,.35);border-radius:99px}
.ch-chip{display:flex;align-items:center;gap:.55rem;padding:.5rem .7rem;border-radius:.8rem;
  background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);
  font-size:12px;font-weight:700;animation:chRow .35s ease both}
@keyframes chRow{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.ch-bar{height:5px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
.ch-bar>i{display:block;height:100%;border-radius:99px;
  background:linear-gradient(90deg,${GOLD_DK},${GOLD},${GOLD_LT});transition:width .5s ease}
.ch-opt{position:relative;padding:.85rem .95rem;border-radius:1rem;cursor:pointer;text-align:start;
  border:1.5px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);
  transition:all .28s cubic-bezier(.16,1,.3,1)}
.ch-opt:hover{transform:translateY(-2px);border-color:rgba(212,175,55,.45)}
.ch-opt.on{border-color:${GOLD};background:linear-gradient(180deg,rgba(212,175,55,.17),rgba(212,175,55,.04));
  box-shadow:0 12px 34px -18px ${GOLD}AA}
.ch-opt.on::after{content:"✓";position:absolute;top:.5rem;inset-inline-end:.7rem;font-weight:900;color:${GOLD}}
.ch-inp{width:100%;padding:.65rem .85rem;border-radius:.85rem;font-weight:700;font-size:14px;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);color:#fff;outline:none;
  transition:border-color .25s,box-shadow .25s}
.ch-inp:focus{border-color:${GOLD};box-shadow:0 0 0 3px ${GOLD}2E}
.ch-step{display:flex;align-items:center;gap:.55rem;font-size:11px;font-weight:900;
  letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.42)}
.ch-step.on{color:${GOLD}}
.ch-step.done{color:${EMERALD}}

/* ── خيارات أفقية: أيقونة + نص بسطر واحد (صفحة الفرق) ── */
.ch-opt-h{display:flex;align-items:center;gap:.8rem;padding:.7rem .85rem}
.ch-opt-h .ch-opt-t{min-width:0;flex:1}
.ch-opt-h .ch-opt-t p{margin:0}

/* ── صف فريق برقم: شارة دائرية + حقل ── */
.team-row{display:flex;align-items:center;gap:.6rem}
.team-num{flex-shrink:0;width:30px;height:30px;border-radius:99px;display:inline-flex;
  align-items:center;justify-content:center;font-size:12px;font-weight:900;direction:ltr;
  background:linear-gradient(180deg,rgba(212,175,55,.22),rgba(212,175,55,.07));
  border:1px solid rgba(212,175,55,.45);color:${GOLD_LT}}

/* ── ترويسة الساحة: توهج ذهبي + عنوان متدرج ── */
.arena-hero{position:relative;overflow:hidden}
.arena-hero::after{content:"";position:absolute;inset-inline:0;top:0;height:2px;
  background:linear-gradient(90deg,transparent,${GOLD},transparent);opacity:.8}
.arena-title{background:linear-gradient(180deg,#fff 30%,${GOLD_LT});-webkit-background-clip:text;
  background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 4px 16px rgba(212,175,55,.30))}

/* ── شريط تصويت متوهج للمتصدر ── */
.vote-lead{border-color:rgba(212,175,55,.5) !important;
  background:linear-gradient(180deg,rgba(212,175,55,.13),rgba(212,175,55,.03)) !important;
  box-shadow:0 12px 34px -20px ${GOLD}AA}
.vote-lead .ch-bar{background:rgba(212,175,55,.14)}
@keyframes voteStripes{from{background-position:0 0}to{background-position:28px 0}}
.vote-lead .ch-bar>i{background:linear-gradient(90deg,${GOLD_DK},${GOLD},${GOLD_LT});
  box-shadow:0 0 14px ${GOLD}88}
`;
