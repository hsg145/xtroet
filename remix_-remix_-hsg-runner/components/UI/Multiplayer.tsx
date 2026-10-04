import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, LogIn, Shield, Globe, Play, X, Loader2, User, Timer, Copy, Check } from 'lucide-react';
import { supabase } from '../../supabase';
import { useStore } from '../../store';
import { GameStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export const Multiplayer: React.FC = () => {
  const { setStatus, setRoomId, setRoomCode, setIsHost, setPlayers, setMultiplayerMode, startOnlineGame, roomId, roomCode, isHost, players, multiplayerMode, localUserId, setLocalUserId, mapId, setMapId } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [userName] = useState(`Runner_${Math.floor(Math.random() * 1000)}`);

  const MAP_NAMES = ["", "CYBERPUNK", "NEON DESERT", "SYNTH WAVE", "VOID SPACE", "MATRIX GREEN", "INFERNO RED"];

  // Initialize localUserId if not set
  useEffect(() => {
    if (!localUserId) {
      setLocalUserId(uuidv4());
    }
  }, [localUserId, setLocalUserId]);

  const userId = localUserId || '';

  // Subscribe to room updates
  useEffect(() => {
    if (!roomId) return;

    const roomSubscription = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        if (payload.eventType === 'DELETE') {
          setRoomId(null);
          setRoomCode(null);
          setIsHost(false);
          setPlayers([]);
          setError("Host closed the room.");
          return;
        }
        if (payload.new) {
          if (payload.new.status === 'PLAYING') {
            startOnlineGame();
          }
          if (payload.new.map_id && payload.new.map_id !== mapId) {
            setMapId(payload.new.map_id);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, async () => {
        fetchPlayers(roomId);
      })
      .subscribe();

    const interval = setInterval(() => {
      updatePresence();
    }, 5000);

    return () => {
      supabase.removeChannel(roomSubscription);
      clearInterval(interval);
    };
  }, [roomId]);

  const fetchPlayers = async (id: string) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', id);
    
    if (data) {
      setPlayers(data);
      // Auto-start if 5 players
      if (isHost && data.length >= 5) {
        startGame();
      }
    }
  };

  const updatePresence = async () => {
    if (!roomId) return;
    await supabase
      .from('players')
      .update({ last_seen: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('room_id', roomId);
  };

  const startMatchmaking = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. البحث عن غرفة عامة موجودة في حالة LOBBY ولم تمتلئ
      const { data: existingRoom, error: findError } = await supabase
        .from('rooms')
        .select('*')
        .eq('mode', 'PUBLIC')
        .eq('status', 'LOBBY')
        .lt('player_count', 5)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingRoom) {
        // إذا وجدت غرفة، انضم إليها
        await joinRoom(existingRoom.id);
      } else {
        // إذا لم تجد، أنشئ غرفة جديدة
        await createRoom('PUBLIC');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const createRoom = async (mode: 'PUBLIC' | 'PRIVATE') => {
    setLoading(true);
    setError(null);
    const shortId = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert([{ host_id: userId, mode, status: 'LOBBY', player_count: 1, short_id: shortId, map_id: useStore.getState().mapId }])
        .select()
        .single();

      if (roomError) throw roomError;

      const { error: playerError } = await supabase
        .from('players')
        .insert([{ room_id: room.id, user_id: userId, name: userName, is_ready: true }]);

      if (playerError) throw playerError;

      setRoomId(room.id);
      setRoomCode(room.short_id);
      setIsHost(true);
      setMultiplayerMode(mode);
      setPlayers([{ user_id: userId, name: userName, is_ready: true }]);
      
      // Set 5-minute timeout
      setTimeout(async () => {
        const { data: currentPlayers } = await supabase.from('players').select('id').eq('room_id', room.id);
        if (currentPlayers && currentPlayers.length <= 1) {
          await supabase.from('rooms').delete().eq('id', room.id);
          if (useStore.getState().roomId === room.id) {
            setRoomId(null);
            setRoomCode(null);
            setIsHost(false);
            setError("Room timed out - no players joined.");
          }
        }
      }, 300000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (id?: string) => {
    setLoading(true);
    setError(null);
    const targetId = id || joinCode;
    if (!targetId) {
      setError("Please enter a room ID");
      setLoading(false);
      return;
    }

    try {
      // البحث عن الغرفة بالكود القصير أو المعرف الكامل
      let query = supabase.from('rooms').select('*').eq('status', 'LOBBY');
      
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
      if (isUuid) {
        query = query.eq('id', targetId);
      } else {
        query = query.eq('short_id', targetId);
      }

      const { data: rooms, error: roomError } = await query;

      if (roomError || !rooms || rooms.length === 0) {
        throw new Error("Room not found or already started");
      }

      const room = rooms[0];

      // إضافة اللاعب للغرفة
      const { error: playerError } = await supabase
        .from('players')
        .insert([{ room_id: room.id, user_id: userId, name: userName }]);

      if (playerError) throw playerError;

      // تحديث عدد اللاعبين في الغرفة
      await supabase.from('rooms').update({ player_count: room.player_count + 1 }).eq('id', room.id);

      setRoomId(room.id);
      setRoomCode(room.short_id);
      setIsHost(false);
      setMultiplayerMode(room.mode);
      if (room.map_id) setMapId(room.map_id);
      fetchPlayers(room.id);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (!roomId || !isHost) return;
    
    // Reset all players in this room in the DB before starting
    await supabase.from('players').update({
        distance: 0,
        score: 0,
        is_dead: false,
        is_finished: false,
        lane: 0,
        y: 0,
        z: 0
    }).eq('room_id', roomId);

    await supabase.from('rooms').update({ status: 'PLAYING', start_time: new Date().toISOString() }).eq('id', roomId);
    startOnlineGame();
  };

  const leaveRoom = async () => {
    if (!roomId) return;
    
    if (isHost) {
      // إذا كان المضيف، نحذف الغرفة بالكامل (سيتم حذف اللاعبين تلقائياً بسبب Cascade)
      await supabase.from('rooms').delete().eq('id', roomId);
    } else {
      // إذا كان لاعب عادي، يخرج هو فقط
      await supabase.from('players').delete().eq('user_id', userId).eq('room_id', roomId);
      // تحديث عدد اللاعبين في الغرفة
      const { data: room } = await supabase.from('rooms').select('player_count').eq('id', roomId).single();
      if (room) {
        await supabase.from('rooms').update({ player_count: Math.max(0, room.player_count - 1) }).eq('id', roomId);
      }
    }

    useStore.getState().resetOnlineState();
  };

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateMap = async (dir: number) => {
    let nextMap = mapId + dir;
    if (nextMap < 1) nextMap = 6;
    if (nextMap > 6) nextMap = 1;
    setMapId(nextMap);
    await supabase.from('rooms').update({ map_id: nextMap }).eq('id', roomId);
  };

  if (roomId) {
    return (
      <div className="absolute inset-0 bg-[#050011]/95 z-[200] flex items-center justify-center p-4 font-cyber">
        <div className="w-full max-w-2xl bg-black/60 border border-cyan-500/30 rounded-[40px] p-8 backdrop-blur-xl">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-4xl font-black italic text-white tracking-tighter">LOBBY</h2>
              <p className="text-cyan-400/60 text-xs tracking-widest uppercase mt-1 flex items-center">
                {multiplayerMode} ROOM CODE: 
                <span 
                  className="text-white font-mono text-xl ml-2 cursor-pointer hover:text-cyan-400 transition-colors flex items-center group"
                  onClick={handleCopy}
                  title="Click to copy"
                >
                  {roomCode}
                  {copied ? (
                    <Check className="ml-2 w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="ml-2 w-4 h-4 text-white/30 group-hover:text-cyan-400 transition-colors" />
                  )}
                </span>
              </p>
            </div>
            <button onClick={leaveRoom} className="p-2 hover:bg-red-500/20 rounded-full transition-colors">
              <X className="text-red-500" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {players.map((p) => (
              <div key={p.user_id} className="flex items-center space-x-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <User className="text-cyan-400 w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-white font-bold">{p.name} {p.user_id === userId && "(YOU)"}</div>
                  <div className="text-[10px] text-cyan-400/50 uppercase tracking-widest">
                    {p.user_id === players[0]?.user_id ? "HOST" : "READY"}
                  </div>
                </div>
              </div>
            ))}
            {Array.from({ length: 5 - players.length }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 bg-white/5 p-4 rounded-2xl border border-white/10 opacity-30 border-dashed">
                <div className="p-2 bg-gray-500/20 rounded-lg">
                  <Loader2 className="text-gray-400 w-5 h-5 animate-spin" />
                </div>
                <div className="text-gray-500 font-bold italic uppercase text-xs">Waiting...</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center justify-between bg-white/10 p-4 rounded-xl w-full border border-white/5">
              <span className="text-cyan-400 font-bold uppercase tracking-widest text-xs">ENVIRONMENT:</span>
              <div className="flex items-center space-x-4">
                {isHost && (
                  <button onClick={() => updateMap(-1)} className="hover:text-cyan-300 text-white font-bold p-2">&lt;</button>
                )}
                <span className="text-white font-black text-sm">{MAP_NAMES[mapId]}</span>
                {isHost && (
                  <button onClick={() => updateMap(1)} className="hover:text-cyan-300 text-white font-bold p-2">&gt;</button>
                )}
              </div>
            </div>

            {isHost ? (
              <button 
                onClick={startGame}
                disabled={players.length < 2}
                className="w-full py-4 bg-cyan-500 text-black font-black text-xl rounded-2xl hover:bg-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(6,182,212,0.4)] flex items-center justify-center"
              >
                START MISSION <Play className="ml-2 fill-black" />
              </button>
            ) : (
              <div className="text-cyan-400 animate-pulse font-bold tracking-widest uppercase text-sm">
                Waiting for host to initiate...
              </div>
            )}
            <div className="flex items-center text-white/40 text-[10px] tracking-widest uppercase">
              <Timer className="w-3 h-3 mr-2" /> Auto-start at 5 players
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[#050011]/95 z-[200] flex items-center justify-center p-4 font-cyber">
      <div className="w-full max-w-xl bg-black/60 border border-cyan-500/30 rounded-[40px] p-8 backdrop-blur-xl">
        <div className="flex justify-between items-center mb-12">
          <h2 className="text-5xl font-black italic text-white tracking-tighter">ONLINE</h2>
          <button onClick={() => setStatus(GameStatus.MENU)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="text-white/50" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={startMatchmaking}
            disabled={loading}
            className="group flex items-center justify-between p-6 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-3xl transition-all"
          >
            <div className="flex items-center space-x-4">
              <div className="p-4 bg-cyan-500/20 rounded-2xl">
                <Globe className="text-cyan-400 w-8 h-8" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-black text-white italic uppercase">Public Room</div>
                <div className="text-[10px] text-cyan-400/60 tracking-widest uppercase">Open to all runners</div>
              </div>
            </div>
            <Plus className="text-cyan-400 group-hover:scale-125 transition-transform" />
          </button>

          <button 
            onClick={() => createRoom('PRIVATE')}
            disabled={loading}
            className="group flex items-center justify-between p-6 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-3xl transition-all"
          >
            <div className="flex items-center space-x-4">
              <div className="p-4 bg-purple-500/20 rounded-2xl">
                <Shield className="text-purple-400 w-8 h-8" />
              </div>
              <div className="text-left">
                <div className="text-2xl font-black text-white italic uppercase">Private Room</div>
                <div className="text-[10px] text-purple-400/60 tracking-widest uppercase">Play with friends</div>
              </div>
            </div>
            <Plus className="text-purple-400 group-hover:scale-125 transition-transform" />
          </button>

          <div className="relative mt-4">
            <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
              <LogIn className="text-white/20 w-6 h-6" />
            </div>
            <input 
              type="text"
              placeholder="ENTER ROOM ID..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-3xl py-6 pl-16 pr-32 text-white font-black italic tracking-widest focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
            <button 
              onClick={() => joinRoom()}
              disabled={loading || !joinCode}
              className="absolute right-2 top-2 bottom-2 px-8 bg-white text-black font-black text-xs rounded-2xl hover:bg-cyan-400 transition-all disabled:opacity-50"
            >
              JOIN
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-8 flex items-center justify-center text-cyan-400 space-x-2">
            <Loader2 className="animate-spin" />
            <span className="font-black italic tracking-widest uppercase text-xs">Establishing Neural Link...</span>
          </div>
        )}
      </div>
    </div>
  );
};
