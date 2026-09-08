import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ModelManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.cachedAnimations = [];

    // User-retargeted game models in @animated/
    this.modelsCatalog = [
      {
        id: '2_animated',
        path: '/animated/2_animated.glb',
        name: 'UNIT-02 Axelrod',
        category: 'ANIMATED',
        icon: '🥊',
        hasAnim: true
      },
      {
        id: '10_animated',
        path: '/animated/10_animated.glb',
        name: 'UNIT-10 Vanguard',
        category: 'ANIMATED',
        icon: '🤖',
        hasAnim: true
      },
      {
        id: '03_r15',
        path: '/animated/03_r15.glb?v=repair-20260908',
        name: 'UNIT-03 — R15 RIG (Roblox)',
        category: 'R15 RIG ROBLOX',
        icon: '🦾',
        hasAnim: true
      }
    ];
  }

  /**
   * Loads a GLTF / GLB model with progress callback
   */
  loadModel(url, onProgress) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          // Cache animations if found
          if (gltf.animations && gltf.animations.length > 0) {
            this.cachedAnimations = gltf.animations;
          }

          const stats = this.computeModelStats(gltf);
          resolve({ gltf, stats });
        },
        (xhr) => {
          if (onProgress && xhr.total > 0) {
            onProgress(xhr.loaded / xhr.total);
          }
        },
        (err) => {
          console.error(`Error loading model from ${url}:`, err);
          reject(err);
        }
      );
    });
  }

  /**
   * Load external GLB file from drag-and-drop ArrayBuffer
   */
  loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target.result;
        this.loader.parse(
          buffer,
          '',
          (gltf) => {
            const stats = this.computeModelStats(gltf);
            const customItem = {
              id: 'custom_' + Date.now(),
              name: file.name,
              category: 'CUSTOM',
              icon: '📁',
              hasAnim: (gltf.animations && gltf.animations.length > 0)
            };
            this.modelsCatalog.push(customItem);
            resolve({ gltf, stats, fileName: file.name, customItem });
          },
          (err) => reject(err)
        );
      };
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Detailed technical geometry, texture, and rig statistics
   */
  computeModelStats(gltf) {
    let vertices = 0;
    let triangles = 0;
    let meshes = 0;
    let skinnedMeshes = 0;
    let materials = new Set();
    let textures = new Set();
    let bones = 0;

    gltf.scene.traverse((node) => {
      if (node.isMesh) {
        meshes++;
        if (node.isSkinnedMesh) skinnedMeshes++;

        const geo = node.geometry;
        if (geo) {
          if (geo.attributes.position) {
            vertices += geo.attributes.position.count;
          }
          if (geo.index) {
            triangles += geo.index.count / 3;
          } else if (geo.attributes.position) {
            triangles += geo.attributes.position.count / 3;
          }
        }

        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m) => {
            materials.add(m.uuid);
            if (m.map) textures.add(m.map.uuid);
            if (m.normalMap) textures.add(m.normalMap.uuid);
            if (m.roughnessMap) textures.add(m.roughnessMap.uuid);
            if (m.metalnessMap) textures.add(m.metalnessMap.uuid);
            if (m.emissiveMap) textures.add(m.emissiveMap.uuid);
          });
        }
      } else if (node.isBone) {
        bones++;
      }
    });

    const animationClips = (gltf.animations || []).map((clip) => ({
      name: clip.name,
      duration: Number(clip.duration.toFixed(2)),
      tracks: clip.tracks.length
    }));

    return {
      triangles: Math.round(triangles),
      vertices,
      meshes,
      skinnedMeshes,
      materialsCount: materials.size,
      texturesCount: textures.size,
      bonesCount: bones,
      animationsCount: animationClips.length,
      animations: animationClips
    };
  }
}
