import React, { useEffect } from 'react';
import { supabase } from '../../supabase';
import { useStore } from '../../store';
import { GameStatus } from '../../types';

export const MultiplayerSync: React.FC = () => {
    const { roomId, localUserId, status, distance, score, lives, countdown, updateOnlinePlayer } = useStore();

    // Sync local state to Supabase
    useEffect(() => {
        if (!roomId || !localUserId || status !== GameStatus.ONLINE) return;

        const syncInterval = setInterval(async () => {
            try {
                const state = useStore.getState();
                const myOnlineData = state.onlinePlayers.find(p => p.user_id === localUserId);
                await supabase
                    .from('players')
                    .update({ 
                        distance: Math.floor(state.distance),
                        score: state.score,
                        is_dead: state.lives <= 0 || (myOnlineData?.is_dead),
                        is_finished: state.status === GameStatus.LEVEL_COMPLETE || state.status === GameStatus.VICTORY,
                        lane: myOnlineData?.lane || 0,
                        y: myOnlineData?.y || 0,
                        z: myOnlineData?.z || 0
                    })
                    .eq('user_id', localUserId)
                    .eq('room_id', roomId);
            } catch (err) {
                // Ignore sync errors to prevent console spam
            }
        }, 50); // 50ms sync for ultra smooth leaps and lane changes

        return () => clearInterval(syncInterval);
    }, [roomId, localUserId, status]);

    // Listen for other players' updates
    useEffect(() => {
        if (!roomId || !localUserId) return;

        const channel = supabase
            .channel(`room-sync-${roomId}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'players', 
                filter: `room_id=eq.${roomId}` 
            }, (payload) => {
                const updatedPlayer = payload.new;
                if (updatedPlayer.user_id !== localUserId) {
                    updateOnlinePlayer(updatedPlayer.user_id, {
                        distance: updatedPlayer.distance,
                        score: updatedPlayer.score,
                        is_dead: updatedPlayer.is_dead,
                        is_finished: updatedPlayer.is_finished,
                        lane: updatedPlayer.lane,
                        y: updatedPlayer.y,
                        z: updatedPlayer.z
                    });

                    // Check for multiplayer end conditions
                    const state = useStore.getState();
                    if (state.status === GameStatus.ONLINE && state.countdown <= 0) {
                        const onlineArr = state.onlinePlayers;
                        const localPlayer = onlineArr.find(p => p.user_id === localUserId);
                        const opponents = onlineArr.filter(p => p.user_id !== localUserId);
                        const aliveOpponents = opponents.filter(p => !p.is_dead);
                        const isLastAlive = aliveOpponents.length === 0;

                        if (isLastAlive) {
                            if (state.lives <= 0 && localPlayer?.is_dead) {
                                // Everyone is dead, game over
                                useStore.getState().setStatus(GameStatus.GAME_OVER);
                            }
                        }
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, localUserId, updateOnlinePlayer]);

    return null;
};
