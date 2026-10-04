/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Environment } from './components/World/Environment';
import { Player } from './components/World/Player';
import { LevelManager } from './components/World/LevelManager';
import { Effects } from './components/World/Effects';
import { HUD } from './components/UI/HUD';
import { useStore } from './store';
import { MultiplayerSync } from './components/System/MultiplayerSync';
import { GameStatus } from './types';

import { AuthSync } from './components/System/AuthSync';
import { RouterSync } from './components/System/RouterSync';

// Dynamic Camera Controller
const CameraController = () => {
  const { camera, size } = useThree();
  const { laneCount } = useStore();
  
  useFrame((state, delta) => {
    const aspect = size.width / size.height;
    const isMobile = aspect < 1.2;

    const heightFactor = isMobile ? 2.0 : 0.5;
    const distFactor = isMobile ? 4.5 : 1.0;

    let extraLanes = Math.max(0, laneCount - 3);
    let targetX = 0;

    const targetY = 5.5 + (extraLanes * heightFactor);
    const targetZ = 8.0 + (extraLanes * distFactor);

    const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
    camera.position.lerp(targetPos, delta * 4.0); 
    camera.lookAt(targetX, 0, -30); 
  });
  
  return null;
};

function Scene() {
  const { effectsEnabled } = useStore();
  return (
    <>
        <Environment />
        <group>
            {/* Local Player ONLY */}
            <group userData={{ isPlayer: true }} name="PlayerGroup">
                 <Player />
            </group>

            <LevelManager />
        </group>
        {effectsEnabled && <Effects />}
    </>
  );
}

function App() {
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      <AuthSync />
      <RouterSync />
      <MultiplayerSync />
      <Canvas
        shadows
        dpr={[1, 1.5]} 
        gl={{ antialias: false, stencil: false, depth: true, powerPreference: "high-performance" }}
        // Initial camera, matches the controller base
        camera={{ position: [0, 5.5, 8], fov: 60 }}
      >
        <CameraController />
        <Suspense fallback={null}>
            <Scene />
        </Suspense>
      </Canvas>
      <HUD />
    </div>
  );
}

export default App;
