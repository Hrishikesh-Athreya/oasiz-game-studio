
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
}

// Map to track wall states by body id
const wallStates: Map<number, WallState> = new Map();

// Special wall timing constants
const DISAPPEAR_DELAY_MS = 3000;    // 1 second before wall disappears
const DANGER_TIME_MS = 4000;        // 4 seconds on wall = game over
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
const CAMERA_SMOOTH_X = 0.08; // Horizontal follow speed
const CAMERA_SMOOTH_Y = 0.1;  // Vertical follow speed (up)
const CAMERA_SMOOTH_Y_DOWN = 0.05; // Vertical follow speed (down, slower)

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
        render: { fillStyle: actualColor }
    });
    
    // Store debug info
    (wall as any).patternName = patternName || 'start';
    (wall as any).wallIndex = wallIndex ?? 0;
    (wall as any).wallType = wallType;
    (wall as any).dangerSide = dangerSide;
    
    // Register wall state for special types
    if (wallType !== 'normal') {
        wallStates.set(wall.id, {
            type: wallType,
            firstTouchTime: null,
            dangerSide,
            isActive: true,
            opacity: 1,
            lastSwitchTime: Date.now(),
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
        isStatic: true, label: 'ground', render: { fillStyle: '#333' }
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

                const isWallOnLeft = wallBody.position.x < playerBody.position.x;
                currentWallSide = isWallOnLeft ? -1 : 1;
                
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
                if (wallState && wallState.isActive) {
                    const now = Date.now();
                    
                    // Record first touch time
                    if (wallState.firstTouchTime === null) {
                        wallState.firstTouchTime = now;
                    }
                    
                    const touchDuration = now - wallState.firstTouchTime;
                    
                    // One-sided danger: instant death if landing on danger side
                    if (wallState.type === 'one-sided-danger') {
                        const playerSide = isWallOnLeft ? 'right' : 'left'; // Player is on this side of wall
                        if (playerSide === wallState.dangerSide) {
                            gameOver();
                            return;
                        }
                    }
                    
                    // Timed danger: death if on wall for too long
                    if (wallState.type === 'timed-danger' && touchDuration >= DANGER_TIME_MS) {
                        gameOver();
                        return;
                    }
                }

                // LOCKOUT CHECK
                if (wallJumpLockout <= 0) {
                    Matter.Body.setVelocity(playerBody, {
                        x: 0,
                        y: playerBody.velocity.y > 2 ? 2 : playerBody.velocity.y
                    });
                }
            } else if (labels.includes('ground')) {
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
            // Track when player leaves ground
            if (labels.includes('player') && labels.includes('ground')) {
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
    // Stop thrusting immediately on release
    isThrusting = false;
    // Reset so next tap can trigger air flip
    hasJumpedThisPress = false;
}

window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    handlePressStart();
});

window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    handlePressEnd();
});

window.addEventListener('touchstart', (e) => {
    // Only prevent default and handle game input when game is active
    // This allows the start button to receive click events on mobile
    if (!gameActive) return;
    e.preventDefault();
    handlePressStart();
}, { passive: false });

window.addEventListener('touchend', (e) => {
    // Only prevent default when game is active
    if (!gameActive) return;
    e.preventDefault();
    handlePressEnd();
}, { passive: false });

window.addEventListener('touchcancel', (e) => {
    if (!gameActive) return;
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
                // Switch danger side
                state.dangerSide = state.dangerSide === 'left' ? 'right' : 'left';
                state.lastSwitchTime = now;
                
                // Update the wall body's stored dangerSide
                const wallBody = walls.find(w => w.id === wallId);
                if (wallBody) {
                    (wallBody as any).dangerSide = state.dangerSide;
                }
            }
        }
        
        // Skip touch-based effects if wall hasn't been touched
        if (state.firstTouchTime === null) return;
        
        const touchDuration = now - state.firstTouchTime;
        
        // Disappearing walls: fade and remove after delay
        if (state.type === 'disappearing') {
            // Calculate fade progress (0 to 1 over the delay period)
            const fadeProgress = Math.min(touchDuration / DISAPPEAR_DELAY_MS, 1);
            state.opacity = 1 - fadeProgress;
            
            // Find the wall body and update its appearance
            const wallBody = walls.find(w => w.id === wallId);
            if (wallBody) {
                // Update opacity visually
                const baseColor = getWallColor('disappearing');
                const alpha = Math.max(0, state.opacity);
                wallBody.render.fillStyle = `rgba(255, 170, 0, ${alpha})`;
                
                // Remove wall when fully faded
                if (touchDuration >= DISAPPEAR_DELAY_MS) {
                    state.isActive = false;
                    Matter.World.remove(world, wallBody);
                    walls = walls.filter(w => w.id !== wallId);
                    wallStates.delete(wallId);
                }
            }
        }
        
        // Timed danger walls: visual warning as time runs out
        if (state.type === 'timed-danger') {
            const wallBody = walls.find(w => w.id === wallId);
            if (wallBody) {
                // Flash effect as danger approaches
                const progress = touchDuration / DANGER_TIME_MS;
                const flash = Math.sin(progress * Math.PI * 8) * 0.3 + 0.7;
                const r = Math.floor(255 * flash);
                wallBody.render.fillStyle = `rgb(${r}, 0, 0)`;
            }
        }
    });
}

// Draw danger side indicator for one-sided walls (called from render)
function drawOneSidedIndicators(ctx: CanvasRenderingContext2D) {
    walls.forEach(wall => {
        const wallState = wallStates.get(wall.id);
        if (wallState?.type === 'one-sided-danger' && wallState.isActive) {
            const halfWidth = CONFIG.WALL_WIDTH / 2;
            const halfHeight = (wall as any).height ? (wall as any).height / 2 : 100;
            
            // Get actual wall bounds
            const bounds = wall.bounds;
            const wallHeight = bounds.max.y - bounds.min.y;
            
            // Draw danger stripe on the dangerous side
            ctx.save();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
            
            const stripeWidth = 8;
            if (wallState.dangerSide === 'left') {
                // Danger on left side - draw red stripe on left edge
                ctx.fillRect(
                    wall.position.x - halfWidth - cameraX,
                    wall.position.y - wallHeight/2 - cameraY,
                    stripeWidth,
                    wallHeight
                );
            } else {
                // Danger on right side - draw red stripe on right edge
                ctx.fillRect(
                    wall.position.x + halfWidth - stripeWidth - cameraX,
                    wall.position.y - wallHeight/2 - cameraY,
                    stripeWidth,
                    wallHeight
                );
            }
            ctx.restore();
        }
    });
}

// --- MAIN LOOP ---
function update() {
    if (!gameActive) {
        requestAnimationFrame(update);
        return;
    }
    
    // Decrement reset grace frames
    if (resetGraceFrames > 0) resetGraceFrames--;
    
    // Update special wall behaviors
    updateSpecialWalls();

    // Camera - smooth follow on both axes
    if (player) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // Target: center player horizontally, player at 70% from top vertically (show more above)
        const targetX = player.position.x - w / 2;
        const targetY = player.position.y - h * 0.7;
        
        // Smooth horizontal centering (always)
        cameraX += (targetX - cameraX) * CAMERA_SMOOTH_X;
        
        // Smooth vertical follow (faster up, limited down)
        if (targetY < cameraY) {
            // Going up - follow faster
            cameraY += (targetY - cameraY) * CAMERA_SMOOTH_Y;
        } else {
            // Going down - limit to max 20px below current position
            const maxDownY = cameraY + 20;
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

        // Update HTML Score
        const scoreEl = document.getElementById('score-value');
        if (scoreEl) scoreEl.textContent = score.toString();
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
    
    // Update backflip rotation
    if (isBackflipping) {
        backflipAngle += backflipSpeed * (deltaMs / 1000);
        // Complete backflip after full rotation
        if (Math.abs(backflipAngle) >= Math.PI * 2) {
            isBackflipping = false;
            backflipAngle = 0;
            backflipSpeed = 0;
        }
    }
    
    // Draw monkey sprite
    if (player) {
        const ctx = render.context;
        const monkeyState: MonkeyState = {
            x: player.position.x - cameraX,
            y: player.position.y - cameraY,
            facingDir: monkeyFacingDir,
            isOnWall: isWallSliding,
            isOnGround: canJump && !isWallSliding,
            isBackflipping: isBackflipping,
            backflipAngle: backflipAngle,
            velocityY: player.velocity.y
        };
        drawMonkey(ctx, monkeyState, CONFIG.PLAYER_SIZE);
    }

    requestAnimationFrame(update);
}

// --- UI ---
function gameOver() {
    // Prevent multiple game over calls
    if (!gameActive) return;
    
    gameActive = false;
    const finalScoreEl = document.getElementById('final-score');
    if (finalScoreEl) finalScoreEl.textContent = score.toString();

    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.add('active');
}

function initUI() {
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');

    startBtn?.addEventListener('click', () => {
        document.getElementById('start-screen')?.classList.add('hidden');
        document.getElementById('hud')?.classList.remove('hidden');
        document.getElementById('settings-btn')?.classList.remove('hidden');
        resetGame();
        gameActive = true;
    });

    restartBtn?.addEventListener('click', () => {
        document.getElementById('game-over')?.classList.remove('active');
        document.getElementById('hud')?.classList.remove('hidden');
        resetGame();
        gameActive = true;
    });

    // Settings (Simple Toggle)
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.add('active');
    });
    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.remove('active');
    });
}

// --- BOOTSTRAP ---
Matter.Runner.run(Matter.Runner.create(), engine);
Matter.Render.run(render);

// Debug: Draw pattern labels on walls + special wall indicators
Matter.Events.on(render, 'afterRender', () => {
    const ctx = render.context;
    const bounds = render.bounds;
    
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    
    for (const wall of walls) {
        const patternName = (wall as any).patternName as string;
        const wallIndex = (wall as any).wallIndex as number;
        const wallType = (wall as any).wallType as WallType;
        const dangerSide = (wall as any).dangerSide as 'left' | 'right' | undefined;
        
        // Transform world coords to screen coords
        const screenX = wall.position.x - bounds.min.x;
        const screenY = wall.position.y - bounds.min.y;
        const wallHeight = wall.bounds.max.y - wall.bounds.min.y;
        const halfWidth = CONFIG.WALL_WIDTH / 2;
        
        // Only draw if on screen
        if (screenY > -100 && screenY < window.innerHeight + 100) {
            // Draw danger stripe for one-sided walls
            if (wallType === 'one-sided-danger' && dangerSide) {
                const wallState = wallStates.get(wall.id);
                if (wallState?.isActive) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                    const stripeWidth = 10;
                    if (dangerSide === 'left') {
                        ctx.fillRect(screenX - halfWidth, screenY - wallHeight/2, stripeWidth, wallHeight);
                    } else {
                        ctx.fillRect(screenX + halfWidth - stripeWidth, screenY - wallHeight/2, stripeWidth, wallHeight);
                    }
                }
            }
            
            // Pattern name background
            const label = `${patternName}`;
            const indexLabel = `#${wallIndex}`;
            
            // Color-coded background based on wall type
            let bgColor = 'rgba(0,0,0,0.7)';
            if (wallType === 'disappearing') bgColor = 'rgba(255,170,0,0.8)';
            else if (wallType === 'timed-danger') bgColor = 'rgba(255,0,0,0.8)';
            else if (wallType === 'one-sided-danger') bgColor = 'rgba(170,0,255,0.8)';
            
            ctx.fillStyle = bgColor;
            ctx.fillRect(screenX - 35, screenY - 20, 70, 28);
            
            ctx.fillStyle = '#FFD700';
            ctx.fillText(label, screenX, screenY - 8);
            ctx.fillStyle = '#FFF';
            ctx.fillText(indexLabel, screenX, screenY + 5);
        }
    }
    
    ctx.restore();
});

attachPhysicsEvents();
initUI();
// Start loop but it will pause if !gameActive
update();