/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH, GameStatus } from '../../types';
import { audio } from '../System/Audio';

// Physics Constants
const GRAVITY = 50;
const JUMP_FORCE = 16; // Results in ~2.56 height (v^2 / 2g)

// Static Geometries
const TORSO_GEO = new THREE.CylinderGeometry(0.25, 0.15, 0.6, 4);
const JETPACK_GEO = new THREE.BoxGeometry(0.3, 0.4, 0.15);
const GLOW_STRIP_GEO = new THREE.PlaneGeometry(0.05, 0.2);
const HEAD_GEO = new THREE.BoxGeometry(0.25, 0.3, 0.3);
const ARM_GEO = new THREE.BoxGeometry(0.12, 0.6, 0.12);
const JOINT_SPHERE_GEO = new THREE.SphereGeometry(0.07);
const HIPS_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.2);
const LEG_GEO = new THREE.BoxGeometry(0.15, 0.7, 0.15);
const SHADOW_GEO = new THREE.CircleGeometry(0.5, 32);

export const Player: React.FC<{ trackOffset?: number, playerId?: string }> = ({ trackOffset = 0, playerId }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  
  // Limb Refs for Animation
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const status = useStore(state => state.status);
  const laneCount = useStore(state => state.laneCount);
  const takeDamage = useStore(state => state.takeDamage);
  const hasDoubleJump = useStore(state => state.hasDoubleJump);
  const activateImmortality = useStore(state => state.activateImmortality);
  const isImmortalityActive = useStore(state => state.isImmortalityActive);
  const selectedCharacter = useStore(state => state.selectedCharacter);
  const selectedColor = useStore(state => state.selectedColor);
  const selectedAccessory = useStore(state => state.selectedAccessory);
  const localUserId = useStore(state => state.localUserId);
  const updateOnlinePlayer = useStore(state => state.updateOnlinePlayer);

  
  const isLocal = !playerId || playerId === localUserId;

  
  const [lane, setLane] = React.useState(0);
  const targetX = useRef(0);
  
  // Physics State (using Refs for immediate logic updates)
  const isJumping = useRef(false);
  const velocityY = useRef(0);
  const jumpsPerformed = useRef(0); 
  const spinRotation = useRef(0); // For double jump flip

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const isInvincible = useRef(false);
  const lastDamageTime = useRef(0);

  // Memoized Materials
  const { armorMaterial, jointMaterial, glowMaterial, shadowMaterial } = useMemo(() => {
      let armorColor = '#00aaff';
      let glowColor = '#00ffff';

      if (selectedColor === 'char_neon') {
          armorColor = '#00f2ff';
          glowColor = '#ff00ff';
      } else if (selectedColor === 'char_gold') {
          armorColor = '#ffd700';
          glowColor = '#ffffff';
      } else if (selectedColor === 'char_void') {
          armorColor = '#4b0082';
          glowColor = '#ff0000';
      }

      if (isImmortalityActive) {
          armorColor = '#ffffff';
          glowColor = '#ffffff';
      }
      
      return {
          armorMaterial: new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.3, metalness: 0.8 }),
          jointMaterial: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.7, metalness: 0.5 }),
          glowMaterial: new THREE.MeshBasicMaterial({ color: glowColor }),
          shadowMaterial: new THREE.MeshBasicMaterial({ color: '#000000', opacity: 0.3, transparent: true })
      };
  }, [isImmortalityActive, selectedColor]); // Only recreate if immortality state or color changes

  // --- Reset State on Game Start ---
  useEffect(() => {
      if (status === GameStatus.PLAYING || status === GameStatus.ONLINE) {
          isJumping.current = false;
          jumpsPerformed.current = 0;
          velocityY.current = 0;
          spinRotation.current = 0;
          if (groupRef.current) groupRef.current.position.y = 0;
          if (bodyRef.current) bodyRef.current.rotation.x = 0;
      }
  }, [status]);
  
  // Safety: Clamp lane if laneCount changes (e.g. restart)
  useEffect(() => {
      const maxLane = Math.floor(laneCount / 2);
      if (Math.abs(lane) > maxLane) {
          setLane(l => Math.max(Math.min(l, maxLane), -maxLane));
      }
  }, [laneCount, lane]);

  // --- Controls (Keyboard & Touch) ---
  const triggerJump = () => {
    const maxJumps = hasDoubleJump ? 2 : 1;

    if (!isJumping.current) {
        // First Jump
        audio.playJump(false);
        isJumping.current = true;
        jumpsPerformed.current = 1;
        velocityY.current = JUMP_FORCE;
    } else if (jumpsPerformed.current < maxJumps) {
        // Double Jump (Mid-air)
        audio.playJump(true);
        jumpsPerformed.current += 1;
        velocityY.current = JUMP_FORCE; // Reset velocity upwards
        spinRotation.current = 0; // Start flip
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { lives, countdown } = useStore.getState();
      if (status !== GameStatus.PLAYING && status !== GameStatus.ONLINE) return;
      if (status === GameStatus.ONLINE && countdown > 0) return;
      if (lives <= 0) return;
      
      const maxLane = Math.floor(laneCount / 2);

      if (e.key === 'ArrowLeft') setLane(l => Math.max(l - 1, -maxLane));
      else if (e.key === 'ArrowRight') setLane(l => Math.min(l + 1, maxLane));
      else if (e.key === 'ArrowUp' || e.key === 'w') triggerJump();
      else if (e.key === ' ' || e.key === 'Enter') {
          activateImmortality();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
        const { lives, countdown } = useStore.getState();
        if (status !== GameStatus.PLAYING && status !== GameStatus.ONLINE) return;
        if (status === GameStatus.ONLINE && countdown > 0) return;
        if (lives <= 0) return;
        
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        const maxLane = Math.floor(laneCount / 2);

        // Swipe Detection
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
             if (deltaX > 0) setLane(l => Math.min(l + 1, maxLane));
             else setLane(l => Math.max(l - 1, -maxLane));
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -30) {
            triggerJump();
        } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            activateImmortality();
        }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (status !== GameStatus.PLAYING && status !== GameStatus.SHOP && status !== GameStatus.ONLINE) return;

    if (isLocal) {
        const { lives, countdown } = useStore.getState();
        if (lives <= 0) {
            groupRef.current.visible = false;
            return;
        }

        // Block movement during online countdown
        if (status === GameStatus.ONLINE && countdown > 0) return;

        // 1. Horizontal Position
        targetX.current = lane * LANE_WIDTH;
        groupRef.current.position.x = THREE.MathUtils.lerp(
            groupRef.current.position.x, 
            targetX.current, 
            delta * 15 
        );

        // 2. Physics (Jump)
        if (isJumping.current) {
            // Apply Velocity
            groupRef.current.position.y += velocityY.current * delta;
            // Apply Gravity
            velocityY.current -= GRAVITY * delta;

            // Floor Collision
            if (groupRef.current.position.y <= 0) {
                groupRef.current.position.y = 0;
                isJumping.current = false;
                jumpsPerformed.current = 0;
                velocityY.current = 0;
                // Reset flip
                if (bodyRef.current) bodyRef.current.rotation.x = 0;
            }

            // Double Jump Flip
            if (jumpsPerformed.current === 2 && bodyRef.current) {
                // Rotate 360 degrees quickly
                spinRotation.current -= delta * 15;
                if (spinRotation.current < -Math.PI * 2) spinRotation.current = -Math.PI * 2;
                bodyRef.current.rotation.x = spinRotation.current;
            }
        }

        // Sync to store for multiplayer
        if (status === GameStatus.ONLINE && localUserId) {
            updateOnlinePlayer(localUserId, {
                lane: lane,
                y: groupRef.current.position.y,
                z: groupRef.current.position.z
            });
        }
    } else {
        const currentOnlinePlayers = useStore.getState().onlinePlayers;
        const remoteData = currentOnlinePlayers.find(p => p.user_id === playerId);
        
        if (remoteData) {
            // Sync remote player position
            const remoteTargetX = trackOffset + remoteData.lane * LANE_WIDTH;
            groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, remoteTargetX, delta * 30);
            groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, remoteData.y, delta * 30);
            
            // Visualize jumping for remote players
            const isRemoteJumping = remoteData.y > 0.1;
            
            if (!isRemoteJumping) {
                // Simple running animation for remote players
                const runTime = state.clock.elapsedTime * 25;
                if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(runTime) * 0.7;
                if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(runTime + Math.PI) * 0.7;
                if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(runTime + Math.PI) * 1.0;
                if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(runTime) * 1.0;
                if (bodyRef.current) bodyRef.current.position.y = 1.1 + Math.abs(Math.sin(runTime)) * 0.1;
            } else {
                // Jumping Pose for remote players
                const jumpPoseSpeed = delta * 10;
                if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -2.5, jumpPoseSpeed);
                if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -2.5, jumpPoseSpeed);
                if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0.5, jumpPoseSpeed);
                if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.5, jumpPoseSpeed);
                if (bodyRef.current) bodyRef.current.position.y = 1.1;
            }
            
            // Hide if dead
            groupRef.current.visible = !remoteData.is_dead;
            return; // Skip local animation logic
        }
    }

    // Banking Rotation
    const xDiff = targetX.current - groupRef.current.position.x;
    groupRef.current.rotation.z = -xDiff * 0.2; 
    groupRef.current.rotation.x = isJumping.current ? 0.1 : 0.05; 

    // 3. Skeletal Animation
    const time = state.clock.elapsedTime * 25; 
    
    if (!isJumping.current) {
        // Running Cycle
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(time) * 0.7;
        if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(time + Math.PI) * 0.7;
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(time + Math.PI) * 1.0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(time) * 1.0;
        
        if (bodyRef.current) bodyRef.current.position.y = 1.1 + Math.abs(Math.sin(time)) * 0.1;
    } else {
        // Jumping Pose
        const jumpPoseSpeed = delta * 10;
        if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -2.5, jumpPoseSpeed);
        if (rightArmRef.current) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, -2.5, jumpPoseSpeed);
        if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0.5, jumpPoseSpeed);
        if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.5, jumpPoseSpeed);
        
        // Only reset Y if not flipping (handled by flip logic mostly, but safe here)
        if (bodyRef.current && jumpsPerformed.current !== 2) bodyRef.current.position.y = 1.1; 
    }

    // 4. Dynamic Shadow
    if (shadowRef.current) {
        const height = groupRef.current.position.y;
        const scale = Math.max(0.2, 1 - (height / 2.5) * 0.5); // 2.5 is max jump height approx
        const runStretch = isJumping.current ? 1 : 1 + Math.abs(Math.sin(time)) * 0.3;

        shadowRef.current.scale.set(scale, scale, scale * runStretch);
        const material = shadowRef.current.material as THREE.MeshBasicMaterial;
        if (material && !Array.isArray(material)) {
            material.opacity = Math.max(0.1, 0.3 - (height / 2.5) * 0.2);
        }
    }

    // Invincibility / Immortality Effect
    const showFlicker = isInvincible.current || isImmortalityActive;
    if (showFlicker) {
        if (isInvincible.current) {
             if (Date.now() - lastDamageTime.current > 1500) {
                isInvincible.current = false;
                groupRef.current.visible = true;
             } else {
                groupRef.current.visible = Math.floor(Date.now() / 50) % 2 === 0;
             }
        } 
        if (isImmortalityActive) {
            groupRef.current.visible = true; 
        }
    } else {
        groupRef.current.visible = true;
    }
  });

  // Damage Handler
  useEffect(() => {
     const checkHit = (e: any) => {
        if (isInvincible.current || isImmortalityActive) return;
        audio.playDamage(); // Play damage sound
        takeDamage();
        isInvincible.current = true;
        lastDamageTime.current = Date.now();
     };
     window.addEventListener('player-hit', checkHit);
     return () => window.removeEventListener('player-hit', checkHit);
  }, [takeDamage, isImmortalityActive]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={bodyRef} position={[0, 1.1, 0]}> 
        
        {/* Torso */}
        <mesh castShadow position={[0, 0.2, 0]} geometry={TORSO_GEO} material={armorMaterial} />
        {selectedAccessory === 'char_cyborg' && (
            <mesh castShadow position={[0, 0.2, 0.05]}>
                <boxGeometry args={[0.35, 0.5, 0.35]} />
                <primitive object={armorMaterial} />
            </mesh>
        )}
        {selectedAccessory === 'char_assassin' && (
            <mesh castShadow position={[0, 0.2, -0.1]}>
                <cylinderGeometry args={[0.26, 0.3, 0.65, 8]} />
                <meshStandardMaterial color="#222222" />
            </mesh>
        )}

        {/* Jetpack */}
        <mesh position={[0, 0.2, -0.2]} geometry={JETPACK_GEO} material={jointMaterial} />
        <mesh position={[-0.08, 0.1, -0.28]} geometry={GLOW_STRIP_GEO} material={glowMaterial} />
        <mesh position={[0.08, 0.1, -0.28]} geometry={GLOW_STRIP_GEO} material={glowMaterial} />

        {/* Head */}
        <group ref={headRef} position={[0, 0.6, 0]}>
            <mesh castShadow geometry={HEAD_GEO} material={armorMaterial} />
            {/* Accessories */}
            {selectedAccessory === 'char_samurai' && (
                <mesh position={[0, 0.2, 0]} castShadow>
                    <coneGeometry args={[0.3, 0.15, 16]} />
                    <primitive object={armorMaterial} />
                </mesh>
            )}
            {selectedAccessory === 'char_king' && (
                <mesh position={[0, 0.2, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.15, 0.05, 8, 16]} />
                    <meshStandardMaterial color="#FFD700" metalness={1} roughness={0.1} />
                </mesh>
            )}
            {selectedAccessory === 'char_hacker' && (
                <mesh position={[0, 0.05, 0.05]} castShadow>
                    <boxGeometry args={[0.27, 0.35, 0.32]} />
                    <meshStandardMaterial color="#111111" />
                </mesh>
            )}
        </group>

        {/* Arms */}
        <group position={[0.32, 0.4, 0]}>
            <group ref={rightArmRef}>
                <mesh position={[0, -0.25, 0]} castShadow geometry={ARM_GEO} material={armorMaterial} />
                <mesh position={[0, -0.55, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>
        <group position={[-0.32, 0.4, 0]}>
            <group ref={leftArmRef}>
                 <mesh position={[0, -0.25, 0]} castShadow geometry={ARM_GEO} material={armorMaterial} />
                 <mesh position={[0, -0.55, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>

        {/* Hips */}
        <mesh position={[0, -0.15, 0]} geometry={HIPS_GEO} material={jointMaterial} />

        {/* Legs */}
        <group position={[0.12, -0.25, 0]}>
            <group ref={rightLegRef}>
                 <mesh position={[0, -0.35, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
            </group>
        </group>
        <group position={[-0.12, -0.25, 0]}>
            <group ref={leftLegRef}>
                 <mesh position={[0, -0.35, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
            </group>
        </group>
      </group>
      
      <mesh ref={shadowRef} position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={SHADOW_GEO} material={shadowMaterial} />
    </group>
  );
};