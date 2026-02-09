
import './style.css';
import Matter from 'matter-js';
import { drawMonkey, updateMonkeyAnimation, MonkeyState } from './MonkeySprite';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 0.8,
    JUMP_ANGLE_DEG: 65,
    JUMP_INITIAL_SPEED: 9,
    THRUST_FORCE: 1.0,
    THRUST_MAX_MS: 400,
    // Air flip config
    FLIP_ANGLE_DEG: 55,
    FLIP_INITIAL_SPEED: 9,
    FLIP_THRUST_FORCE: 1.0,
    FLIP_THRUST_MAX_MS: 400,
    WALL_WIDTH: 40,
    PLAYER_SIZE: 30,
    GENERATE_AHEAD_SCREENS: 0.9,
    DELETE_BELOW_SCREENS: 1.25,
    WALL_PADDING: 60,
    FLOOR_HEIGHT: 70,
    BOUNDARY_THICKNESS: 80,
    MAX_WALLS_PER_CALL: 1,
    ACTIVE_WALL_CAP: 24
};

// --- WALL SPRITE SYSTEM ---
const wallImages: Map<string, HTMLImageElement> = new Map();
let wallSpritesLoaded = false;

const WALL_SPRITE_PATHS: Record<string, string> = {
    // Normal walls
    static1: '/assets/static_platform_1.png',
    static2: '/assets/static_platform_2.png',
    // Spiked wall (disappearing)
    spike1: '/assets/spiked_wall/spike_platform_0_01.png',
    spike2: '/assets/spiked_wall/spike_platform_0_02.png',
    spike3: '/assets/spiked_wall/spike_platform_0_03.png',
    spike4: '/assets/spiked_wall/spiked_platform_0_04.png',
    // Lightning wall (timed-danger)
    lightning1: '/assets/lightning_wall/1.png',
    lightning2: '/assets/lightning_wall/2.png',
    lightning3: '/assets/lightning_wall/3.png',
    lightning3_5: '/assets/lightning_wall/3.5.png',
    lightning5: '/assets/lightning_wall/5.png',
    lightning6: '/assets/lightning_wall/6.png',
    lightning7: '/assets/lightning_wall/7.png',
    lightning8: '/assets/lightning_wall/8.png',
    lightning9: '/assets/lightning_wall/9.png',
    lightning10: '/assets/lightning_wall/10.png',
    // Background
    bg: '/assets/nature_background.png',
};

// Background Music
const bgMusic = new Audio('/assets/Shadow Step.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.5;

// Death Sound
const deathSound = new Audio('/assets/death_sound.mp3');
deathSound.volume = 0.1;

// Settings (module level for access across functions)
let settings: Record<string, boolean> = { music: true, fx: true, haptics: true };

function loadSettings(): void {
    const saved = localStorage.getItem('wallJumperSettings');
    if (saved) {
        settings = JSON.parse(saved);
    }
}

function saveSettings(): void {
    localStorage.setItem('wallJumperSettings', JSON.stringify(settings));
}

function playMusic() {
    if (bgMusic.paused && settings.music) {
        bgMusic.play().catch(() => {
            // Autoplay blocked, will play on next user interaction
        });
    }
}

function pauseMusic() {
    if (!bgMusic.paused) {
        bgMusic.pause();
    }
}

function stopMusic() {
    bgMusic.pause();
    bgMusic.currentTime = 0;
}

function updateMusicState() {
    if (gameActive && !gamePaused && settings.music) {
        playMusic();
    } else {
        pauseMusic();
    }
}

function loadWallSprites(): Promise<void> {
    return new Promise((resolve) => {
        const entries = Object.entries(WALL_SPRITE_PATHS);
        let loaded = 0;
        entries.forEach(([key, path]) => {
            const img = new Image();
            img.onload = () => {
                wallImages.set(key, img);
                loaded++;
                if (loaded === entries.length) {
                    wallSpritesLoaded = true;
                    console.log('[WallSprites] All wall sprites loaded');
                    resolve();
                }
            };
            img.onerror = () => {
                console.error(`[WallSprites] Failed to load ${path}`);
                loaded++;
                if (loaded === entries.length) {
                    wallSpritesLoaded = true;
                    resolve();
                }
            };
            img.src = path;
        });
    });
}
loadWallSprites();

// --- 10-COLUMN COORDINATE SYSTEM ---
const NUM_COLUMNS = 10;
const COLUMN_MARGIN = 0.05; // 5% margin on each side

// Calculate column width based on screen
function getColumnWidth(): number {
    const w = window.innerWidth;
    const usableWidth = w * (1 - 2 * COLUMN_MARGIN);
    return usableWidth / (NUM_COLUMNS - 1);
}

function getColumnX(col: number): number {
    const w = window.innerWidth;
    return w * COLUMN_MARGIN + col * getColumnWidth();
}

// --- JUMP PHYSICS CALCULATIONS ---
// Calculate actual reachable distances based on physics config
// Using projectile motion with thrust:
// - Initial velocity at angle
// - Continuous thrust force for THRUST_MAX_MS
// - Gravity pulling down

// Calculate actual jump reach from physics config:
// At 65° angle: cos(65°) ≈ 0.42, sin(65°) ≈ 0.91
// Initial horizontal velocity = JUMP_INITIAL_SPEED * cos(angle) ≈ 13 * 0.42 ≈ 5.5 px/frame
// With thrust applied for 400ms (~24 frames at 60fps), horizontal reach increases significantly
// Empirically tuned values that match actual gameplay:
const JUMP_MAX_HORIZONTAL = 280; // Max horizontal distance per jump (pixels)
const JUMP_MAX_VERTICAL = 200;   // Max vertical rise per jump (pixels)
const JUMP_MIN_VERTICAL = 100;   // Min vertical gap to avoid overlap

// Comfortable jump distances (not max, but reliable)
const JUMP_COMFORTABLE_X = 180;  // Comfortable horizontal jump
const JUMP_COMFORTABLE_Y = -140; // Comfortable vertical rise (negative = up)

// Convert column distance to pixels
function columnsToPx(cols: number): number {
    return cols * getColumnWidth();
}

// Check if a jump from (x1, y1) to (x2, y2) is reachable
// Note: y decreases as we go up (screen coordinates)
function isJumpReachable(dx: number, dy: number): boolean {
    const absX = Math.abs(dx);
    const rise = -dy; // Convert to positive rise (since y decreases upward)
    
    // Must go upward
    if (rise < JUMP_MIN_VERTICAL) return false;
    if (rise > JUMP_MAX_VERTICAL) return false;
    
    // Horizontal distance must be within reach
    if (absX > JUMP_MAX_HORIZONTAL) return false;
    
    // Wider jumps need more vertical space (arc trajectory)
    if (absX > 150 && rise < 100) return false;
    
    return true;
}

// Wall height variants
type WallSize = 'short' | 'medium' | 'tall';

const WALL_HEIGHTS: Record<WallSize, { min: number; max: number }> = {
    'short': { min: 100, max: 160 },
    'medium': { min: 180, max: 260 },
    'tall': { min: 280, max: 380 },
};

// --- SPECIAL WALL TYPES ---
type WallType = 'normal' | 'disappearing' | 'timed-danger' | 'one-sided-danger';

// Wall state tracking for special behaviors
interface WallState {
    type: WallType;
    firstTouchTime: number | null;  // Timestamp of first contact
    dangerSide?: 'left' | 'right';  // For one-sided danger walls
    isActive: boolean;              // Whether wall is still active
    opacity: number;                // For fade effects
    lastSwitchTime: number;         // For one-sided walls: when danger side last switched
    createdTime: number;            // For lightning wall passive cycle
    isSpent: boolean;               // For spiked walls: true after countdown completes
}

// Map to track wall states by body id
const wallStates: Map<number, WallState> = new Map();

// Special wall timing constants
const DISAPPEAR_DELAY_MS = 3000;    // 3 seconds before spiked wall finishes countdown
const LIGHTNING_SAFE_MS = 4000;     // 4 seconds safe period
const LIGHTNING_DANGER_MS = 1000;   // 1 second unjumpable period
const LIGHTNING_CYCLE_MS = LIGHTNING_SAFE_MS + LIGHTNING_DANGER_MS; // 5s total cycle
const DANGER_SWITCH_MS = 4000;      // 4 seconds between danger side switches

// Wall type spawn chances (must sum to 1.0)
const WALL_TYPE_CHANCES = {
    'normal': 0.55,           // 55% normal walls
    'disappearing': 0.25,     // 25% disappearing
    'timed-danger': 0.20,     // 20% timed danger
    'one-sided-danger': 0.00, // DISABLED
};

// Get random wall type based on chances (only after VARIETY_START_LEVEL)
function getRandomWallType(): WallType {
    // Only normal walls until player reaches variety level
    if (level < VARIETY_START_LEVEL) return 'normal';
    
    const rand = Math.random();
    let cumulative = 0;
    for (const [type, chance] of Object.entries(WALL_TYPE_CHANCES)) {
        cumulative += chance;
        if (rand < cumulative) return type as WallType;
    }
    return 'normal';
}

// Get wall color based on type
function getWallColor(type: WallType, dangerSide?: 'left' | 'right'): string {
    switch (type) {
        case 'disappearing': return '#FFAA00';      // Orange - disappearing
        case 'timed-danger': return '#FF0000';      // Red - timed danger
        case 'one-sided-danger': return '#AA00FF';  // Purple - one-sided
        default: return '#00AAFF';                  // Blue - normal
    }
}

// --- PATTERN SYSTEM (X-Y Pixel Offsets) ---
// Patterns use relative dx/dy pixel offsets from pattern origin
// This makes patterns position-agnostic templates

type PatternWall = {
    dx: number;      // Horizontal offset from pattern origin (pixels, positive = right)
    dy: number;      // Vertical offset from pattern origin (pixels, negative = up)
    height: WallSize;
};

type Pattern = {
    name: string;
    walls: PatternWall[];      // Walls defined relative to pattern origin
    exitDx: number;            // Exit X offset from origin (pixels)
    exitDy: number;            // Exit Y offset from origin (pixels, negative = up)
    firstJumpDir: -1 | 1;      // Direction of first internal jump: -1 = left, 1 = right
};

// Vertical spacing between walls within a pattern
// Must be: maxWallHeight + gap to guarantee no overlap
// Medium max = 260px, so 260 + 60 gap = 320px minimum center-to-center
const WALL_VERTICAL_SPACING = WALL_HEIGHTS['medium'].max + 60;

// Default patterns with MEDIUM walls and proper spacing
const DEFAULT_PATTERNS: Pattern[] = [
    // Staircase right (3 walls)
    { name: 'stair-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 400, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
    ], exitDx: 400, exitDy: -WALL_VERTICAL_SPACING * 2, firstJumpDir: 1 },
    
    // Staircase left (3 walls)
    { name: 'stair-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -400, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
    ], exitDx: -400, exitDy: -WALL_VERTICAL_SPACING * 2, firstJumpDir: -1 },
    
    // Zigzag right (4 walls)
    { name: 'zigzag-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 220, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 40, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: 260, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: 260, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: 1 },
    
    // Zigzag left (4 walls)
    { name: 'zigzag-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -220, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -40, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: -260, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: -260, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: -1 },
    
    // Step right (2 walls)
    { name: 'step-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
    ], exitDx: 200, exitDy: -WALL_VERTICAL_SPACING, firstJumpDir: 1 },
    
    // Step left (2 walls)
    { name: 'step-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
    ], exitDx: -200, exitDy: -WALL_VERTICAL_SPACING, firstJumpDir: -1 },
    
    // Long stair right (4 walls)
    { name: 'long-stair-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 180, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 360, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: 540, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: 540, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: 1 },
    
    // Long stair left (4 walls)
    { name: 'long-stair-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -180, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -360, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: -540, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: -540, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: -1 },
];

// Load patterns from localStorage (synced with editor) or use defaults
function loadPatterns(): Pattern[] {
    const saved = localStorage.getItem('wallJumperPatterns');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            console.log(`[loadPatterns] Loaded ${parsed.length} patterns from localStorage`);
            return parsed;
        } catch (e) {
            console.warn('[loadPatterns] Failed to parse localStorage, using defaults');
        }
    }
    console.log('[loadPatterns] Using default patterns');
    return DEFAULT_PATTERNS;
}

// Active patterns - loaded from localStorage or defaults
let PATTERNS: Pattern[] = loadPatterns();

// Level generation state - tracks position and highest point
type GenerationState = {
    x: number;          // X position of exit wall center
    y: number;          // Y position of exit wall center
    highestY: number;   // TOP of highest wall generated (lowest Y value)
    lastDir: -1 | 1;    // Direction of last pattern exit
};

// --- SETUP ---
const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;

const engine = Matter.Engine.create();
engine.gravity.y = CONFIG.GRAVITY;
const world = engine.world;

const render = Matter.Render.create({
    element: document.body,
    engine: engine,
    canvas: canvas,
    options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: '#111',
        hasBounds: true
    }
});

// --- STATE ---
let player: Matter.Body | null = null;
let walls: Matter.Body[] = [];
let gameActive = false;
let gamePaused = false;
let score = 0;
let highestPoint = 0;
let startY = 0;

// Camera / Level Gen
let cameraX = 0;
let cameraY = 0;
let wallsGenerated = 0;

// Level tracking
let level = 0;
const countedWalls: Set<number> = new Set(); // Track wall IDs already counted
const VARIETY_START_LEVEL = 5; // Start spawning special walls after this level

// Ground death tracking - game over if player returns to ground after leaving
let hasLeftGround = false;
let resetGraceFrames = 0; // Ignore collision events for a few frames after reset

// Camera smoothing config
const CAMERA_SMOOTH_X = 0.06; // Horizontal follow speed
const CAMERA_SMOOTH_Y = 0.06;  // Vertical follow speed (up)
const CAMERA_SMOOTH_Y_DOWN = 0.04; // Vertical follow speed (down, slower)

// Smoothed camera look-ahead values (interpolated each frame, never jump)
let smoothLookAheadX = 0;
let smoothLookAheadY = 0;
const LOOK_AHEAD_LERP = 0.04; // How fast the look-ahead eases toward its target

// Physics State
let isWallSliding = false;
let currentWallSide = 0; // -1 Left, 1 Right
let canJump = false;
let wallJumpLockout = 0; // Lockout timer

let isThrusting = false;
let thrustStartMs = 0;
let hasJumpedThisPress = false;
let thrustDirX = 0;
let thrustDirY = -1;

// Air flip state
let canAirFlip = false;
let hasUsedAirFlip = false;
let lastJumpDir = 0; // -1 = left, 1 = right
let isFlipThrust = false;

// Monkey animation state
let monkeyFacingDir: -1 | 1 = 1;
let isBackflipping = false;
let backflipAngle = 0;
let backflipSpeed = 0;
const BACKFLIP_ROTATION_SPEED = 12; // radians per second
let lastFrameTime = performance.now();

// --- FACTORIES ---

function createPlayer(x: number, y: number) {
    return Matter.Bodies.rectangle(x, y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, {
        label: 'player',
        restitution: 0,
        friction: 0.8,
        frictionAir: 0.02,
        inertia: Infinity,
        render: { visible: false } // Hidden - we draw custom monkey sprite
    });
}

function createWall(
    x: number, 
    y: number, 
    height: number, 
    color: string, 
    patternName?: string, 
    wallIndex?: number,
    wallType: WallType = 'normal'
) {
    const actualColor = wallType === 'normal' ? color : getWallColor(wallType);
    const dangerSide = wallType === 'one-sided-danger' ? (Math.random() < 0.5 ? 'left' : 'right') : undefined;
    
    const wall = Matter.Bodies.rectangle(x, y, CONFIG.WALL_WIDTH, height, {
        isStatic: true,
        label: 'wall',
        restitution: 0,
        render: { visible: false } // Hidden - we draw custom wall sprites
    });
    
    // Store debug info
    (wall as any).patternName = patternName || 'start';
    (wall as any).wallIndex = wallIndex ?? 0;
    (wall as any).wallType = wallType;
    (wall as any).dangerSide = dangerSide;
    // Alternate static platform sprite for normal walls
    (wall as any).staticVariant = Math.random() < 0.5 ? 1 : 2;
    
    // Register wall state for special types
    if (wallType !== 'normal') {
        wallStates.set(wall.id, {
            type: wallType,
            firstTouchTime: null,
            dangerSide,
            isActive: true,
            opacity: 1,
            lastSwitchTime: Date.now(),
            createdTime: Date.now(),
            isSpent: false,
        });
    }
    
    return wall;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function getWallHeight(size: WallSize): number {
    const range = WALL_HEIGHTS[size];
    return range.min + Math.random() * (range.max - range.min);
}

// --- LEVEL GENERATION (X-Y Pixel-Based) ---

// Generation state - tracks current position in absolute pixels
let genState: GenerationState = { x: 0, y: 0, highestY: 0, lastDir: 1 };

// Screen bounds for pattern placement
function getScreenBounds(): { minX: number; maxX: number } {
    const w = window.innerWidth;
    const margin = w * COLUMN_MARGIN;
    return { minX: margin + CONFIG.WALL_WIDTH, maxX: w - margin - CONFIG.WALL_WIDTH };
}

// Mirror a pattern horizontally (flip all dx values)
function mirrorPattern(pattern: Pattern): Pattern {
    return {
        ...pattern,
        name: pattern.name + '-mirrored',
        walls: pattern.walls.map(w => ({
            ...w,
            dx: -w.dx,
        })),
        exitDx: -pattern.exitDx,
        firstJumpDir: (pattern.firstJumpDir * -1) as -1 | 1,
    };
}

// Gap between patterns (from top of last pattern to bottom of next pattern's first wall)
const PATTERN_GAP = 60;

// Get the MAXIMUM half-height for a wall size (for safe placement calculations)
function getMaxWallHalfHeight(size: WallSize): number {
    return WALL_HEIGHTS[size].max / 2;
}

// Calculate the X range a pattern needs (min and max dx values)
function getPatternXExtent(pattern: Pattern): { minDx: number; maxDx: number } {
    let minDx = 0, maxDx = 0;
    for (const wall of pattern.walls) {
        if (wall.dx < minDx) minDx = wall.dx;
        if (wall.dx > maxDx) maxDx = wall.dx;
    }
    // Also consider exit position
    if (pattern.exitDx < minDx) minDx = pattern.exitDx;
    if (pattern.exitDx > maxDx) maxDx = pattern.exitDx;
    return { minDx, maxDx };
}

// Find a valid originX for a pattern, or return null if impossible
function findValidOriginX(pattern: Pattern, preferredX: number): number | null {
    const bounds = getScreenBounds();
    const extent = getPatternXExtent(pattern);
    
    // Pattern needs originX such that:
    // originX + minDx >= bounds.minX  →  originX >= bounds.minX - minDx
    // originX + maxDx <= bounds.maxX  →  originX <= bounds.maxX - maxDx
    const minOriginX = bounds.minX - extent.minDx;
    const maxOriginX = bounds.maxX - extent.maxDx;
    
    // Check if there's any valid range
    if (minOriginX > maxOriginX) return null; // Pattern is too wide for screen
    
    // Clamp preferred X to valid range
    return Math.max(minOriginX, Math.min(maxOriginX, preferredX));
}

// Spawn a pattern and return the actual highest Y (top of tallest wall)
function spawnPattern(pattern: Pattern, originX: number, originY: number): number {
    const colors = ['#FF0055', '#00AAFF', '#55FF00', '#FFCC00', '#FF6600', '#AA00FF'];
    let actualHighestY = Infinity;
    let prevWallBottom = Infinity; // Track previous wall's bottom for overlap check
    
    console.log(`[spawnPattern] ${pattern.name} at origin (${originX.toFixed(0)}, ${originY.toFixed(0)})`);
    console.log(`[spawnPattern] WALL_VERTICAL_SPACING = ${WALL_VERTICAL_SPACING}`);
    
    for (let i = 0; i < pattern.walls.length; i++) {
        const wallDef = pattern.walls[i];
        const x = originX + wallDef.dx;
        const y = originY + wallDef.dy;
        const height = getWallHeight(wallDef.height); // Actual random height
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        const wallTop = y - height / 2;
        const wallBottom = y + height / 2;
        
        // Check for overlap with previous wall
        if (i > 0 && wallBottom > prevWallBottom - 10) {
            console.warn(`[spawnPattern] OVERLAP! Wall ${i+1} bottom (${wallBottom.toFixed(0)}) overlaps with prev wall`);
        }
        
        console.log(`[spawnPattern] Wall ${i+1}: dy=${wallDef.dy}, y=${y.toFixed(0)}, h=${height.toFixed(0)}, top=${wallTop.toFixed(0)}, bottom=${wallBottom.toFixed(0)}`);
        
        // Randomize wall type (but keep first wall of pattern normal for fairness)
        const wallType = i === 0 ? 'normal' : getRandomWallType();
        
        const wall = createWall(x, y, height, color, pattern.name, i + 1, wallType);
        walls.push(wall);
        Matter.World.add(world, wall);
        wallsGenerated++;
        
        // Track for next iteration
        prevWallBottom = wallBottom;
        
        // Track actual top of this wall
        if (wallTop < actualHighestY) {
            actualHighestY = wallTop;
        }
    }
    
    return actualHighestY;
}

// Generate next pattern - INFINITE CANVAS: no bounds checking, camera follows player
function generateNextPattern(): boolean {
    const nextDir = -genState.lastDir as -1 | 1;
    
    // Filter patterns by direction
    const validPatterns = PATTERNS.filter(p => p.firstJumpDir === nextDir);
    if (validPatterns.length === 0) {
        console.warn('[generateNextPattern] No patterns for direction', nextDir);
        return false;
    }
    
    // Shuffle for variety
    const shuffled = [...validPatterns].sort(() => Math.random() - 0.5);
    
    for (const p of shuffled) {
        // INFINITE CANVAS: Place pattern at comfortable jump distance, no bounds check
        const jumpX = nextDir * JUMP_COMFORTABLE_X;
        const originX = genState.x + jumpX;
        
        // Calculate origin Y based on comfortable jump from player position
        const firstWallSize = p.walls[0].height;
        const maxHalfHeight = getMaxWallHalfHeight(firstWallSize);
        
        // Start with comfortable jump distance
        let originY = genState.y + JUMP_COMFORTABLE_Y;
        
        // Calculate minimum Y needed to avoid overlap (if any)
        const minOriginY = genState.highestY - PATTERN_GAP - maxHalfHeight;
        
        // Only push up if needed AND if the jump would still be reachable
        if (originY > minOriginY) {
            const pushJumpDy = minOriginY - genState.y;
            if (isJumpReachable(jumpX, pushJumpDy)) {
                originY = minOriginY; // Safe to push up
            }
            // Otherwise keep comfortable Y - patterns are designed to not self-overlap
        }
        
        // Verify final jump is reachable
        const jumpDy = originY - genState.y;
        if (!isJumpReachable(jumpX, jumpDy)) {
            console.log('[generateNextPattern] Jump not reachable for', p.name, 'dx:', jumpX, 'dy:', jumpDy);
            continue;
        }
        
        console.log('[generateNextPattern] Spawning pattern:', p.name, 'at', originX, originY);
        
        // Spawn the pattern - returns actual highest Y
        const actualHighestY = spawnPattern(p, originX, originY);
        
        // Update state - use highestY as reference for next jump to guarantee no overlap
        genState.x = originX + p.exitDx;
        genState.y = actualHighestY; // Player reference at TOP of highest wall, not center
        genState.highestY = actualHighestY;
        genState.lastDir = p.exitDx >= 0 ? 1 : -1;
        
        return true;
    }
    
    console.warn('[generateNextPattern] All patterns failed, using fallback');
    // Fallback: first available pattern
    const fallback = PATTERNS[0];
    const jumpX = nextDir * JUMP_COMFORTABLE_X;
    const originX = genState.x + jumpX;
    const firstWallSize = fallback.walls[0].height;
    const maxHalfHeight = getMaxWallHalfHeight(firstWallSize);
    let originY = genState.y + JUMP_COMFORTABLE_Y;
    const minOriginY = genState.highestY - PATTERN_GAP - maxHalfHeight;
    // Only push up if jump would still be reachable
    if (originY > minOriginY) {
        const pushJumpDy = minOriginY - genState.y;
        if (isJumpReachable(jumpX, pushJumpDy)) {
            originY = minOriginY;
        }
    }
    
    const actualHighestY = spawnPattern(fallback, originX, originY);
    genState.x = originX + fallback.exitDx;
    genState.y = actualHighestY; // Player reference at TOP of highest wall
    genState.highestY = actualHighestY;
    genState.lastDir = fallback.exitDx >= 0 ? 1 : -1;
    
    return true;
}

function generateLevelStep(): void {
    const h = window.innerHeight;
    const spawnLimit = cameraY - h * CONFIG.GENERATE_AHEAD_SCREENS;
    
    // Generate patterns until we're ahead enough
    let safety = 0;
    while (genState.highestY > spawnLimit && walls.length < CONFIG.ACTIVE_WALL_CAP && safety < 10) {
        generateNextPattern();
        safety++;
    }
    
    // Cleanup old walls
    walls = walls.filter(wall => {
        if (wall.position.y > cameraY + h * CONFIG.DELETE_BELOW_SCREENS) {
            Matter.World.remove(world, wall);
            return false;
        }
        return true;
    });
}

// --- GAME LOGIC ---

function resetGame() {
    Matter.World.clear(world, false);

    // Reload patterns from localStorage (picks up editor changes)
    PATTERNS = loadPatterns();

    score = 0;
    cameraX = 0;
    cameraY = 0;
    walls = [];
    wallJumpLockout = 0;
    wallsGenerated = 0;
    wallStates.clear(); // Clear special wall states
    level = 0;
    countedWalls.clear(); // Reset level tracking
    hasLeftGround = false; // Reset ground death tracking
    resetGraceFrames = 30; // Ignore collision events for 30 frames after reset
    
    // Reset camera look-ahead
    smoothLookAheadX = 0;
    smoothLookAheadY = 0;
    
    // Reset monkey animation state
    // Player starts on right side of left wall, facing RIGHT towards the right wall
    monkeyFacingDir = -1;
    isBackflipping = false;
    backflipAngle = 0;
    backflipSpeed = 0;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const floorTopY = h - CONFIG.FLOOR_HEIGHT;

    // Ground
    const ground = Matter.Bodies.rectangle(w / 2, h - CONFIG.FLOOR_HEIGHT / 2, w + 2000, CONFIG.FLOOR_HEIGHT, {
        isStatic: true, label: 'ground', render: { visible: false }
    });
    Matter.World.add(world, ground);

    // INFINITE CANVAS: No left/right boundaries - camera follows player horizontally

    // Initial Walls using X-Y pixel system
    // Place two starter walls - one on left side, one on right side
    const startWallHeight = 420;
    const startWallY = floorTopY - startWallHeight / 2;
    
    // Use actual pixel positions, not column indices
    const leftWallX = w * 0.25;  // 25% from left
    const rightWallX = w * 0.75; // 75% from left (25% from right)
    
    const startWall = createWall(leftWallX, startWallY, startWallHeight, '#FF0055', 'start', 1);
    walls.push(startWall);
    Matter.World.add(world, startWall);

    const secondWallHeight = 420;
    const secondWallY = floorTopY - secondWallHeight / 2;
    const secondWall = createWall(rightWallX, secondWallY, secondWallHeight, '#00AAFF', 'start', 2);
    walls.push(secondWall);
    Matter.World.add(world, secondWall);

    // Initialize generation state
    // Start wall top is the reference for first pattern placement
    const startWallTop = startWallY - startWallHeight / 2;
    
    genState = {
        x: leftWallX,            // Player starts on left wall
        y: startWallTop,         // Reference at TOP of start wall (consistent with pattern exits)
        highestY: startWallTop,  // First pattern must be above start wall top
        lastDir: -1              // Player on right side of wall, next jump goes RIGHT
    };

    // Player spawns on right side of left wall
    const playerSpawnX = startWall.position.x + CONFIG.WALL_WIDTH / 2 + CONFIG.PLAYER_SIZE / 2 - 1;
    const playerSpawnY = floorTopY - CONFIG.PLAYER_SIZE / 2;
    player = createPlayer(playerSpawnX, playerSpawnY);
    Matter.World.add(world, player);

    startY = playerSpawnY;

    canJump = true;
    isWallSliding = false;
    currentWallSide = 0;

    // Pre-gen some walls
    for (let i = 0; i < 3; i++) generateLevelStep();
}

function attachPhysicsEvents() {
    // 1. Update Loop
    Matter.Events.on(engine, 'beforeUpdate', () => {
        if (wallJumpLockout > 0) wallJumpLockout--;

        // Apply continuous thrust along jump angle while holding
        if (isThrusting && gameActive && player) {
            const elapsed = performance.now() - thrustStartMs;
            const maxMs = isFlipThrust ? CONFIG.FLIP_THRUST_MAX_MS : CONFIG.THRUST_MAX_MS;
            const thrustForce = isFlipThrust ? CONFIG.FLIP_THRUST_FORCE : CONFIG.THRUST_FORCE;

            if (elapsed < maxMs) {
                // Apply force along the jump direction
                const forceMag = thrustForce * 0.001 * player.mass;
                Matter.Body.applyForce(player, player.position, {
                    x: thrustDirX * forceMag,
                    y: thrustDirY * forceMag
                });
            }
        }
    });

    // 2. Collision Active (Slide)
    Matter.Events.on(engine, 'collisionActive', (event) => {
        event.pairs.forEach((pair) => {
            const labels = [pair.bodyA.label, pair.bodyB.label];
            let playerBody = null;
            let wallBody = null;

            if (pair.bodyA.label === 'player') { playerBody = pair.bodyA; }
            else if (pair.bodyB.label === 'player') { playerBody = pair.bodyB; }

            if (pair.bodyA.label === 'wall') { wallBody = pair.bodyA; }
            else if (pair.bodyB.label === 'wall') { wallBody = pair.bodyB; }

            if (playerBody && wallBody) {
                isWallSliding = true;
                canJump = true;
                hasJumpedThisPress = false;
                canAirFlip = false;
                hasUsedAirFlip = false;
                
                // Cancel backflip animation and flip thrust on wall cling
                if (isBackflipping) {
                    isBackflipping = false;
                    backflipAngle = 0;
                    backflipSpeed = 0;
                }
                isThrusting = false;
                isFlipThrust = false;

                const isWallOnLeft = wallBody.position.x < playerBody.position.x;
                currentWallSide = isWallOnLeft ? -1 : 1;
                // Face away from the wall (toward open space)
                monkeyFacingDir = isWallOnLeft ? 1 : -1;
                
                // Level tracking: count each unique wall we stick to
                if (!countedWalls.has(wallBody.id)) {
                    countedWalls.add(wallBody.id);
                    level++;
                    // Update level display
                    const levelEl = document.getElementById('level-value');
                    if (levelEl) levelEl.textContent = level.toString();
                }
                
                // Handle special wall types
                const wallState = wallStates.get(wallBody.id);
                if (wallState) {
                    const now = Date.now();
                    
                    // Spent spiked wall = game over (after countdown finishes)
                    if (wallState.type === 'disappearing' && wallState.isSpent) {
                        gameOver();
                        return;
                    }
                    
                    if (wallState.isActive) {
                        // Record first touch time (for disappearing/spiked walls)
                        if (wallState.firstTouchTime === null) {
                            wallState.firstTouchTime = now;
                        }
                        
                        // One-sided danger: instant death if landing on danger side
                        if (wallState.type === 'one-sided-danger') {
                            const playerSide = isWallOnLeft ? 'right' : 'left';
                            if (playerSide === wallState.dangerSide) {
                                gameOver();
                                return;
                            }
                        }
                        
                        // Lightning wall: passive cycle - kill if on wall during danger phase
                        if (wallState.type === 'timed-danger') {
                            const cycleTime = (now - wallState.createdTime) % LIGHTNING_CYCLE_MS;
                            if (cycleTime >= LIGHTNING_SAFE_MS) {
                                gameOver();
                                return;
                            }
                        }
                    }
                }

                // LOCKOUT CHECK
                if (wallJumpLockout <= 0) {
                    Matter.Body.setVelocity(playerBody, {
                        x: 0,
                        y: playerBody.velocity.y > 2 ? 2 : playerBody.velocity.y
                    });
                }
            } else if (labels.includes('ground') && (pair.bodyA === player || pair.bodyB === player)) {
                // Game over if player returns to ground after leaving
                // Skip during reset grace period to avoid false triggers
                if (hasLeftGround && resetGraceFrames <= 0) {
                    gameOver();
                    return;
                }
                canJump = true;
                isWallSliding = false;
                hasJumpedThisPress = false;
                canAirFlip = false;
                hasUsedAirFlip = false;
            }
        });
    });

    // 3. Collision End
    Matter.Events.on(engine, 'collisionEnd', (event) => {
        event.pairs.forEach((pair) => {
            const labels = [pair.bodyA.label, pair.bodyB.label];
            if (labels.includes('player') && labels.includes('wall')) {
                // Only reset if we are actually NOT touching any wall?
                // For simplicity, yes.
                isWallSliding = false;
                currentWallSide = 0;
            }
            // Track when player leaves ground - check body reference to avoid stale pairs from World.clear()
            if (labels.includes('player') && labels.includes('ground') && (pair.bodyA === player || pair.bodyB === player)) {
                hasLeftGround = true;
            }
        });
    });
}

// --- INPUT ---
function handlePressStart() {
    if (!gameActive || !player) return;

    // Check for air flip first (tap while airborne)
    if (!canJump && canAirFlip && !hasUsedAirFlip && !hasJumpedThisPress) {
        performAirFlip();
        return;
    }

    if (!canJump) return;
    if (hasJumpedThisPress) return;

    // Calculate jump direction based on angle
    const angleRad = (CONFIG.JUMP_ANGLE_DEG * Math.PI) / 180;
    const horizontalDir = isWallSliding ? (currentWallSide === -1 ? 1 : -1) : 0;

    // Set thrust direction for continuous force
    thrustDirX = horizontalDir * Math.cos(angleRad);
    thrustDirY = -Math.sin(angleRad);

    // Apply initial velocity at the jump angle
    const initialVelX = horizontalDir * CONFIG.JUMP_INITIAL_SPEED * Math.cos(angleRad);
    const initialVelY = -CONFIG.JUMP_INITIAL_SPEED * Math.sin(angleRad);

    Matter.Body.setVelocity(player, {
        x: initialVelX,
        y: initialVelY
    });

    // Start thrusting
    isThrusting = true;
    isFlipThrust = false;
    thrustStartMs = performance.now();
    hasJumpedThisPress = true;
    canJump = false;

    // Enable air flip and track direction
    if (isWallSliding) {
        wallJumpLockout = 10;
        lastJumpDir = horizontalDir;
        canAirFlip = true;
        hasUsedAirFlip = false;
        monkeyFacingDir = horizontalDir as -1 | 1; // Face jump direction
    }
}

function performAirFlip() {
    if (!player) return;

    // Flip goes in opposite direction
    const flipDir = -lastJumpDir;
    const angleRad = (CONFIG.FLIP_ANGLE_DEG * Math.PI) / 180;

    // Set thrust direction for flip
    thrustDirX = flipDir * Math.cos(angleRad);
    thrustDirY = -Math.sin(angleRad);

    // Apply flip velocity
    const flipVelX = flipDir * CONFIG.FLIP_INITIAL_SPEED * Math.cos(angleRad);
    const flipVelY = -CONFIG.FLIP_INITIAL_SPEED * Math.sin(angleRad);

    Matter.Body.setVelocity(player, {
        x: flipVelX,
        y: flipVelY
    });

    // Start flip thrust
    isThrusting = true;
    isFlipThrust = true;
    thrustStartMs = performance.now();
    hasJumpedThisPress = true;
    hasUsedAirFlip = true;
    canAirFlip = false;
    
    // Trigger backflip animation
    isBackflipping = true;
    backflipAngle = 0;
    backflipSpeed = BACKFLIP_ROTATION_SPEED * flipDir; // Spin in direction of flip
    monkeyFacingDir = flipDir as -1 | 1;
}

function handlePressEnd() {
    // Stop normal jump thrust on release, but let flip thrust continue its full duration
    if (!isFlipThrust) {
        isThrusting = false;
    }
    // Reset so next tap can trigger air flip
    hasJumpedThisPress = false;
}

// Check if an event target is a UI element (button, modal, toggle, etc.)
function isUIElement(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    // Check if the target or any ancestor is a button, settings modal, or has pointer-events
    return !!target.closest('button, .toggle-switch, .settings-panel, #settings-modal.active, #game-over.active, #start-screen, #pause-btn');
}

window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isUIElement(e.target)) return;
    handlePressStart();
});

window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    if (isUIElement(e.target)) return;
    handlePressEnd();
});

window.addEventListener('touchstart', (e) => {
    if (!gameActive || gamePaused) return;
    // Let UI elements handle their own events
    if (isUIElement(e.target)) return;
    e.preventDefault();
    handlePressStart();
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (!gameActive || gamePaused) return;
    if (isUIElement(e.target)) return;
    e.preventDefault();
    handlePressEnd();
}, { passive: false });

window.addEventListener('touchcancel', (e) => {
    if (!gameActive) return;
    if (isUIElement(e.target)) return;
    e.preventDefault();
    isThrusting = false;
}, { passive: false });

// Keyboard controls - Space to jump
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handlePressStart();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handlePressEnd();
    }
});


// --- SPECIAL WALL UPDATE ---
function updateSpecialWalls() {
    const now = Date.now();
    
    wallStates.forEach((state, wallId) => {
        if (!state.isActive) return;
        
        // One-sided danger walls: switch danger side every 4s (always runs, even untouched)
        if (state.type === 'one-sided-danger') {
            const timeSinceSwitch = now - state.lastSwitchTime;
            if (timeSinceSwitch >= DANGER_SWITCH_MS) {
                state.dangerSide = state.dangerSide === 'left' ? 'right' : 'left';
                state.lastSwitchTime = now;
                const wallBody = walls.find(w => w.id === wallId);
                if (wallBody) {
                    (wallBody as any).dangerSide = state.dangerSide;
                }
            }
        }
        
        // Spiked (disappearing) walls: animate on touch, become spent after countdown
        if (state.type === 'disappearing' && state.firstTouchTime !== null && !state.isSpent) {
            const touchDuration = now - state.firstTouchTime;
            if (touchDuration >= DISAPPEAR_DELAY_MS) {
                state.isSpent = true;
            }
        }
        
        // Lightning (timed-danger) walls: passive cycle, no touch-based update needed
        // Visual animation is handled in the sprite renderer
    });
}

// Get the current sprite key for a wall based on its type and state
function getWallSpriteKey(wall: Matter.Body): string {
    const wallType = (wall as any).wallType as WallType;
    const wallState = wallStates.get(wall.id);
    const now = Date.now();
    
    if (wallType === 'disappearing' && wallState) {
        // Spiked wall animation
        if (wallState.isSpent) {
            return 'spike4';
        }
        if (wallState.firstTouchTime !== null) {
            const touchDuration = now - wallState.firstTouchTime;
            const progress = Math.min(touchDuration / DISAPPEAR_DELAY_MS, 1);
            if (progress < 0.33) return 'spike1';
            if (progress < 0.66) return 'spike2';
            return 'spike3';
        }
        return 'spike1'; // Default untouched state
    }
    
    if (wallType === 'timed-danger' && wallState) {
        // Lightning wall passive cycle animation
        const cycleTime = (now - wallState.createdTime) % LIGHTNING_CYCLE_MS;
        
        if (cycleTime < LIGHTNING_SAFE_MS) {
            // Safe phase: animate 1 → 2 → 3 → 3.5
            const safeProgress = cycleTime / LIGHTNING_SAFE_MS;
            if (safeProgress < 0.25) return 'lightning1';
            if (safeProgress < 0.50) return 'lightning2';
            if (safeProgress < 0.75) return 'lightning3';
            return 'lightning3_5';
        } else {
            // Danger phase: animate 1 → 5 → 6 → 7 → 8 → 9 → 10
            const dangerProgress = (cycleTime - LIGHTNING_SAFE_MS) / LIGHTNING_DANGER_MS;
            const dangerFrames = ['lightning1', 'lightning5', 'lightning6', 'lightning7', 'lightning8', 'lightning9', 'lightning10'];
            const frameIndex = Math.min(Math.floor(dangerProgress * dangerFrames.length), dangerFrames.length - 1);
            return dangerFrames[frameIndex];
        }
    }
    
    // Normal wall
    const variant = (wall as any).staticVariant as number;
    return variant === 1 ? 'static1' : 'static2';
}

// Draw all wall sprites (called from afterRender)
function drawWallSprites(ctx: CanvasRenderingContext2D, bounds: Matter.Bounds) {
    if (!wallSpritesLoaded) return;
    
    for (const wall of walls) {
        const screenX = wall.position.x - bounds.min.x;
        const screenY = wall.position.y - bounds.min.y;
        const wallHeight = wall.bounds.max.y - wall.bounds.min.y;
        const wallWidth = CONFIG.WALL_WIDTH;
        
        // Cull off-screen walls
        if (screenY + wallHeight / 2 < -50 || screenY - wallHeight / 2 > window.innerHeight + 50) continue;
        if (screenX + wallWidth / 2 < -50 || screenX - wallWidth / 2 > window.innerWidth + 50) continue;
        
        const spriteKey = getWallSpriteKey(wall);
        const sprite = wallImages.get(spriteKey);
        
        if (sprite) {
            ctx.save();
            const wallType = (wall as any).wallType as WallType;
            
            if (wallType === 'disappearing' || wallType === 'timed-danger') {
                // Special walls: render at each frame's native aspect ratio
                const spriteAspect = sprite.width / sprite.height;
                const renderWidth = wallHeight * spriteAspect;
                ctx.drawImage(
                    sprite,
                    screenX - renderWidth / 2,
                    screenY - wallHeight / 2,
                    renderWidth,
                    wallHeight
                );
            } else {
                // Normal walls: use physics width
                ctx.drawImage(
                    sprite,
                    screenX - wallWidth / 2,
                    screenY - wallHeight / 2,
                    wallWidth,
                    wallHeight
                );
            }
            ctx.restore();
        } else {
            // Fallback colored rectangle
            const wallType = (wall as any).wallType as WallType;
            ctx.fillStyle = getWallColor(wallType);
            ctx.fillRect(screenX - wallWidth / 2, screenY - wallHeight / 2, wallWidth, wallHeight);
        }
    }
}

// --- MAIN LOOP ---
function update() {
    if (!gameActive || !player || gamePaused) {
        requestAnimationFrame(update);
        return;
    }
    
    // Decrement reset grace frames
    if (resetGraceFrames > 0) resetGraceFrames--;
    
    // Update special wall behaviors
    updateSpecialWalls();

    // Camera - smooth follow with target-aware look-ahead
    if (player) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // --- Compute desired look-ahead target (not applied directly) ---
        let targetLookAheadX = 0;
        let targetLookAheadY = 0;
        
        if (isWallSliding) {
            // Find the closest wall above the player (any direction) to bias camera toward it
            const px = player.position.x;
            const py = player.position.y;
            
            // Search ALL walls above for the closest reachable one
            let bestWall: Matter.Body | null = null;
            let bestDist = Infinity;
            for (const wall of walls) {
                const wy = wall.position.y;
                const wx = wall.position.x;
                const dy = py - wy; // positive = wall is above
                if (dy < 50) continue; // Must be meaningfully above
                if (dy > JUMP_MAX_VERTICAL * 3) continue; // Not too far
                // Skip the wall we're currently on (same X position)
                if (Math.abs(wx - px) < CONFIG.WALL_WIDTH) continue;
                const dist = Math.sqrt((wx - px) * (wx - px) + dy * dy);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestWall = wall;
                }
            }
            
            if (bestWall) {
                // Bias camera so the midpoint between player and next wall is roughly centered
                const midX = (bestWall.position.x + px) / 2;
                const midY = (bestWall.position.y + py) / 2;
                targetLookAheadX = midX - px; // Offset from player toward midpoint
                targetLookAheadY = midY - py; // Offset upward toward midpoint
            } else {
                // Fallback: gentle directional bias based on wall side
                const nextJumpDir = currentWallSide === -1 ? 1 : -1;
                targetLookAheadX = nextJumpDir * w * 0.1;
                targetLookAheadY = -h * 0.05;
            }
        } else if (!isBackflipping) {
            // In air (normal jump): mild velocity-based look-ahead
            targetLookAheadX = player.velocity.x * 10;
            targetLookAheadY = 0;
        } else {
            // Backflipping: suppress look-ahead to avoid dizziness
            targetLookAheadX = 0;
            targetLookAheadY = 0;
        }
        
        // --- Smoothly interpolate look-ahead (never jump) ---
        smoothLookAheadX += (targetLookAheadX - smoothLookAheadX) * LOOK_AHEAD_LERP;
        smoothLookAheadY += (targetLookAheadY - smoothLookAheadY) * LOOK_AHEAD_LERP;
        
        // --- Final camera target ---
        // Player at 55% from left (slightly off-center toward look-ahead) and 65% from top
        const targetX = player.position.x - w / 2 + smoothLookAheadX;
        const targetY = player.position.y - h * 0.65 + smoothLookAheadY;
        
        // Smooth camera follow
        cameraX += (targetX - cameraX) * CAMERA_SMOOTH_X;
        
        if (targetY < cameraY) {
            cameraY += (targetY - cameraY) * CAMERA_SMOOTH_Y;
        } else {
            const maxDownY = cameraY + 15;
            const clampedTargetY = Math.min(targetY, maxDownY);
            cameraY += (clampedTargetY - cameraY) * CAMERA_SMOOTH_Y_DOWN;
        }

        // Death - fell too far below camera
        if (player.position.y > cameraY + h + 100) {
            gameOver();
        }

        // Score
        const climbed = Math.max(0, Math.round(startY - player.position.y));
        if (climbed > score) score = climbed;

        // Update HTML level display
        const levelEl = document.getElementById('level-value');
        if (levelEl) levelEl.textContent = level.toString();
    }

    Matter.Render.lookAt(render, {
        min: { x: cameraX, y: cameraY },
        max: { x: cameraX + window.innerWidth, y: cameraY + window.innerHeight }
    });

    generateLevelStep();
    
    // Update monkey animation timing
    const now = performance.now();
    const deltaMs = now - lastFrameTime;
    lastFrameTime = now;
    updateMonkeyAnimation(deltaMs);
    
    // Update backflip rotation - continues until wall contact (handled in collisionActive)
    if (isBackflipping) {
        backflipAngle += backflipSpeed * (deltaMs / 1000);
    }
    
    requestAnimationFrame(update);
}

// --- UI ---
function gameOver() {
    // Prevent multiple game over calls
    if (!gameActive) return;
    
    gameActive = false;
    gamePaused = false;
    engine.timing.timeScale = 1;
    document.getElementById('pause-overlay')?.classList.remove('active');
    stopMusic();
    
    // Play death sound if FX is enabled
    if (settings.fx) {
        deathSound.currentTime = 0;
        deathSound.play().catch(() => {
            // Ignore autoplay errors
        });
    }
    
    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = level.toString();

    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('pause-btn')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.add('active');
}

function initUI() {
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    startBtn?.addEventListener('click', () => {
        document.getElementById('start-screen')?.classList.add('hidden');
        document.getElementById('hud')?.classList.remove('hidden');
        document.getElementById('settings-btn')?.classList.remove('hidden');
        document.getElementById('pause-btn')?.classList.remove('hidden');
        resetGame();
        gameActive = true;
        gamePaused = false;
        playMusic();
    });

    restartBtn?.addEventListener('click', () => {
        document.getElementById('game-over')?.classList.remove('active');
        document.getElementById('hud')?.classList.remove('hidden');
        document.getElementById('pause-btn')?.classList.remove('hidden');
        resetGame();
        gameActive = true;
        gamePaused = false;
        playMusic();
    });

    // --- Settings with localStorage persistence ---
    loadSettings();
    
    // Pause / Resume
    document.getElementById('pause-btn')?.addEventListener('click', () => {
        if (!gameActive || gamePaused) return;
        gamePaused = true;
        engine.timing.timeScale = 0;
        document.getElementById('pause-overlay')?.classList.add('active');
        if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
            (window as any).triggerHaptic('light');
        }
        pauseMusic();
    });

    document.getElementById('resume-btn')?.addEventListener('click', () => {
        gamePaused = false;
        engine.timing.timeScale = 1;
        document.getElementById('pause-overlay')?.classList.remove('active');
        if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
            (window as any).triggerHaptic('light');
        }
        playMusic();
    });
    
    // Apply saved state to toggles on load
    (['toggle-music', 'toggle-fx', 'toggle-haptics'] as const).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const key = el.getAttribute('data-setting');
        if (key && settings[key] === false) {
            el.classList.remove('active');
        }
    });
    
    // Toggle click handlers
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const key = (toggle as HTMLElement).getAttribute('data-setting');
            if (!key) return;
            toggle.classList.toggle('active');
            settings[key] = toggle.classList.contains('active');
            saveSettings();
            // Music toggle - update music state immediately
            if (key === 'music') {
                updateMusicState();
            }
            // Haptic feedback on toggle
            if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
                (window as any).triggerHaptic('light');
            }
        });
    });
    
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.add('active');
        if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
            (window as any).triggerHaptic('light');
        }
    });
    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.remove('active');
        if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
            (window as any).triggerHaptic('light');
        }
    });
}

// --- BOOTSTRAP ---
Matter.Runner.run(Matter.Runner.create(), engine);
Matter.Render.run(render);

// --- BACKGROUND & FLOOR RENDERING ---
function drawBackground(ctx: CanvasRenderingContext2D, bounds: Matter.Bounds) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    const bgSprite = wallImages.get('bg');
    if (!bgSprite) {
        ctx.fillStyle = '#1a3a2a';
        ctx.fillRect(0, 0, w, h);
        return;
    }
    
    // Native image dimensions, adjusted for device pixel ratio
    // Canvas context is scaled by DPR, so divide to get correct visual size
    const dpr = window.devicePixelRatio || 1;
    const bgW = (bgSprite.naturalWidth || bgSprite.width) / dpr;
    const bgH = (bgSprite.naturalHeight || bgSprite.height) / dpr;
    
    // Fixed vertically: center image on screen (bottom-aligned so ground area is covered)
    const drawY = h - bgH;
    
    // Scroll horizontally 1:1 with camera
    // Center the image on the initial camera X, then offset by camera movement
    const cameraLeft = bounds.min.x;
    const drawX = (w - bgW) / 2 - cameraLeft;
    
    // Tile horizontally if the image doesn't cover the full screen width
    // Calculate how many tiles we need on each side
    const startTile = Math.floor((-drawX) / bgW) - 1;
    const endTile = Math.floor((-drawX + w) / bgW) + 1;
    
    for (let t = startTile; t <= endTile; t++) {
        const tileX = drawX + t * bgW;
        // Only draw if tile is on screen
        if (tileX + bgW > 0 && tileX < w) {
            ctx.drawImage(bgSprite, tileX, drawY, bgW, bgH);
        }
    }
    
    // Fill any sky area above the image with a matching color
    if (drawY > 0) {
        ctx.fillStyle = '#87CEEB';
        ctx.fillRect(0, 0, w, drawY);
    }
}

function drawFloor(ctx: CanvasRenderingContext2D, bounds: Matter.Bounds) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Floor world top Y = bottom of playable area
    const floorWorldTopY = h - CONFIG.FLOOR_HEIGHT;
    const floorScreenTopY = floorWorldTopY - bounds.min.y;
    
    if (floorScreenTopY > h + 50) return; // Floor is below viewport
    
    // Grass strip on top (thin green line)
    const grassHeight = 6;
    ctx.fillStyle = '#4a7c2e';
    ctx.fillRect(0, floorScreenTopY, w, grassHeight);
    
    // Top dirt layer (lighter brown)
    const topDirtHeight = 18;
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, floorScreenTopY + grassHeight, w, topDirtHeight);
    
    // Main dirt body (medium brown)
    ctx.fillStyle = '#6B4C12';
    ctx.fillRect(0, floorScreenTopY + grassHeight + topDirtHeight, w, CONFIG.FLOOR_HEIGHT - grassHeight - topDirtHeight);
    
    // Deep dirt below floor (darker brown, fills to bottom of screen)
    const belowY = floorScreenTopY + CONFIG.FLOOR_HEIGHT;
    if (belowY < h) {
        ctx.fillStyle = '#3D2B0A';
        ctx.fillRect(0, belowY, w, h - belowY + 200);
    }
}

// Draw wall sprites, floor, background, and player
Matter.Events.on(render, 'afterRender', () => {
    const ctx = render.context;
    const bounds = render.bounds;
    
    // Draw looping background (behind everything)
    drawBackground(ctx, bounds);
    
    // Draw floor sprite
    drawFloor(ctx, bounds);
    
    // Draw wall sprites
    drawWallSprites(ctx, bounds);
    
    // Draw monkey sprite (must be in afterRender so Matter.js doesn't erase it)
    if (player && gameActive) {
        // Clamp monkey Y so sprite doesn't cut into the dirt/floor
        const floorWorldTopY = window.innerHeight - CONFIG.FLOOR_HEIGHT;
        const spriteRenderHeight = CONFIG.PLAYER_SIZE * 2.5; // Matches RENDER_SCALE in MonkeySprite
        const maxWorldY = floorWorldTopY - spriteRenderHeight / 2 + CONFIG.PLAYER_SIZE / 2;
        const clampedY = Math.min(player.position.y, maxWorldY);
        
        const monkeyState: MonkeyState = {
            x: player.position.x - bounds.min.x,
            y: clampedY - bounds.min.y,
            facingDir: monkeyFacingDir,
            isOnWall: isWallSliding,
            isOnGround: canJump && !isWallSliding,
            isBackflipping: isBackflipping,
            backflipAngle: backflipAngle,
            velocityY: player.velocity.y
        };
        drawMonkey(ctx, monkeyState, CONFIG.PLAYER_SIZE);
    }
});

attachPhysicsEvents();
initUI();
// Start loop but it will pause if !gameActive
update();