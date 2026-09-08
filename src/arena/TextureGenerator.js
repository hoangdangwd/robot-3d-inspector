import * as THREE from 'three';

/**
 * Procedural Realistic PBR Texture Generator
 * Generates lightweight, high-fidelity textures for realistic combat ring & arena.
 */
export class TextureGenerator {
  /**
   * Generates realistic combat canvas mat texture
   */
  static createRealisticMatTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 1. Dark realistic charcoal canvas base
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#22252c');
    grad.addColorStop(0.6, '#1a1d22');
    grad.addColorStop(1, '#14161a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 2. Realistic woven canvas fabric grain
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Fine canvas weave modulation
        const weave = ((x % 4 < 2) ^ (y % 4 < 2)) ? 4 : -4;
        const noise = (Math.random() - 0.5) * 6;
        const delta = weave + noise;

        data[idx] = Math.max(0, Math.min(255, data[idx] + delta));
        data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + delta));
        data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + delta));
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Realistic ring boundary lines (clean, subtle, non-glowing)
    const drawOctagon = (r, color, width) => {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i + Math.PI / 8;
        const px = r * Math.cos(angle);
        const py = r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    // Outer combat perimeter line
    drawOctagon(size * 0.44, 'rgba(235, 238, 245, 0.75)', 4);
    drawOctagon(size * 0.42, 'rgba(180, 185, 195, 0.4)', 2);

    // Inner competition zone circle
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = 'rgba(235, 238, 245, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    // Center starting marks (two referee starting lines)
    ctx.fillStyle = 'rgba(235, 238, 245, 0.7)';
    ctx.fillRect(-size * 0.08, -size * 0.06, size * 0.16, 4);
    ctx.fillRect(-size * 0.08, size * 0.06, size * 0.16, 4);

    // Subtle center mark
    ctx.strokeStyle = 'rgba(235, 238, 245, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.04, 0, Math.PI * 2);
    ctx.stroke();

    // Corner zone indicators (Subtle Red & Blue markers)
    const postR = size * 0.36;
    ctx.strokeStyle = 'rgba(220, 50, 60, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-postR, postR, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(40, 120, 230, 0.5)';
    ctx.beginPath();
    ctx.arc(postR, postR, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Realistic Roughness map for the mat (high roughness matte canvas, slightly smoother lines)
   */
  static createRealisticMatRoughness() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base rough canvas (~0.85 roughness = #d8d8d8)
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, size, size);

    // Subtle noise
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 12;
      const v = Math.max(0, Math.min(255, 216 + n));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Realistic canvas apron (skirt) texture with subtle vertical drape pleats
   */
  static createApronTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, 0, 512, 256);

    // Subtle vertical fabric pleat shading
    for (let x = 0; x < 512; x += 32) {
      const grad = ctx.createLinearGradient(x, 0, x + 32, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.25)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 32, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(6, 1);
    return texture;
  }

  /**
   * Realistic industrial diamond tread plate for steel stairs
   */
  static createMetalTreadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#20242b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#343a45';
    const step = 16;
    for (let x = 0; x < 256; x += step) {
      for (let y = 0; y < 256; y += step) {
        if ((x / step + y / step) % 2 === 0) {
          ctx.beginPath();
          ctx.ellipse(x + step / 2, y + step / 2, 5, 2, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  /**
   * Realistic dark polished concrete floor texture
   */
  static createConcreteFloorTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, size, size);

    // Subtle aggregate noise
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 8;
      const v = Math.max(0, Math.min(255, 18 + n));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v + 1;
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
  }
}
