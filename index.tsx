import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/** /admin is a standalone command room — never rendered inside the main page. */
const AdminPage = React.lazy(() => import('./components/AdminDashboard'));

/**
 * Catches a render crash and shows something instead of a black page.
 *
 * Without this, any throw during the first render leaves `<div id="root">`
 * empty and the visitor only sees the black body — with no way to tell what
 * happened. The message is deliberately plain: this is the one screen shown to
 * a visitor who cannot act on a stack trace.
 */
class RootBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: unknown) {
        console.error('[xtroet] render failed', error, info);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div dir="rtl" style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '1rem',
                padding: '2rem', textAlign: 'center', background: '#04120D', color: '#fff',
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            }}>
                <div style={{ fontSize: '2.5rem' }}>⚠️</div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>الموقع ما قدر يشتغل</h1>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', maxWidth: '32rem', margin: 0, lineHeight: 1.9 }}>
                    صار خطأ أثناء تحميل الصفحة. جرّب تحديث الصفحة، وإذا تكرر — افتح الموقع من متصفح ثاني.
                </p>
                <code style={{
                    color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', maxWidth: '32rem',
                    wordBreak: 'break-word', direction: 'ltr',
                }}>
                    {error.message}
                </code>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '0.5rem', padding: '0.75rem 1.75rem', borderRadius: '14px',
                        border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.9rem',
                        background: 'linear-gradient(180deg,#8CFF5C,#53FC18 55%,#2b9e1c)', color: '#04120D',
                    }}
                >
                    أعد تحميل الصفحة
                </button>
            </div>
        );
    }
}

/** Shown until React mounts. The body is black, so a plain dark loader. */
function Boot({ admin = false }: { admin?: boolean }) {
    return (
        <div style={{
            minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '0.9rem',
            alignItems: 'center', justifyContent: 'center',
            background: admin ? '#050403' : '#04120D',
            color: admin ? 'rgba(201,162,75,0.7)' : 'rgba(255,255,255,0.5)',
            fontFamily: 'system-ui, sans-serif', fontSize: '0.85rem', letterSpacing: '0.2em',
        }}>
            {admin && <div style={{ fontSize: '2rem' }}>👑</div>}
            <div>{admin ? 'COMMAND ROOM' : 'XTROET…'}</div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Could not find root element to mount to');
}

rootElement.innerHTML = '';
const boot = document.createElement('div');
boot.id = 'xtroet-boot';
rootElement.appendChild(boot);

const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname);

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <RootBoundary>
            {isAdmin ? (
                <React.Suspense fallback={<Boot admin />}>
                    <AdminPage />
                </React.Suspense>
            ) : (
                <App />
            )}
        </RootBoundary>
    </React.StrictMode>,
);

// Remove the placeholder once React has painted, whatever it painted.
requestAnimationFrame(() => document.getElementById('xtroet-boot')?.remove());