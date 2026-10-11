/**
 * مسار واحد للدخول إلى API الإدارة.
 *
 * منفصل في ملف لوحده عشان ما يصير استيراد دائري: لوحة الإدارة تستخدمه،
 * وتبويب التحدي يستخدمه، والاتنين ما يستوردوا بعض.
 */

const TOKEN_KEY = 'xtr_admin_token';
const DEV_KEY = 'xtr_admin_device';

export const ADMIN_TOKEN_KEY = TOKEN_KEY;

function deviceId(): string {
  try {
    let d = localStorage.getItem(DEV_KEY);
    if (!d) {
      const c = globalThis.crypto as Crypto | undefined;
      d = c && 'randomUUID' in c ? c.randomUUID() : `dev-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
      localStorage.setItem(DEV_KEY, d);
    }
    return d;
  } catch {
    return 'unknown-device';
  }
}

/**
 * نداء واحد للإدارة. يرمي `unauthorized` عند انتهاء الجلسة حتى تقدر
 * الواجهة تطلع المستخدم للدخول، ويرمي خطأ فيه `data.error` للباقي.
 */
export async function callAdmin(action: string, params: Record<string, unknown> = {}): Promise<any> {
  const token = sessionStorage.getItem(TOKEN_KEY) || '';
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, deviceId: deviceId(), token, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('unauthorized');
  if (!r.ok) {
    const e: any = new Error(j.error || 'failed');
    e.data = j;
    throw e;
  }
  return j;
}