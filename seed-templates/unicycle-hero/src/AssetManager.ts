// Asset Manager for Unicycle Hero
export class AssetManager {
  private static images: Map<string, HTMLImageElement> = new Map();
  private static audio: Map<string, HTMLAudioElement> = new Map();

  // Load all game assets
  static async loadAssets(): Promise<void> {
    // Create placeholder canvas assets for now
    await this.createPlaceholderAssets();
    
    // Wait for all images to load
    await Promise.all(Array.from(this.images.values()).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve(); // Continue even if loading fails
      });
    }));
  }

  private static async createPlaceholderAssets(): Promise<void> {
    // Create background texture
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 800;
    bgCanvas.height = 600;
    const bgCtx = bgCanvas.getContext('2d')!;
    
    // Hand-drawn doodle style background
    bgCtx.fillStyle = '#f5f5dc';
    bgCtx.fillRect(0, 0, 800, 600);
    
    // Add doodle lines
    bgCtx.strokeStyle = '#8b7355';
    bgCtx.lineWidth = 2;
    bgCtx.setLineDash([5, 3]);
    
    for (let i = 0; i < 20; i++) {
      bgCtx.beginPath();
      bgCtx.moveTo(Math.random() * 800, Math.random() * 600);
      bgCtx.lineTo(Math.random() * 800, Math.random() * 600);
      bgCtx.stroke();
    }
    
    const bgImage = new Image();
    bgImage.src = bgCanvas.toDataURL();
    this.images.set('background', bgImage);

    // Create unicycle wheel sprite
    const wheelCanvas = document.createElement('canvas');
    wheelCanvas.width = 100;
    wheelCanvas.height = 100;
    const wheelCtx = wheelCanvas.getContext('2d')!;
    
    // Draw wheel
    wheelCtx.fillStyle = '#333';
    wheelCtx.beginPath();
    wheelCtx.arc(50, 50, 40, 0, Math.PI * 2);
    wheelCtx.fill();
    
    // Draw spokes
    wheelCtx.strokeStyle = '#666';
    wheelCtx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI * 2) / 8;
      wheelCtx.beginPath();
      wheelCtx.moveTo(50, 50);
      wheelCtx.lineTo(50 + Math.cos(angle) * 35, 50 + Math.sin(angle) * 35);
      wheelCtx.stroke();
    }
    
    // Draw hub
    wheelCtx.fillStyle = '#999';
    wheelCtx.beginPath();
    wheelCtx.arc(50, 50, 8, 0, Math.PI * 2);
    wheelCtx.fill();
    
    const wheelImage = new Image();
    wheelImage.src = wheelCanvas.toDataURL();
    this.images.set('wheel', wheelImage);

    // Create body parts sprites
    this.createBodyPart('head', 24, 24, '#fdbcb4');
    this.createBodyPart('torso', 40, 70, '#4169e1');
    this.createBodyPart('arm', 10, 40, '#fdbcb4');
    this.createBodyPart('leg', 12, 50, '#4169e1');
    this.createBodyPart('seat', 8, 40, '#8b4513');
  }

  private static createBodyPart(name: string, width: number, height: number, color: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    
    // Add simple outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
    
    const image = new Image();
    image.src = canvas.toDataURL();
    this.images.set(name, image);
  }

  static getImage(name: string): HTMLImageElement | undefined {
    return this.images.get(name);
  }

  static createAudioElement(): HTMLAudioElement {
    // Create a simple audio context for placeholder sound
    const audio = new Audio();
    audio.volume = 0.3;
    return audio;
  }
}
