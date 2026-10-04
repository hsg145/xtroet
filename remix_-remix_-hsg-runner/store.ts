
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GameStatus, RUN_SPEED_BASE } from './types';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

export interface OnlinePlayer {
  user_id: string;
  name: string;
  trackOffset: number;
  distance: number;
  score: number;
  lane: number;
  y: number;
  z: number;
  is_dead: boolean;
  is_finished: boolean;
}
export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  points: number;
  current_level: number;
  current_map: number;
}

interface GameState {
  // Supabase Auth & Profile
  session: Session | null;
  userProfile: UserProfile | null;
  setSession: (session: Session | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  syncProfileToSupabase: (updates: Partial<UserProfile>) => Promise<void>;
  
  status: GameStatus;
  score: number;
  levelScore: number;
  lives: number;
  maxLives: number;
  speed: number;
  collectedLetters: number[]; 
  level: number;
  unlockedLevels: number;
  laneCount: number;
  gemsCollected: number;
  distance: number;
  targetDistance: number;
  mapId: number;
  
  // Inventory / Abilities
  hasDoubleJump: boolean;
  hasImmortality: boolean;
  isImmortalityActive: boolean;
  isImmortalityActive_timer?: number;
  hasMagnet: boolean;
  hasShield: boolean;
  hasDash: boolean;
  isDashActive: boolean;
  hasTimeWarp: boolean;
  hasMultiplier: boolean;
  hasLaser: boolean;

  // Characters
  unlockedCharacters: string[];
  selectedCharacter: string;

  // Colors & Accessories
  unlockedColors: string[];
  selectedColor: string;
  unlockedAccessories: string[];
  selectedAccessory: string | null;

  // Heart Power
  heartPowerLevel: number;
  currentLifeHits: number;

  // Actions
  startGame: (level?: number) => void;
  startNextLevel: () => void;
  restartGame: () => void;
  takeDamage: () => void;
  addScore: (amount: number) => void;
  collectGem: (value: number) => void;
  collectLetter: (index: number) => void;
  setStatus: (status: GameStatus) => void;
  setDistance: (dist: number) => void;
  setTargetDistance: (dist: number) => void;
  setMapId: (id: number) => void;
  
  // Shop / Abilities
  buyItem: (type: 'DOUBLE_JUMP' | 'MAX_LIFE' | 'HEAL' | 'IMMORTAL' | 'MAGNET' | 'SHIELD' | 'DASH' | 'TIME_WARP' | 'MULTIPLIER' | 'LASER' | 'CHARACTER' | 'COLOR' | 'ACCESSORY' | 'HEART_POWER', cost: number, itemId?: string) => boolean;
  selectCharacter: (id: string) => void;
  selectColor: (id: string) => void;
  selectAccessory: (id: string | null) => void;
  completeLevel: () => void;
  openShop: () => void;
  closeShop: () => void;
  activateImmortality: () => void;
  activateDash: () => void;
  preShopStatus: GameStatus | null;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  toggleEffects: () => void;
  toggleSound: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  
  // Multiplayer State
  localUserId: string | null;
  roomId: string | null;
  roomCode: string | null;
  isHost: boolean;
  players: any[];
  onlinePlayers: OnlinePlayer[];
  multiplayerMode: 'PUBLIC' | 'PRIVATE' | null;
  countdown: number;
  
  setLocalUserId: (id: string) => void;
  setRoomId: (id: string | null) => void;
  setRoomCode: (code: string | null) => void;
  setIsHost: (isHost: boolean) => void;
  setPlayers: (players: any[]) => void;
  setOnlinePlayers: (players: OnlinePlayer[]) => void;
  updateOnlinePlayer: (id: string, data: Partial<OnlinePlayer>) => void;
  setMultiplayerMode: (mode: 'PUBLIC' | 'PRIVATE' | null) => void;
  startOnlineGame: () => void;
  resetOnlineState: () => void;
}

const HSG_TARGET = ['H', 'S', 'G', 'R', 'U', 'N'];
const MAX_LEVEL = 9999; // Practically infinite

export const useStore = create<GameState>()(
  persist(
    (set, get) => ({
      session: null,
      userProfile: null,
      setSession: (session) => set({ session }),
      setUserProfile: (profile) => {
          if (profile) {
              set({ 
                  userProfile: profile,
                  score: profile.points,
                  level: profile.current_level,
                  unlockedLevels: Math.max(get().unlockedLevels, profile.current_level),
                  mapId: profile.current_map
              });
          } else {
              set({ userProfile: null });
          }
      },
      syncProfileToSupabase: async (updates) => {
          const { session, userProfile } = get();
          if (session?.user && userProfile) {
              const newProfile = { ...userProfile, ...updates };
              set({ userProfile: newProfile });
              await supabase.from('profiles').update(updates).eq('id', session.user.id);
          }
      },
      status: GameStatus.LANDING,
  score: 0,
  levelScore: 0,
  lives: 3,
  maxLives: 3,
  speed: 0,
  collectedLetters: [],
  level: 1,
  unlockedLevels: 1,
  laneCount: 3,
  gemsCollected: 0,
  distance: 0,
  targetDistance: 1000,
  mapId: 1,
  setMapId: (id) => set({ mapId: id }),
  
  hasDoubleJump: false,
  hasImmortality: false,
  isImmortalityActive: false,
  hasMagnet: false,
  hasShield: false,
  hasDash: false,
  isDashActive: false,
  hasTimeWarp: false,
  hasMultiplier: false,
  hasLaser: false,
  preShopStatus: null,
  effectsEnabled: true,
  soundEnabled: true,
  unlockedCharacters: ['default'],
  selectedCharacter: 'default',
  unlockedColors: ['char_default_color'],
  selectedColor: 'char_default_color',
  unlockedAccessories: [],
  selectedAccessory: null,
  heartPowerLevel: 1,
  currentLifeHits: 1,

  startGame: (level = 1) => {
    const { maxLives, hasDoubleJump, hasImmortality, selectedCharacter } = get();
    
    // Character Stat Multipliers
    let speedMult = 1.0;
    if (selectedCharacter === 'char_neon') speedMult = 1.15;
    if (selectedCharacter === 'char_gold') speedMult = 0.9;
    if (selectedCharacter === 'char_void') speedMult = 1.05;

    set({ 
      status: GameStatus.PLAYING, 
      score: get().score,
      levelScore: 0,
      lives: maxLives, 
      maxLives: maxLives,
      speed: (RUN_SPEED_BASE + 5 + Math.min(level * 0.5, 25)) * speedMult,
      collectedLetters: [],
      level: level,
      laneCount: Math.min(3 + Math.floor(level / 10), 9),
      gemsCollected: 0,
      distance: 0,
      targetDistance: 800 + (level * 200),
      hasDoubleJump: hasDoubleJump,
      hasImmortality: hasImmortality,
      isImmortalityActive: false,
      hasMagnet: get().hasMagnet,
      hasShield: get().hasShield,
      hasDash: get().hasDash,
      isDashActive: false,
      hasTimeWarp: get().hasTimeWarp,
      hasMultiplier: get().hasMultiplier,
      hasLaser: get().hasLaser,
      // Clear online state if starting single player
      roomId: null,
      roomCode: null,
      onlinePlayers: [],
      currentLifeHits: get().heartPowerLevel
    });
  },

  startNextLevel: () => {
    const nextLevel = get().level + 1;
    get().startGame(nextLevel);
  },

  restartGame: () => {
    const { level, maxLives, hasDoubleJump, hasImmortality, selectedCharacter } = get();
    
    // Character Stat Multipliers
    let speedMult = 1.0;
    if (selectedCharacter === 'char_neon') speedMult = 1.15;
    if (selectedCharacter === 'char_gold') speedMult = 0.9;
    if (selectedCharacter === 'char_void') speedMult = 1.05;

    set({ 
      status: GameStatus.PLAYING, 
      score: get().score, 
      levelScore: 0,
      lives: maxLives, 
      maxLives: maxLives,
      speed: (RUN_SPEED_BASE + 5 + Math.min(level * 0.5, 25)) * speedMult,
      collectedLetters: [],
      level: level,
      laneCount: Math.min(3 + Math.floor(level / 10), 9),
      gemsCollected: 0,
      distance: 0,
      targetDistance: 800 + (level * 200),
      hasDoubleJump: hasDoubleJump,
      hasImmortality: hasImmortality,
      isImmortalityActive: false,
      hasMagnet: get().hasMagnet,
      hasShield: get().hasShield,
      hasDash: get().hasDash,
      isDashActive: false,
      hasTimeWarp: get().hasTimeWarp,
      hasMultiplier: get().hasMultiplier,
      hasLaser: get().hasLaser,
      // Clear online state if restarting single player
      roomId: null,
      roomCode: null,
      onlinePlayers: [],
      currentLifeHits: get().heartPowerLevel
    });
  },

  takeDamage: () => {
    const { lives, isImmortalityActive, isDashActive, status, localUserId, hasShield, currentLifeHits, heartPowerLevel } = get();
    if (isImmortalityActive || isDashActive) return;

    if (hasShield) {
        set({ hasShield: false });
        return;
    }

    if (currentLifeHits > 1) {
        set({ currentLifeHits: currentLifeHits - 1 });
        return;
    }

    if (lives > 1) {
      set({ lives: lives - 1, currentLifeHits: heartPowerLevel });
    } else {
      if (status === GameStatus.ONLINE) {
         set({ lives: 0, speed: 0 }); // Stay online, speed 0 stops movement
         if (localUserId) {
            get().updateOnlinePlayer(localUserId, { is_dead: true });
         }
      } else {
         set({ lives: 0, status: GameStatus.GAME_OVER, speed: 0 });
      }
    }
  },

  addScore: (amount) => {
      const newScore = get().score + amount;
      set((state) => ({ score: newScore, levelScore: state.levelScore + amount }));
      get().syncProfileToSupabase({ points: newScore });
  },
  
  collectGem: (value) => {
      const { hasMultiplier } = get();
      const actualValue = value * (hasMultiplier ? 2 : 1);
      const newScore = get().score + actualValue;
      set((state) => ({ 
        score: newScore, 
        levelScore: state.levelScore + actualValue,
        gemsCollected: state.gemsCollected + 1 
      }));
      get().syncProfileToSupabase({ points: newScore });
  },

  setDistance: (dist) => set((state) => {
    const newState: Partial<GameState> = { distance: dist };
    if (state.status === GameStatus.ONLINE && state.localUserId) {
      newState.onlinePlayers = state.onlinePlayers.map(p => 
        p.user_id === state.localUserId ? { ...p, distance: dist } : p
      );
    }
    return newState;
  }),
  setTargetDistance: (dist) => set({ targetDistance: dist }),

  collectLetter: (index) => {
    const { collectedLetters, level, speed, unlockedLevels } = get();
    
    if (!collectedLetters.includes(index)) {
      const newLetters = [...collectedLetters, index];
      const speedIncrease = RUN_SPEED_BASE * 0.10;
      const nextSpeed = speed + speedIncrease;

      set({ 
        collectedLetters: newLetters,
        speed: nextSpeed,
        score: get().score + 1000,
        levelScore: get().levelScore + 1000
      });
    }
  },

  completeLevel: () => {
      const currentLevel = get().level;
      const currentUnlocked = get().unlockedLevels;
      set({
          status: GameStatus.LEVEL_COMPLETE,
          collectedLetters: [],
          unlockedLevels: Math.max(currentUnlocked, currentLevel + 1)
      });
  },

  openShop: () => set({ preShopStatus: get().status, status: GameStatus.SHOP }),
  
  closeShop: () => set({ status: get().preShopStatus || GameStatus.LEVEL_SELECT, preShopStatus: null }),

  buyItem: (type, cost, itemId) => {
      const { score, maxLives, lives, unlockedCharacters } = get();
      
      if (score >= cost) {
          set({ score: score - cost });
          
          if (type === 'UPGRADE') {
              switch (itemId) {
                  case 'DOUBLE_JUMP':
                      set({ hasDoubleJump: true });
                      break;
                  case 'MAX_LIFE':
                      set({ maxLives: maxLives + 1, lives: lives + 1 });
                      break;
                  case 'HEAL':
                      set({ lives: Math.min(lives + 1, maxLives) });
                      break;
                  case 'IMMORTAL':
                      set({ hasImmortality: true });
                      break;
                  case 'MAGNET':
                      set({ hasMagnet: true });
                      break;
                  case 'SHIELD':
                      set({ hasShield: true });
                      break;
                  case 'DASH':
                      set({ hasDash: true });
                      break;
                  case 'TIME_WARP':
                      set({ hasTimeWarp: true });
                      break;
                  case 'MULTIPLIER':
                      set({ hasMultiplier: true });
                      break;
                  case 'LASER':
                      set({ hasLaser: true });
                      break;
                  case 'HEART_POWER':
                      set({ heartPowerLevel: Math.min(get().heartPowerLevel + 1, 6) });
                      break;
              }
              // Sync purchase
              if (itemId || type) {
                  const { session } = get();
                  if (session?.user) {
                      supabase.from('inventory').insert({
                          user_id: session.user.id,
                          item_id: itemId || type,
                          item_type: 'UPGRADE'
                      }).then();
                  }
              }
          } else if (type === 'CHARACTER') {
              if (itemId && !unlockedCharacters.includes(itemId)) {
                  set({ unlockedCharacters: [...unlockedCharacters, itemId], selectedCharacter: itemId });
                  // Sync purchase
                  const { session } = get();
                  if (session?.user) {
                      supabase.from('inventory').insert({
                          user_id: session.user.id,
                          item_id: itemId,
                          item_type: 'CHARACTER'
                      }).then();
                  }
              }
          } else if (type === 'COLOR') {
              const { unlockedColors } = get();
              if (itemId && !unlockedColors.includes(itemId)) {
                  set({ unlockedColors: [...unlockedColors, itemId], selectedColor: itemId });
                  const { session } = get();
                  if (session?.user) {
                      supabase.from('inventory').insert({
                          user_id: session.user.id,
                          item_id: itemId,
                          item_type: 'COLOR'
                      }).then();
                  }
              }
          } else if (type === 'ACCESSORY') {
              const { unlockedAccessories } = get();
              if (itemId && !unlockedAccessories.includes(itemId)) {
                  set({ unlockedAccessories: [...unlockedAccessories, itemId], selectedAccessory: itemId });
                  const { session } = get();
                  if (session?.user) {
                      supabase.from('inventory').insert({
                          user_id: session.user.id,
                          item_id: itemId,
                          item_type: 'ACCESSORY'
                      }).then();
                  }
              }
          }
          
          // Sync points
          get().syncProfileToSupabase({ points: score - cost });
          
          return true;
      }
      return false;
  },

  selectCharacter: (id: string) => {
      if (get().unlockedCharacters.includes(id)) {
          set({ selectedCharacter: id });
      }
  },

  selectColor: (id: string) => {
      if (get().unlockedColors.includes(id)) {
          set({ selectedColor: id });
      }
  },

  selectAccessory: (id: string | null) => {
      if (id === null || get().unlockedAccessories.includes(id)) {
          set({ selectedAccessory: id });
      }
  },

  activateImmortality: () => {
      const { hasImmortality, isImmortalityActive } = get();
      if (hasImmortality && !isImmortalityActive) {
          set({ hasImmortality: false, isImmortalityActive: true });
          
          setTimeout(() => {
              set({ isImmortalityActive: false });
          }, 3000); 
      }
  },

  activateDash: () => {
      const { hasDash, isDashActive } = get();
      if (hasDash && !isDashActive) {
          set({ hasDash: false, isDashActive: true, speed: get().speed + 100 });
          
          setTimeout(() => {
              set({ isDashActive: false, speed: Math.max(0, get().speed - 100) });
          }, 1500); 
      }
  },

  toggleEffects: () => set((state) => ({ effectsEnabled: !state.effectsEnabled })),

  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  pauseGame: () => {
    if (get().status === GameStatus.PLAYING) {
      set({ preShopStatus: GameStatus.PLAYING, status: GameStatus.PAUSED });
    }
  },

  resumeGame: () => {
    if (get().status === GameStatus.PAUSED) {
      set({ status: GameStatus.PLAYING });
    }
  },

  setStatus: (status) => {
    const protectedStatuses = [
      GameStatus.SHOP, 
      GameStatus.LEVEL_SELECT, 
      GameStatus.LOBBY, 
      GameStatus.ONLINE, 
      GameStatus.PROFILE, 
      GameStatus.MENU
    ];
    if (protectedStatuses.includes(status) && !get().session) {
      set({ status: GameStatus.AUTH }); // Redirect to AUTH to encourage login
    } else {
      set({ status });
    }
  },

  // Multiplayer Implementation
  localUserId: null,
  roomId: null,
  roomCode: null,
  isHost: false,
  players: [],
  onlinePlayers: [],
  multiplayerMode: null,
  countdown: 0,

  setLocalUserId: (id) => set({ localUserId: id }),
  setRoomId: (id) => set({ roomId: id }),
  setRoomCode: (code) => set({ roomCode: code }),
  setIsHost: (isHost) => set({ isHost }),
  setPlayers: (players) => set({ players }),
  setOnlinePlayers: (players) => set({ onlinePlayers: players }),
  updateOnlinePlayer: (id, data) => set((state) => ({
    onlinePlayers: state.onlinePlayers.map(p => p.user_id === id ? { ...p, ...data } : p)
  })),
  setMultiplayerMode: (mode) => set({ multiplayerMode: mode }),
  
  startOnlineGame: () => {
    const { maxLives, selectedCharacter, players } = get();
    
    let speedMult = 1.0;
    if (selectedCharacter === 'char_neon') speedMult = 1.15;
    if (selectedCharacter === 'char_gold') speedMult = 0.9;
    if (selectedCharacter === 'char_void') speedMult = 1.05;

    // Initialize online players
    // Note: We don't need trackOffsets anymore as they don't show side-by-side
    const onlinePlayers: OnlinePlayer[] = players.map((p, i) => ({
      user_id: p.user_id,
      name: p.name,
      trackOffset: 0, // All on same track visually now (not rendered anyway)
      score: 0,
      distance: 0,
      lane: 0,
      y: 0,
      z: 0,
      is_dead: false,
      is_finished: false
    }));

    set({ 
      status: GameStatus.ONLINE, 
      score: 0,
      levelScore: 0,
      lives: maxLives, 
      maxLives: maxLives,
      speed: (RUN_SPEED_BASE + 8) * speedMult, // Start slightly slower for "easy" beginning
      collectedLetters: [],
      level: 1,
      laneCount: 3, 
      onlinePlayers,
      gemsCollected: 0,
      distance: 0,
      targetDistance: 999999, // Infinite-ish
      hasDoubleJump: get().hasDoubleJump,
      hasImmortality: get().hasImmortality,
      isImmortalityActive: false,
      countdown: 3
    });

    const timer = setInterval(() => {
      const { countdown } = get();
      if (countdown > 0) {
        set({ countdown: countdown - 1 });
      } else {
        clearInterval(timer);
      }
    }, 1000);
  },
  resetOnlineState: () => {
    set({
      roomId: null,
      roomCode: null,
      isHost: false,
      players: [],
      onlinePlayers: [],
      multiplayerMode: null,
      status: [GameStatus.ONLINE, GameStatus.GAME_OVER, GameStatus.VICTORY, GameStatus.LEVEL_COMPLETE].includes(get().status) 
        ? GameStatus.MENU 
        : get().status
    });
  },
    }),
    {
      name: 'hsg-run-storage',
      partialize: (state) => ({
        score: state.score,
        maxLives: state.maxLives,
        unlockedLevels: state.unlockedLevels,
        gemsCollected: state.gemsCollected,
        hasDoubleJump: state.hasDoubleJump,
        hasImmortality: state.hasImmortality,
        hasMagnet: state.hasMagnet,
        hasShield: state.hasShield,
        hasDash: state.hasDash,
        hasTimeWarp: state.hasTimeWarp,
        hasMultiplier: state.hasMultiplier,
        hasLaser: state.hasLaser,
        unlockedCharacters: state.unlockedCharacters,
        selectedCharacter: state.selectedCharacter,
        unlockedColors: state.unlockedColors,
        selectedColor: state.selectedColor,
        unlockedAccessories: state.unlockedAccessories,
        selectedAccessory: state.selectedAccessory,
        heartPowerLevel: state.heartPowerLevel,
        currentLifeHits: state.currentLifeHits,
        effectsEnabled: state.effectsEnabled,
        soundEnabled: state.soundEnabled,
      }),
    }
  )
);
