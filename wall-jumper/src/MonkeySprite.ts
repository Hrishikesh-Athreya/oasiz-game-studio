// Ninja Sprite System
// Uses individual sprite images with head bobbing animation

export interface MonkeyState {
    x: number;
    y: number;
    facingDir: -1 | 1;        // -1 = left, 1 = right
    isOnWall: boolean;
    isOnGround: boolean;
    isBackflipping: boolean;
    backflipAngle: number;    // Current rotation during backflip (radians)
    velocityY: number;
}

// Ninja sprite images
const NINJA_SPRITES = {
    rest1: '/assets/ninja_rest_1.png',  // Head up
    rest2: '/assets/ninja_rest_2.png',  // Head down
    jump: '/assets/ninja_sprite_jump.png',  // Jumping pose
    flip: '/assets/ninja_flip_posture.png',  // Backflip pose
};

// Loaded images
const loadedImages: Map<string, HTMLImageElement> = new Map();
let spritesLoaded = false;
let loadingPromise: Promise<void> | null = null;

// Animation timing
let animTime = 0;
const BOB_CYCLE_MS = 800; // Full head bob cycle in ms

// Load all ninja sprites
export function loadSpriteSheet(): Promise<void> {
    if (loadingPromise) return loadingPromise;
    
    loadingPromise = new Promise((resolve, reject) => {
        if (spritesLoaded) {
            resolve();
            return;
        }
        
        const imagePaths = Object.values(NINJA_SPRITES);
        let loaded = 0;
        
        imagePaths.forEach((path, index) => {
            const img = new Image();
            img.onload = () => {
                loadedImages.set(path, img);
                loaded++;
                console.log(`[NinjaSprite] Loaded ${path} (${loaded}/${imagePaths.length})`);
                if (loaded === imagePaths.length) {
                    spritesLoaded = true;
                    console.log('[NinjaSprite] All sprites loaded');
                    resolve();
                }
            };
            img.onerror = (e) => {
                console.error(`[NinjaSprite] Failed to load ${path}:`, e);
                reject(e);
            };
            img.src = path;
        });
    });
    
    return loadingPromise;
}

// Auto-load sprites
loadSpriteSheet();

export function updateMonkeyAnimation(deltaMs: number) {
    animTime += deltaMs;
}

// Scale factor for rendering
const RENDER_SCALE = 2.5;

export function drawMonkey(
    ctx: CanvasRenderingContext2D,
    state: MonkeyState,
    size: number
) {
    if (!spritesLoaded) {
        // Fallback: draw a simple rectangle if sprites not loaded
        ctx.fillStyle = '#3D3D5C';
        ctx.fillRect(state.x - size/2, state.y - size/2, size, size);
        return;
    }
    
    // Determine which sprite to use based on state
    let spritePath: string;
    
    if (state.isBackflipping) {
        // Backflipping - use flip sprite
        spritePath = NINJA_SPRITES.flip;
    } else if (!state.isOnWall && !state.isOnGround) {
        // Jumping/falling - use jump sprite
        spritePath = NINJA_SPRITES.jump;
    } else {
        // On wall or ground - use head bob animation
        const bobPhase = Math.sin((animTime / BOB_CYCLE_MS) * Math.PI * 2);
        const useHeadUp = bobPhase > 0;
        spritePath = useHeadUp ? NINJA_SPRITES.rest1 : NINJA_SPRITES.rest2;
    }
    
    const sprite = loadedImages.get(spritePath);
    
    if (!sprite) {
        return;
    }
    
    // Calculate render size maintaining aspect ratio
    const aspectRatio = sprite.height / sprite.width;
    const renderWidth = size * RENDER_SCALE;
    const renderHeight = renderWidth * aspectRatio;
    
    ctx.save();
    ctx.translate(state.x, state.y);
    
    // Apply backflip rotation
    if (state.isBackflipping) {
        ctx.rotate(state.backflipAngle);
    }
    
    // Flip horizontally based on facing direction
    // The sprites face right by default, so flip when facing left
    if (state.facingDir === -1) {
        ctx.scale(-1, 1);
    }
    
    // Draw the sprite centered
    ctx.drawImage(
        sprite,
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight
    );
    
    ctx.restore();
}
