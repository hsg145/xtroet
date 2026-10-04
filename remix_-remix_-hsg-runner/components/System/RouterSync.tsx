import React, { useEffect } from 'react';
import { useStore } from '../../store';
import { GameStatus } from '../../types';

const statusToPath: Record<GameStatus, string> = {
    [GameStatus.LANDING]: '/',
    [GameStatus.MENU]: '/menu',
    [GameStatus.AUTH]: '/login',
    [GameStatus.PROFILE]: '/profile',
    [GameStatus.ABOUT]: '/about',
    [GameStatus.PRIVACY]: '/privacy',
    [GameStatus.TERMS]: '/terms',
    [GameStatus.CONTACT]: '/contact',
    [GameStatus.GUIDELINES]: '/guidelines',
    [GameStatus.PLAYING]: '/play',
    [GameStatus.LOBBY]: '/lobby',
    [GameStatus.SHOP]: '/shop',
    [GameStatus.LEVEL_SELECT]: '/levels',
    [GameStatus.ONLINE]: '/online',
    [GameStatus.LEVEL_COMPLETE]: '/complete',
    [GameStatus.GAME_OVER]: '/gameover',
    [GameStatus.VICTORY]: '/victory',
    [GameStatus.PAUSED]: '/paused'
};

const pathToStatus: Record<string, GameStatus> = Object.entries(statusToPath).reduce((acc, [key, value]) => {
    acc[value] = key as GameStatus;
    return acc;
}, {} as Record<string, GameStatus>);

export const RouterSync: React.FC = () => {
    const { status, setStatus } = useStore();

    // 1. On initial load, read URL and set status (but allow AuthSync to override if needed)
    useEffect(() => {
        const path = window.location.pathname;
        const mappedStatus = pathToStatus[path];
        if (mappedStatus && mappedStatus !== GameStatus.LANDING && mappedStatus !== GameStatus.MENU) {
            // We only override initial load for static pages or specific routes
            // Menu and Landing are handled by AuthSync based on authentication
            setStatus(mappedStatus);
        }
    }, []);

    // 2. When status changes, update the URL
    useEffect(() => {
        const path = statusToPath[status];
        if (path && window.location.pathname !== path) {
            window.history.pushState(null, '', path);
        }
    }, [status]);

    // 3. Handle browser back/forward buttons
    useEffect(() => {
        const handlePopState = () => {
            const path = window.location.pathname;
            const mappedStatus = pathToStatus[path];
            if (mappedStatus) {
                setStatus(mappedStatus);
            } else {
                setStatus(GameStatus.LANDING); // Fallback
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    return null;
};
