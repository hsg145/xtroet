/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text3D, Center, Float } from '@react-three/drei';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store';
import { GameObject, ObjectType, LANE_WIDTH, SPAWN_DISTANCE, REMOVE_DISTANCE, GameStatus, GEMINI_COLORS, RUN_SPEED_BASE } from '../../types';
import { audio } from '../System/Audio';

// Geometry Constants
const OBSTACLE_HEIGHT = 1.6;
const OBSTACLE_GEOMETRY = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_GLOW_GEO = new THREE.ConeGeometry(0.9, OBSTACLE_HEIGHT, 6);
const OBSTACLE_RING_GEO = new THREE.RingGeometry(0.6, 0.9, 6);

const GEM_GEOMETRY = new THREE.IcosahedronGeometry(0.3, 0);

// Alien Geometries
const ALIEN_BODY_GEO = new THREE.CylinderGeometry(0.6, 0.3, 0.3, 8);
const ALIEN_DOME_GEO = new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI/2);
const ALIEN_EYE_GEO = new THREE.SphereGeometry(0.1);

// Missile Geometries
const MISSILE_CORE_GEO = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const MISSILE_RING_GEO = new THREE.TorusGeometry(0.15, 0.02, 16, 32);

// Shadow Geometries
const SHADOW_LETTER_GEO = new THREE.PlaneGeometry(2, 0.6);
const SHADOW_GEM_GEO = new THREE.CircleGeometry(0.6, 32);
const SHADOW_ALIEN_GEO = new THREE.CircleGeometry(0.8, 32);
const SHADOW_MISSILE_GEO = new THREE.PlaneGeometry(0.15, 3);
const SHADOW_DEFAULT_GEO = new THREE.CircleGeometry(0.8, 6);

// Shop Geometries
const SHOP_FRAME_GEO = new THREE.BoxGeometry(1, 7, 1); // Will be scaled
const SHOP_BACK_GEO = new THREE.BoxGeometry(1, 5, 1.2); // Will be scaled
const SHOP_OUTLINE_GEO = new THREE.BoxGeometry(1, 7.2, 0.8); // Will be scaled
const SHOP_FLOOR_GEO = new THREE.PlaneGeometry(1, 4); // Will be scaled

const PORTAL_PILLAR_GEO = new THREE.BoxGeometry(2, 12, 2);
const PORTAL_GATE_GEO = new THREE.PlaneGeometry(1, 1);

const PARTICLE_COUNT = 600;
const BASE_LETTER_INTERVAL = 150; 

const MISSILE_SPEED = 30; // Extra speed added to world speed

// Font for 3D Text
const FONT_URL = "https://cdn.jsdelivr.net/npm/three/examples/fonts/helvetiker_bold.typeface.json";

// --- Particle System ---
const ParticleSystem: React.FC = () => {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    const particles = useMemo(() => new Array(PARTICLE_COUNT).fill(0).map(() => ({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        color: new THREE.Color()
    })), []);

    useEffect(() => {
        const handleExplosion = (e: CustomEvent) => {
            const { position, color } = e.detail;
            let spawned = 0;
            const burstAmount = 40; 

            for(let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particles[i];
                if (p.life <= 0) {
                    p.life = 1.0 + Math.random() * 0.5; 
                    p.pos.set(position[0], position[1], position[2]);
                    
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const speed = 2 + Math.random() * 10;
                    
                    p.vel.set(
                        Math.sin(phi) * Math.cos(theta),
                        Math.sin(phi) * Math.sin(theta),
                        Math.cos(phi)
                    ).multiplyScalar(speed);

                    p.rot.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                    p.rotVel.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(5);
                    
                    p.color.set(color);
                    
                    spawned++;
                    if (spawned >= burstAmount) break;
                }
            }
        };
        
        window.addEventListener('particle-burst', handleExplosion as any);
        return () => window.removeEventListener('particle-burst', handleExplosion as any);
    }, [particles]);

    useFrame((state, delta) => {
        if (!mesh.current) return;
        const safeDelta = Math.min(delta, 0.1);

        particles.forEach((p, i) => {
            if (p.life > 0) {
                p.life -= safeDelta * 1.5;
                p.pos.addScaledVector(p.vel, safeDelta);
                p.vel.y -= safeDelta * 5; 
                p.vel.multiplyScalar(0.98);

                p.rot.x += p.rotVel.x * safeDelta;
                p.rot.y += p.rotVel.y * safeDelta;
                
                dummy.position.copy(p.pos);
                const scale = Math.max(0, p.life * 0.25);
                dummy.scale.set(scale, scale, scale);
                
                dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
                dummy.updateMatrix();
                
                mesh.current!.setMatrixAt(i, dummy.matrix);
                mesh.current!.setColorAt(i, p.color);
            } else {
                dummy.scale.set(0,0,0);
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        
        mesh.current.instanceMatrix.needsUpdate = true;
        if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
        </instancedMesh>
    );
};


const getRandomLane = (laneCount: number) => {
    const max = Math.floor(laneCount / 2);
    return Math.floor(Math.random() * (max * 2 + 1)) - max;
};

export const LevelManager: React.FC<{ trackOffset?: number, playerId?: string }> = ({ trackOffset = 0, playerId }) => {
  const status = useStore(state => state.status);

  const collectGem = useStore(state => state.collectGem);
  const collectLetter = useStore(state => state.collectLetter);
  const collectedLetters = useStore(state => state.collectedLetters);
  const laneCount = useStore(state => state.laneCount);
  const setDistance = useStore(state => state.setDistance);
  const setTargetDistance = useStore(state => state.setTargetDistance);
  const openShop = useStore(state => state.openShop);
  const level = useStore(state => state.level);
  const targetDistance = useStore(state => state.targetDistance);
  const completeLevel = useStore(state => state.completeLevel);
  const updateOnlinePlayer = useStore(state => state.updateOnlinePlayer);
  const localUserId = useStore(state => state.localUserId);

  const multiplayerMode = useStore(state => state.multiplayerMode);
  const isLocal = !playerId || playerId === localUserId;
  

  
  const objectsRef = useRef<GameObject[]>([]);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const prevStatus = useRef(status);
  const prevLevel = useRef(level);

  const playerObjRef = useRef<THREE.Object3D | null>(null);
  const distanceTraveled = useRef(0);
  const lastReportedDistance = useRef(0);
  const nextLetterDistance = useRef(targetDistance / 8);
  const endPortalSpawned = useRef(false);

  // Handle resets and transitions
  useEffect(() => {
    const isRestarting = ((status === GameStatus.PLAYING || status === GameStatus.ONLINE) && (prevStatus.current === GameStatus.GAME_OVER || prevStatus.current === GameStatus.LEVEL_COMPLETE || prevStatus.current === GameStatus.VICTORY));
    const isInitialStart = (status === GameStatus.PLAYING || status === GameStatus.ONLINE) && (prevStatus.current === GameStatus.MENU || prevStatus.current === GameStatus.LEVEL_SELECT || prevStatus.current === GameStatus.LOBBY);
    const isMenuReset = status === GameStatus.MENU;

    if (isMenuReset || isRestarting || isInitialStart) {
        // Hard Reset of objects
        objectsRef.current = [];
        playerObjRef.current = null; // Force re-find player
        
        // Reset trackers
        distanceTraveled.current = 0;
        lastReportedDistance.current = 0;
        endPortalSpawned.current = false;
        nextLetterDistance.current = targetDistance / 8;
        
        setRenderTrigger(t => t + 1);
    } else if (status === GameStatus.GAME_OVER || status === GameStatus.VICTORY || status === GameStatus.LEVEL_COMPLETE) {
        setDistance(Math.floor(distanceTraveled.current));
    }
    
    prevStatus.current = status;
    prevLevel.current = level;
  }, [status, level, setDistance, targetDistance]);

  useFrame((state) => {
      if (!playerObjRef.current) {
          const groupName = isLocal ? 'PlayerGroup' : `PlayerGroup-${playerId}`;
          const group = state.scene.getObjectByName(groupName);
          if (group && group.children.length > 0) {
              playerObjRef.current = group.children[0];
          }
      }
  });

  useFrame((state, delta) => {
    if (status !== GameStatus.PLAYING && status !== GameStatus.ONLINE) return;
    
    const { speed, onlinePlayers, countdown, lives, hasTimeWarp, hasLaser, hasMagnet } = useStore.getState();

    // Check countdown for online
    if (status === GameStatus.ONLINE && countdown > 0) return;

    // If we are local player and we are dead, stop progressing our level
    if (isLocal && lives <= 0) return;

    const safeDelta = Math.min(delta, 0.05); 
    
    // DIFFICULTY SCALING (Incremental based on distance in ONLINE mode)
    if (status === GameStatus.ONLINE && isLocal) {
        const difficultyFactor = distanceTraveled.current / 1000;
        const baseTarget = RUN_SPEED_BASE + 10 + difficultyFactor * 8;
        const targetSpeed = Math.min(180, hasTimeWarp ? baseTarget * 0.8 : baseTarget);
        if (speed < targetSpeed) {
            useStore.setState({ speed: speed + safeDelta * 2 });
        }
    } else if (hasTimeWarp && isLocal) {
        // Apply Time Warp slow down to single player as well
        const currentSpeed = speed;
        // In store.ts the speed is set at startGame. We should reduce it here gradually or just reduce dist
    }

    let dist = speed * safeDelta;
    if (hasTimeWarp && isLocal && status !== GameStatus.ONLINE) {
        dist *= 0.8; // 20% slower perception of time
    }
    
    const alivePlayers = onlinePlayers.filter(p => !p.is_dead);
    const isOnePlayerLeft = status === GameStatus.ONLINE && alivePlayers.length === 1 && !onlinePlayers.find(p => p.user_id === localUserId)?.is_dead;

    if (isOnePlayerLeft && !endPortalSpawned.current && isLocal) {
        // If everyone else is dead, create a finish line shortly
        if (targetDistance > distanceTraveled.current + 300) {
            setTargetDistance(Math.floor(distanceTraveled.current + 250));
        }
    }

    distanceTraveled.current += dist;

    // Update store distance periodically for HUD progress bar
    if (isLocal && distanceTraveled.current - lastReportedDistance.current > 5) {
        setDistance(distanceTraveled.current);
        lastReportedDistance.current = distanceTraveled.current;

        // Dynamic Level Scaling for obstacles (not just speed)
        if (status === GameStatus.ONLINE) {
           const newLevel = Math.min(100, 1 + Math.floor(distanceTraveled.current / 800));
           if (newLevel > level) {
               useStore.setState({ level: newLevel, laneCount: Math.min(9, 3 + Math.floor(newLevel / 8)) });
           }
        }
    }

    let hasChanges = false;
    let playerPos = new THREE.Vector3(0, 0, 0);
    
    if (playerObjRef.current) {
        playerObjRef.current.getWorldPosition(playerPos);
    }

    // 1. Move & Update
    const currentObjects = objectsRef.current;
    const keptObjects: GameObject[] = [];
    const newSpawns: GameObject[] = [];

    for (const obj of currentObjects) {
        // Standard Movement
        let moveAmount = dist;
        
        // Missile Movement (Moves faster than world)
        if (obj.type === ObjectType.MISSILE) {
            moveAmount += MISSILE_SPEED * safeDelta;
        }

        // Store previous Z for swept collision check (prevents tunneling)
        const prevZ = obj.position[2];
        obj.position[2] += moveAmount;

        // Magnet Logic
        if (hasMagnet && isLocal && obj.active && (obj.type === ObjectType.GEM || obj.type === ObjectType.LETTER)) {
            const dz = playerPos.z - obj.position[2];
            const dx = playerPos.x - obj.position[0];
            const dy = playerPos.y - obj.position[1];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (distance < 15 && dz > -2) {
                // Move towards player
                const speedMagnet = 40 * safeDelta;
                obj.position[0] += (dx / distance) * speedMagnet;
                obj.position[1] += (dy / distance) * speedMagnet;
                obj.position[2] += (dz / distance) * speedMagnet;
            }
        }

        // Laser Logic
        if (hasLaser && isLocal && obj.active && (obj.type === ObjectType.OBSTACLE || obj.type === ObjectType.ALIEN || obj.type === ObjectType.MISSILE)) {
             const dz = playerPos.z - obj.position[2];
             const dx = Math.abs(obj.position[0] - playerPos.x);
             // Laser destroys anything in same lane up to 30 units ahead
             if (dx < 1.0 && dz > -30 && dz < 0) {
                 // But wait, it's a constant beam. Maybe fire every few seconds?
                 // For a permanent laser, let's say it destroys everything in front constantly.
                 obj.active = false;
                 hasChanges = true;
                 window.dispatchEvent(new CustomEvent('particle-burst', { 
                     detail: { position: obj.position, color: '#ff0000' } 
                 }));
             }
        }
        
        // Alien AI Logic
        if (obj.type === ObjectType.ALIEN && obj.active && !obj.hasFired) {
             // Fire when within range (e.g., -90 units away)
             if (obj.position[2] > -90) {
                 obj.hasFired = true;
                 
                 // Spawn Missile
                 newSpawns.push({
                     id: uuidv4(),
                     type: ObjectType.MISSILE,
                     position: [obj.position[0], 1.0, obj.position[2] + 2], // Spawn slightly in front
                     active: true,
                     color: '#ff0000'
                 });
                 hasChanges = true;
                 
                 // Visual flare event
                 if (isLocal) {
                    window.dispatchEvent(new CustomEvent('particle-burst', { 
                        detail: { position: obj.position, color: '#ff00ff' } 
                    }));
                 }
             }
        }

        let keep = true;
        if (obj.active) {
            // Swept Collision: Check if object's path [prevZ, currentZ] overlaps with player collision zone
            // INCREASED THRESHOLD from 1.0 to 2.0 to prevent missile tunneling at low FPS/High Speed
            const zThreshold = 2.0; 
            const inZZone = (prevZ < playerPos.z + zThreshold) && (obj.position[2] > playerPos.z - zThreshold);
            
            // END PORTAL COLLISION
            if (obj.type === ObjectType.END_PORTAL) {
                const dz = Math.abs(obj.position[2] - playerPos.z);
                if (dz < 2) { 
                    if (isLocal) {
                        if (status === GameStatus.ONLINE) {
                             useStore.getState().updateOnlinePlayer(playerId, { is_finished: true });
                             const state = useStore.getState();
                             const aliveOpponents = state.onlinePlayers.filter(p => !p.is_dead && p.user_id !== playerId);
                             const someoneFinished = aliveOpponents.some(p => p.is_finished);
                             if (!someoneFinished) {
                                 state.setStatus(GameStatus.VICTORY);
                             } else {
                                 state.setStatus(GameStatus.GAME_OVER);
                             }
                        } else {
                             completeLevel();
                        }
                    }
                    obj.active = false;
                    hasChanges = true;
                    keep = false; 
                }
            } else if (obj.type === ObjectType.SHOP_PORTAL) {
                // Strict proximity check for portal since it's large
                const dz = Math.abs(obj.position[2] - playerPos.z);
                if (dz < 2) { 
                     if (isLocal) openShop();
                     obj.active = false;
                     hasChanges = true;
                     keep = false; 
                }
            } else if (inZZone) {
                // STANDARD COLLISION
                const dx = Math.abs(obj.position[0] - playerPos.x);
                if (dx < 0.9) { // Slightly increased horizontal forgiveness
                     
                     // Obstacles, Aliens, and Missiles damage player
                     const isDamageSource = obj.type === ObjectType.OBSTACLE || obj.type === ObjectType.ALIEN || obj.type === ObjectType.MISSILE;
                     
                     if (isDamageSource) {
                         // VERTICAL COLLISION WITH BOUNDS CHECK
                         // More robust than simple distance check for jumping/running
                         const playerBottom = playerPos.y;
                         const playerTop = playerPos.y + 1.8; // Approx height of player

                         let objBottom = obj.position[1] - 0.5;
                         let objTop = obj.position[1] + 0.5;

                         if (obj.type === ObjectType.OBSTACLE) {
                             objBottom = 0;
                             objTop = OBSTACLE_HEIGHT;
                         } else if (obj.type === ObjectType.MISSILE) {
                             // Missile at Y=1.0
                             objBottom = 0.5;
                             objTop = 1.5;
                         }

                         const isHit = (playerBottom < objTop) && (playerTop > objBottom);

                         if (isHit) { 
                             if (isLocal) window.dispatchEvent(new Event('player-hit'));
                             obj.active = false; 
                             hasChanges = true;
                             
                             // Visual burst for missile impact
                             if (obj.type === ObjectType.MISSILE && isLocal) {
                                window.dispatchEvent(new CustomEvent('particle-burst', { 
                                    detail: { position: obj.position, color: '#ff4400' } 
                                }));
                             }
                         }
                     } else {
                         // Item Collection
                         const dy = Math.abs(obj.position[1] - playerPos.y);
                         if (dy < 2.5) { // Generous vertical pickup range
                            if (obj.type === ObjectType.GEM) {
                                if (isLocal) {
                                    collectGem(obj.points || 50);
                                    audio.playGemCollect();
                                }
                            }
                            if (obj.type === ObjectType.LETTER && obj.targetIndex !== undefined) {
                                if (isLocal) {
                                    collectLetter(obj.targetIndex);
                                    audio.playLetterCollect();
                                }
                            }
                            
                            if (isLocal) {
                                window.dispatchEvent(new CustomEvent('particle-burst', { 
                                    detail: { 
                                        position: obj.position, 
                                        color: obj.color || '#ffffff' 
                                    } 
                                }));
                            }

                            obj.active = false;
                            hasChanges = true;
                         }
                     }
                }
            }
        }

        if (obj.position[2] > REMOVE_DISTANCE) {
            keep = false;
            hasChanges = true;
        }

        if (keep) {
            keptObjects.push(obj);
        }
    }

    // Add any newly spawned entities (Missiles)
    if (newSpawns.length > 0) {
        keptObjects.push(...newSpawns);
    }

    // 2. Spawning Logic
    let furthestZ = 0;
    // Only consider static obstacles/gems for gap calculation, not missiles or moving aliens
    const staticObjects = keptObjects.filter(o => o.type !== ObjectType.MISSILE);
    
    if (staticObjects.length > 0) {
        furthestZ = Math.min(...staticObjects.map(o => o.position[2]));
    } else {
        furthestZ = -20;
    }

    if (furthestZ > -SPAWN_DISTANCE) {
         // Cap speed effect on gap so it doesn't get too sparse, but reduce gap based on level
         const minGap = Math.max(6, 10 + (speed * 0.2) - (level * 0.2)); // Tighter gaps for medium start
         const spawnZ = Math.min(furthestZ - minGap, -SPAWN_DISTANCE);
         
         if (distanceTraveled.current >= targetDistance && !endPortalSpawned.current) {
             keptObjects.push({
                 id: uuidv4(),
                 type: ObjectType.END_PORTAL,
                 position: [0, 0, spawnZ - 20], 
                 active: true,
             });
             endPortalSpawned.current = true;
             hasChanges = true;
         } else if (distanceTraveled.current < targetDistance) {
             const isLetterDue = status !== GameStatus.ONLINE && distanceTraveled.current >= nextLetterDistance.current;

             if (isLetterDue) {
                 const lane = getRandomLane(laneCount);
                 const target = ['H','S','G','R','U','N'];
                 
                 const availableIndices = target.map((_, i) => i).filter(i => !collectedLetters.includes(i));

                 if (availableIndices.length > 0) {
                     const chosenIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
                     const val = target[chosenIndex];
                     const color = GEMINI_COLORS[chosenIndex];

                     keptObjects.push({
                        id: uuidv4(),
                        type: ObjectType.LETTER,
                        position: [lane * LANE_WIDTH, 1.0, spawnZ], 
                        active: true,
                        color: color,
                        value: val,
                        targetIndex: chosenIndex
                     });
                     
                     nextLetterDistance.current += (targetDistance / 8);
                     hasChanges = true;
                 } else {
                    // Fallback to gem if all letters collected for this level
                    keptObjects.push({
                        id: uuidv4(),
                        type: ObjectType.GEM,
                        position: [trackOffset + lane * LANE_WIDTH, 1.2, spawnZ],
                        active: true,
                        color: '#00ffff',
                        points: 50
                    });
                    hasChanges = true;
                 }

             } else if (Math.random() > 0.1) { // 90% chance to attempt spawn if gap exists
            
            // Increased obstacle probability from 0.35 up to a max of 0.85
            const obstacleProb = Math.min(0.85, 0.35 + (level * 0.02));
            const isObstacle = Math.random() < obstacleProb;

            if (isObstacle) {
                // Decide between Alien (Level 1+) or Spikes
                const alienProb = Math.min(0.50, 0.15 + (level * 0.02));
                const spawnAlien = level >= 1 && Math.random() < alienProb;

                if (spawnAlien) {
                    // Multi-Lane Alien Logic
                    const availableLanes = [];
                    const maxLane = Math.floor(laneCount / 2);
                    for (let i = -maxLane; i <= maxLane; i++) availableLanes.push(i);
                    availableLanes.sort(() => Math.random() - 0.5);

                    // Determine how many aliens to spawn (1 to 3, based on probability)
                    let alienCount = 1;
                    const pAlien = Math.random();
                    
                    if (pAlien > 0.7) {
                        // 30% chance for 2 aliens
                        alienCount = Math.min(2, availableLanes.length);
                    }
                    // 10% chance for 3 aliens if there's enough space (and random allows)
                    if (pAlien > 0.9 && availableLanes.length >= 3) {
                        alienCount = 3;
                    }

                    for (let k = 0; k < alienCount; k++) {
                        const lane = availableLanes[k];
                        keptObjects.push({
                            id: uuidv4(),
                            type: ObjectType.ALIEN,
                            position: [trackOffset + lane * LANE_WIDTH, 1.5, spawnZ],
                            active: true,
                            color: '#00ff00',
                            hasFired: false
                        });
                    }
                } else {
                    // Standard Obstacle Spawning
                    const availableLanes = [];
                    const maxLane = Math.floor(laneCount / 2);
                    for (let i = -maxLane; i <= maxLane; i++) availableLanes.push(i);
                    availableLanes.sort(() => Math.random() - 0.5);
                    
                    let countToSpawn = 1;
                    const p = Math.random();

                    // Increased difficulty probabilities
                    const tripleProb = Math.min(0.50, 0.10 + (level * 0.02));
                    const doubleProb = Math.min(0.80, 0.30 + (level * 0.03));

                    if (p < tripleProb) {
                        // Triple Spike
                        countToSpawn = Math.min(3, availableLanes.length);
                    } else if (p < doubleProb) {
                        // Double Spike
                        countToSpawn = Math.min(2, availableLanes.length);
                    } else {
                        // Single Spike
                        countToSpawn = 1;
                    }

                    for (let i = 0; i < countToSpawn; i++) {
                        const lane = availableLanes[i];
                        const laneX = lane * LANE_WIDTH;
                        
                        keptObjects.push({
                            id: uuidv4(),
                            type: ObjectType.OBSTACLE,
                            position: [trackOffset + laneX, OBSTACLE_HEIGHT / 2, spawnZ],
                            active: true,
                            color: '#ff0054'
                        });

                        // Chance for gem on top of obstacle
                        if (Math.random() < 0.3) {
                             keptObjects.push({
                                id: uuidv4(),
                                type: ObjectType.GEM,
                                position: [trackOffset + laneX, OBSTACLE_HEIGHT + 1.0, spawnZ],
                                active: true,
                                color: '#ffd700',
                                points: 100
                            });
                        }
                    }
                }

            } else {
                // GROUND GEM SPAWNING
                const lane = getRandomLane(laneCount);
                keptObjects.push({
                    id: uuidv4(),
                    type: ObjectType.GEM,
                    position: [trackOffset + lane * LANE_WIDTH, 1.2, spawnZ],
                    active: true,
                    color: '#00ffff',
                    points: 50
                });
            }
            hasChanges = true;
         }
       }
    }

    if (hasChanges) {
        objectsRef.current = keptObjects;
        setRenderTrigger(t => t + 1);
    }
  });

  return (
    <group>
      <ParticleSystem />
      {objectsRef.current.map(obj => {
        if (!obj.active) return null;
        return <GameEntity key={obj.id} data={obj} />;
      })}
    </group>
  );
};

const GameEntity: React.FC<{ data: GameObject }> = React.memo(({ data }) => {
    const groupRef = useRef<THREE.Group>(null);
    const visualRef = useRef<THREE.Group>(null);
    const shadowRef = useRef<THREE.Mesh>(null);
    const { laneCount } = useStore();
    
    useFrame((state, delta) => {
        // 1. Move Main Container
        if (groupRef.current) {
            groupRef.current.position.set(data.position[0], 0, data.position[2]);
        }

        // 2. Animate Visuals
        if (visualRef.current) {
            const baseHeight = data.position[1];
            
            if (data.type === ObjectType.SHOP_PORTAL) {
                 visualRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.02);
            } else if (data.type === ObjectType.MISSILE) {
                 // Missile rotation
                 visualRef.current.rotation.z += delta * 20; // Fast spin
                 visualRef.current.position.y = baseHeight;
            } else if (data.type === ObjectType.ALIEN) {
                 // Alien Hover
                 visualRef.current.position.y = baseHeight + Math.sin(state.clock.elapsedTime * 3) * 0.2;
                 visualRef.current.rotation.y += delta;
            } else if (data.type !== ObjectType.OBSTACLE) {
                // Gem/Letter Bobbing
                visualRef.current.rotation.y += delta * 3;
                const bobOffset = Math.sin(state.clock.elapsedTime * 4 + data.position[0]) * 0.1;
                visualRef.current.position.y = baseHeight + bobOffset;
                
                if (shadowRef.current) {
                    const shadowScale = 1 - bobOffset; 
                    shadowRef.current.scale.setScalar(shadowScale);
                }
            } else {
                visualRef.current.position.y = baseHeight;
            }
        }
    });

    // Select Shadow Geometry based on type (using shared geometries)
    const shadowGeo = useMemo(() => {
        if (data.type === ObjectType.LETTER) return SHADOW_LETTER_GEO;
        if (data.type === ObjectType.GEM) return SHADOW_GEM_GEO;
        if (data.type === ObjectType.SHOP_PORTAL) return null; // No shadow needed or custom handled
        if (data.type === ObjectType.ALIEN) return SHADOW_ALIEN_GEO;
        if (data.type === ObjectType.MISSILE) return SHADOW_MISSILE_GEO;
        return SHADOW_DEFAULT_GEO; 
    }, [data.type]);

    return (
        <group ref={groupRef} position={[data.position[0], 0, data.position[2]]}>
            {data.type !== ObjectType.SHOP_PORTAL && shadowGeo && (
                <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} geometry={shadowGeo}>
                    <meshBasicMaterial color="#000000" opacity={0.3} transparent />
                </mesh>
            )}

            <group ref={visualRef} position={[0, data.position[1], 0]}>
                {/* --- SHOP PORTAL --- */}
                {data.type === ObjectType.SHOP_PORTAL && (
                    <group>
                         <mesh position={[0, 3, 0]} geometry={SHOP_FRAME_GEO} scale={[laneCount * LANE_WIDTH + 2, 1, 1]}>
                             <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.2} />
                         </mesh>
                         <mesh position={[0, 2, 0]} geometry={SHOP_BACK_GEO} scale={[laneCount * LANE_WIDTH, 1, 1]}>
                              <meshBasicMaterial color="#000000" />
                         </mesh>
                         <mesh position={[0, 3, 0]} geometry={SHOP_OUTLINE_GEO} scale={[laneCount * LANE_WIDTH + 2.2, 1, 1]}>
                             <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.3} />
                         </mesh>
                         <Center position={[0, 5, 0.6]}>
                             <Text3D font={FONT_URL} size={1.2} height={0.2}>
                                 CYBER SHOP
                                 <meshBasicMaterial color="#ffff00" />
                             </Text3D>
                         </Center>
                         <mesh position={[0, 0.1, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={SHOP_FLOOR_GEO} scale={[laneCount * LANE_WIDTH, 1, 1]}>
                             <meshBasicMaterial color="#00ffff" transparent opacity={0.3} />
                         </mesh>
                    </group>
                )}

                {/* --- END PORTAL --- */}
                {data.type === ObjectType.END_PORTAL && (
                    <group>
                        <mesh position={[-(laneCount * LANE_WIDTH) / 2 - 1, 6, 0]} geometry={PORTAL_PILLAR_GEO}>
                            <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
                        </mesh>
                        <mesh position={[(laneCount * LANE_WIDTH) / 2 + 1, 6, 0]} geometry={PORTAL_PILLAR_GEO}>
                            <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
                        </mesh>
                        <mesh position={[0, 6, 0]} scale={[laneCount * LANE_WIDTH + 2, 12, 1]} geometry={PORTAL_GATE_GEO}>
                            <meshBasicMaterial color="#00ffff" transparent opacity={0.5} side={THREE.DoubleSide} />
                        </mesh>
                        <Center position={[0, 10, 1]}>
                            <Text3D font={FONT_URL} size={1.5} height={0.2}>
                                SECTOR CLEAR
                                <meshStandardMaterial color="#ffffff" emissive="#00ffff" emissiveIntensity={2} />
                            </Text3D>
                        </Center>
                    </group>
                )}

                {/* --- OBSTACLE --- */}
                {data.type === ObjectType.OBSTACLE && (
                    <group>
                        <mesh geometry={OBSTACLE_GEOMETRY} castShadow receiveShadow>
                             <meshStandardMaterial 
                                 color="#330011"
                                 roughness={0.3} 
                                 metalness={0.8} 
                                 flatShading={true}
                             />
                        </mesh>
                        <mesh scale={[1.02, 1.02, 1.02]} geometry={OBSTACLE_GLOW_GEO}>
                             <meshBasicMaterial 
                                 color={data.color} 
                                 wireframe 
                                 transparent 
                                 opacity={0.3} 
                             />
                        </mesh>
                         <mesh position={[0, -OBSTACLE_HEIGHT/2 + 0.05, 0]} rotation={[-Math.PI/2,0,0]} geometry={OBSTACLE_RING_GEO}>
                             <meshBasicMaterial color={data.color} transparent opacity={0.4} side={THREE.DoubleSide} />
                         </mesh>
                    </group>
                )}

                {/* --- ALIEN (LEVEL 2+) --- */}
                {data.type === ObjectType.ALIEN && (
                    <group>
                        {/* Saucer Body */}
                        <mesh castShadow geometry={ALIEN_BODY_GEO}>
                            <meshStandardMaterial color="#4400cc" metalness={0.8} roughness={0.2} />
                        </mesh>
                        {/* Dome */}
                        <mesh position={[0, 0.2, 0]} geometry={ALIEN_DOME_GEO}>
                            <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} transparent opacity={0.8} />
                        </mesh>
                        {/* Glowing Eyes/Lights */}
                        <mesh position={[0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO}>
                             <meshBasicMaterial color="#ff00ff" />
                        </mesh>
                        <mesh position={[-0.3, 0, 0.3]} geometry={ALIEN_EYE_GEO}>
                             <meshBasicMaterial color="#ff00ff" />
                        </mesh>
                    </group>
                )}

                {/* --- MISSILE (Long Laser) --- */}
                {data.type === ObjectType.MISSILE && (
                    <group rotation={[Math.PI / 2, 0, 0]}>
                        {/* Long glowing core: Oriented along Y (which is Z after rotation) */}
                        <mesh geometry={MISSILE_CORE_GEO}>
                            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={4} />
                        </mesh>
                        {/* Energy Rings */}
                        <mesh position={[0, 1.0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                        <mesh position={[0, 0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                        <mesh position={[0, -1.0, 0]} geometry={MISSILE_RING_GEO}>
                            <meshBasicMaterial color="#ffff00" />
                        </mesh>
                    </group>
                )}

                {/* --- GEM --- */}
                {data.type === ObjectType.GEM && (
                    <mesh castShadow geometry={GEM_GEOMETRY}>
                        <meshStandardMaterial 
                            color={data.color} 
                            roughness={0} 
                            metalness={1} 
                            emissive={data.color} 
                            emissiveIntensity={2} 
                        />
                    </mesh>
                )}

                {/* --- LETTER --- */}
                {data.type === ObjectType.LETTER && (
                    <group scale={[1.5, 1.5, 1.5]}>
                         <Center>
                             <Text3D 
                                font={FONT_URL} 
                                size={0.8} 
                                height={0.5} 
                                bevelEnabled
                                bevelThickness={0.02}
                                bevelSize={0.02}
                                bevelSegments={5}
                             >
                                {data.value}
                                <meshStandardMaterial color={data.color} emissive={data.color} emissiveIntensity={1.5} />
                             </Text3D>
                         </Center>
                    </group>
                )}
            </group>
        </group>
    );
});
