import React, { useEffect } from 'react';
import { supabase } from '../../supabase';
import { useStore } from '../../store';
import { GameStatus } from '../../types';

export const AuthSync: React.FC = () => {
    const { setSession, setUserProfile, setStatus } = useStore();

    useEffect(() => {
        // Initial session fetch
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            const currentStatus = useStore.getState().status;
            const protectedStatuses = [GameStatus.PROFILE, GameStatus.SHOP, GameStatus.LOBBY, GameStatus.ONLINE];
            
            if (session?.user) {
                fetchProfile(session.user.id);
                // Only redirect to MENU if they are on LANDING or AUTH
                if (currentStatus === GameStatus.LANDING || currentStatus === GameStatus.AUTH) {
                    setStatus(GameStatus.MENU);
                }
            } else {
                // Not logged in. Redirect to LANDING if they are on a protected route or MENU
                if (currentStatus === GameStatus.MENU || protectedStatuses.includes(currentStatus)) {
                    setStatus(GameStatus.LANDING);
                }
            }
        });

        // Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            const currentStatus = useStore.getState().status;
            const protectedStatuses = [GameStatus.PROFILE, GameStatus.SHOP, GameStatus.LOBBY, GameStatus.ONLINE];

            if (session?.user) {
                fetchProfile(session.user.id);
                if (currentStatus === GameStatus.LANDING || currentStatus === GameStatus.AUTH) {
                    setStatus(GameStatus.MENU);
                }
            } else {
                setUserProfile(null);
                if (currentStatus === GameStatus.MENU || protectedStatuses.includes(currentStatus)) {
                    setStatus(GameStatus.LANDING);
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            // If profile doesn't exist but user is logged in via OAuth, we should create it
            if (error.code === 'PGRST116') { // Not Found
                const user = (await supabase.auth.getUser()).data.user;
                if (user) {
                    const newProfile = {
                        id: userId,
                        username: user.user_metadata?.full_name || user.user_metadata?.name || 'Runner_' + Math.floor(Math.random() * 1000),
                        avatar_url: user.user_metadata?.avatar_url || null,
                        points: 0,
                        current_level: 1,
                        current_map: 1,
                    };
                    await supabase.from('profiles').insert([newProfile]);
                    setUserProfile(newProfile as any);
                }
            }
        } else if (data) {
            setUserProfile(data);
        }
    };

    return null;
};
