
import './style.css';
import Matter from 'matter-js';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 0.8,
    JUMP_ANGLE_DEG: 65,
    JUMP_INITIAL_SPEED: 12,
    THRUST_FORCE: 1.1,
    THRUST_MAX_MS: 400,
    // Air flip config
    FLIP_ANGLE_DEG: 55,
    FLIP_INITIAL_SPEED: 10,
    FLIP_THRUST_FORCE: 1.1,
    FLIP_THRUST_MAX_MS: 300,
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
let cameraY = 0;
let wallsGenerated = 0;

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

// --- FACTORIES ---

function createPlayer(x: number, y: number) {
    return Matter.Bodies.rectangle(x, y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, {
        label: 'player',
        restitution: 0,
        friction: 0.8,
        frictionAir: 0.02,
        inertia: Infinity,
        render: { fillStyle: '#fff' }
    });
}

function createWall(x: number, y: number, height: number, color: string, patternName?: string, wallIndex?: number) {
    const wall = Matter.Bodies.rectangle(x, y, CONFIG.WALL_WIDTH, height, {
        isStatic: true,
        label: 'wall',
        restitution: 0,
        render: { fillStyle: color }
    });
    // Store debug info
    (wall as any).patternName = patternName || 'start';
    (wall as any).wallIndex = wallIndex ?? 0;
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
        
        const wall = createWall(x, y, height, color, pattern.name, i + 1);
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
    cameraY = 0;
    walls = [];
    wallJumpLockout = 0;
    wallsGenerated = 0;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const floorTopY = h - CONFIG.FLOOR_HEIGHT;

    // Ground
    const ground = Matter.Bodies.rectangle(w / 2, h - CONFIG.FLOOR_HEIGHT / 2, w + 2000, CONFIG.FLOOR_HEIGHT, {
        isStatic: true, label: 'ground', render: { fillStyle: '#333' }
    });
    Matter.World.add(world, ground);

    const boundaryHeight = 200000;
    const boundaryCenterY = -50000;
    const leftBoundary = Matter.Bodies.rectangle(-CONFIG.BOUNDARY_THICKNESS / 2, boundaryCenterY, CONFIG.BOUNDARY_THICKNESS, boundaryHeight, {
        isStatic: true, label: 'boundary', render: { visible: false }
    });
    const rightBoundary = Matter.Bodies.rectangle(w + CONFIG.BOUNDARY_THICKNESS / 2, boundaryCenterY, CONFIG.BOUNDARY_THICKNESS, boundaryHeight, {
        isStatic: true, label: 'boundary', render: { visible: false }
    });
    Matter.World.add(world, [leftBoundary, rightBoundary]);

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
    // Player starts at BOTTOM of left wall (near floor), not at wall center
    const playerStartY = floorTopY - CONFIG.PLAYER_SIZE / 2; // Player's actual Y position
    
    // highestY should be based on player's reachable range, not start wall top
    // Start walls are at different X positions than generated patterns - no overlap concern
    // First pattern should be placed at comfortable jump distance from player
    // JUMP_COMFORTABLE_Y is negative (e.g., -140), so add it to go UP
    const initialHighestY = playerStartY + JUMP_COMFORTABLE_Y; // Where player can comfortably reach
    
    genState = {
        x: leftWallX,            // Player starts on left wall
        y: playerStartY,         // Player's actual position near floor
        highestY: initialHighestY,  // Based on player's reachable range
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

                // LOCKOUT CHECK
                if (wallJumpLockout <= 0) {
                    Matter.Body.setVelocity(playerBody, {
                        x: 0,
                        y: playerBody.velocity.y > 2 ? 2 : playerBody.velocity.y
                    });
                }
            } else if (labels.includes('ground')) {
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
    e.preventDefault();
    handlePressStart();
}, { passive: false });

window.addEventListener('touchend', (e) => {
    e.preventDefault();
    handlePressEnd();
}, { passive: false });

window.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    isThrusting = false;
}, { passive: false });


// --- MAIN LOOP ---
function update() {
    if (!gameActive) {
        requestAnimationFrame(update);
        return;
    }

    // Camera
    if (player) {
        const targetY = player.position.y - window.innerHeight * 0.6;
        if (targetY < cameraY) {
            cameraY += (targetY - cameraY) * 0.1;
        }

        // Death
        if (player.position.y > cameraY + window.innerHeight + 100) {
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
        min: { x: 0, y: cameraY },
        max: { x: window.innerWidth, y: cameraY + window.innerHeight }
    });

    generateLevelStep();

    requestAnimationFrame(update);
}

// --- UI ---
function gameOver() {
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

// Debug: Draw pattern labels on walls
Matter.Events.on(render, 'afterRender', () => {
    const ctx = render.context;
    const bounds = render.bounds;
    
    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    
    for (const wall of walls) {
        const patternName = (wall as any).patternName as string;
        const wallIndex = (wall as any).wallIndex as number;
        
        // Transform world coords to screen coords
        const screenX = wall.position.x - bounds.min.x;
        const screenY = wall.position.y - bounds.min.y;
        
        // Only draw if on screen
        if (screenY > -100 && screenY < window.innerHeight + 100) {
            // Pattern name background
            const label = `${patternName}`;
            const indexLabel = `#${wallIndex}`;
            
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
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