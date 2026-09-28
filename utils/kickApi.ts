export async function kickFetch(endpoint: string, cacheBust = true): Promise<any> {
    // استخدام البروكسي الخاص بنا الذي أنشأناه في Vercel
    const proxyUrl = `/api/kick?endpoint=${encodeURIComponent(endpoint)}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(proxyUrl, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
            throw new Error(`Proxy failed with status ${response.status}`);
        }
        
        const data = await response.json();
        return data;

    } catch (error) {
        console.error(`[kickFetch] Failed for ${endpoint}:`, error);
        return null; // في حالة الفشل، نرجع null بأمان
    }
}