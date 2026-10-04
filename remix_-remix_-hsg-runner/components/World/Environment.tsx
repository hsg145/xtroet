/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH, GameStatus } from '../../types';

const StarField: React.FC<{ theme: any }> = ({ theme }) => {
    const count = 3000;
    const meshRef = useRef<THREE.Points>(null);
  
  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 400;
      let y = (Math.random() - 0.5) * 200 + 50; 
      let z = -550 + Math.random() * 650;

      if (Math.abs(x) < 15 && y > -5 && y < 20) {
          if (x < 0) x -= 15;
          else x += 15;
      }

      pos[i * 3] = x;     
      pos[i * 3 + 1] = y; 
      pos[i * 3 + 2] = z; 
      sz[i] = Math.random() * 0.5 + 0.1;
    }
    return [pos, sz];
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const posAttr = meshRef.current.geometry.attributes.position;
    const currentSpeed = useStore.getState().speed;
    const activeSpeed = currentSpeed > 0 ? currentSpeed : 2; 

    for (let i = 0; i < count; i++) {
        let z = posAttr.array[i * 3 + 2];
        z += activeSpeed * delta * 2.0; 
        
        if (z > 100) {
            z = -550 - Math.random() * 50; 
        }
        posAttr.array[i * 3 + 2] = z;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        color={theme.stars}
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
};

const Nebula: React.FC<{ theme: any }> = ({ theme }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y = state.clock.elapsedTime * 0.02;
        }
    });

    return (
        <mesh ref={meshRef} position={[0, 50, -250]}>
            <sphereGeometry args={[200, 32, 32]} />
            <meshBasicMaterial 
                color={theme.ambient} 
                side={THREE.BackSide} 
                transparent 
                opacity={0.1} 
            />
        </mesh>
    );
};

const LaneGuides: React.FC<{ theme: any }> = ({ theme }) => {
    const { laneCount, onlinePlayers, status } = useStore();
    
    const renderGuides = (trackOffset: number, keyPrefix: string) => {
        const startX = -(laneCount * LANE_WIDTH) / 2;
        const lines: number[] = [];
        for (let i = 0; i <= laneCount; i++) {
            lines.push(startX + (i * LANE_WIDTH));
        }

        return (
            <group key={keyPrefix} position={[trackOffset, 0.02, 0]}>
                <mesh position={[0, -0.02, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[laneCount * LANE_WIDTH, 200]} />
                    <meshBasicMaterial color={theme.bg} transparent opacity={0.9} />
                </mesh>

                {lines.map((x, i) => (
                    <mesh key={`sep-${keyPrefix}-${i}`} position={[x, 0, -20]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[0.05, 200]} /> 
                        <meshBasicMaterial color={theme.dirLight} transparent opacity={0.4} />
                    </mesh>
                ))}
            </group>
        );
    };

    if (status === GameStatus.ONLINE) {
        // Only render one set of guides since players are no longer side-by-side
        return renderGuides(0, 'online-shared');
    }

    return renderGuides(0, 'local');
};

const RetroSun: React.FC<{ theme: any }> = ({ theme }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const sunGroupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            matRef.current.uniforms.uColorTop.value.set(theme.sunTop);
            matRef.current.uniforms.uColorBottom.value.set(theme.sunBot);
        }
        if (sunGroupRef.current) {
            sunGroupRef.current.position.y = 30 + Math.sin(state.clock.elapsedTime * 0.2) * 1.0;
        }
    });

    return (
        <group ref={sunGroupRef} position={[0, 30, -180]}>
            <mesh>
                <sphereGeometry args={[35, 32, 32]} />
                <shaderMaterial
                    ref={matRef}
                    uniforms={{
                        uTime: { value: 0 },
                        uColorTop: { value: new THREE.Color(theme.sunTop) }, 
                        uColorBottom: { value: new THREE.Color(theme.sunBot) } 
                    }}
                    transparent
                    vertexShader={`
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `}
                    fragmentShader={`
                        varying vec2 vUv;
                        uniform float uTime;
                        uniform vec3 uColorTop;
                        uniform vec3 uColorBottom;

                        void main() {
                            vec3 color = mix(uColorBottom, uColorTop, vUv.y);
                            float stripeFreq = 40.0;
                            float stripes = sin((vUv.y * stripeFreq) - (uTime * 1.0));
                            float stripeMask = smoothstep(0.2, 0.3, stripes);
                            float scanlineFade = smoothstep(0.7, 0.3, vUv.y); 
                            vec3 finalColor = mix(color, color * 0.1, (1.0 - stripeMask) * scanlineFade);
                            gl_FragColor = vec4(finalColor, 1.0);
                        }
                    `}
                />
            </mesh>
        </group>
    );
};

const MovingGrid: React.FC<{ theme: any }> = ({ theme }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const offsetRef = useRef(0);
    
    useFrame((state, delta) => {
        if (meshRef.current) {
             const currentSpeed = useStore.getState().speed;
             const activeSpeed = currentSpeed > 0 ? currentSpeed : 5;
             offsetRef.current += activeSpeed * delta;
             const cellSize = 10;
             const zPos = -100 + (offsetRef.current % cellSize);
             meshRef.current.position.z = zPos;
        }
    });

    return (
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, -100]}>
            <planeGeometry args={[300, 400, 30, 40]} />
            <meshBasicMaterial color={theme.grid} wireframe transparent opacity={0.15} />
        </mesh>
    );
};

const THEMES: Record<number, any> = {
  1: { bg: '#050011', fog: '#050011', grid: '#8800ff', sunTop: '#ffe600', sunBot: '#ff0077', ambient: '#400080', dirLight: '#00ffff', pointLight: '#ff00aa', stars: '#ffffff' },
  2: { bg: '#2b0700', fog: '#2b0700', grid: '#ffaa00', sunTop: '#ffffff', sunBot: '#ff3300', ambient: '#802000', dirLight: '#ffcc00', pointLight: '#ff0000', stars: '#ffccaa' },
  3: { bg: '#000b18', fog: '#000b18', grid: '#00ffff', sunTop: '#ff00ff', sunBot: '#00ffff', ambient: '#004080', dirLight: '#ff00ff', pointLight: '#00ffff', stars: '#ccffff' },
  4: { bg: '#000000', fog: '#000000', grid: '#ffffff', sunTop: '#555555', sunBot: '#000000', ambient: '#222222', dirLight: '#ffffff', pointLight: '#aaaaaa', stars: '#ffffff' },
  5: { bg: '#001a00', fog: '#001a00', grid: '#00ff00', sunTop: '#ccffcc', sunBot: '#006600', ambient: '#004000', dirLight: '#00ff00', pointLight: '#00ff66', stars: '#ccffcc' },
  6: { bg: '#1a0000', fog: '#1a0000', grid: '#ff0000', sunTop: '#ff9900', sunBot: '#660000', ambient: '#400000', dirLight: '#ff0000', pointLight: '#ff3300', stars: '#ffcccc' }
};

export const Environment: React.FC = () => {
  const mapId = useStore(state => state.mapId) || 1;
  const theme = THEMES[mapId] || THEMES[1];

  return (
    <>
      <color attach="background" args={[theme.bg]} />
      <fog attach="fog" args={[theme.fog, 40, 160]} />
      
      <ambientLight intensity={0.2} color={theme.ambient} />
      <directionalLight position={[0, 20, -10]} intensity={1.5} color={theme.dirLight} />
      <pointLight position={[0, 25, -150]} intensity={2} color={theme.pointLight} distance={200} decay={2} />
      
      <StarField theme={theme} />
      <Nebula theme={theme} />
      <MovingGrid theme={theme} />
      <LaneGuides theme={theme} />
      <RetroSun theme={theme} />
    </>
  );
};
