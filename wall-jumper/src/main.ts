
import './style.css';
import Matter from 'matter-js';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 0.8,
    JUMP_ANGLE_DEG: 65,
    JUMP_INITIAL_SPEED: 14,
    THRUST_FORCE: 1.2,
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

// --- COLUMN SYSTEM (5 columns) ---
const NUM_COLUMNS = 5;
const COLUMN_MARGIN = 0.08; // 8% margin on each side

function getColumnX(col: number): number {
    const w = window.innerWidth;
    const usableWidth = w * (1 - 2 * COLUMN_MARGIN);
    const colWidth = usableWidth / (NUM_COLUMNS - 1);
    return w * COLUMN_MARGIN + col * colWidth;
}

// Wall height variants
type WallSize = 'short' | 'medium' | 'tall';

const WALL_HEIGHTS: Record<WallSize, { min: number; max: number }> = {
    'short': { min: 100, max: 160 },
    'medium': { min: 180, max: 260 },
    'tall': { min: 280, max: 380 },
};

// --- PATTERN SYSTEM ---
type PatternWall = {
    column: number;      // 0-4 absolute column
    relativeY: number;   // Y offset from pattern start (negative = up)
    height: WallSize;
};

type Pattern = {
    name: string;
    walls: PatternWall[];
    entryColumn: number;  // Which column player enters from
    exitColumn: number;   // Which column player exits to
    exitY: number;        // Y offset of exit point (negative)
};

// Hand-crafted patterns - each is guaranteed playable
const PATTERNS: Pattern[] = [
    {
        name: 'zigzag',
        walls: [
            { column: 1, relativeY: 0, height: 'medium' },
            { column: 3, relativeY: -160, height: 'medium' },
            { column: 1, relativeY: -320, height: 'medium' },
        ],
        entryColumn: 1,
        exitColumn: 1,
        exitY: -320,
    },
    {
        name: 'staircase-right',
        walls: [
            { column: 1, relativeY: 0, height: 'short' },
            { column: 2, relativeY: -140, height: 'short' },
            { column: 3, relativeY: -280, height: 'medium' },
        ],
        entryColumn: 1,
        exitColumn: 3,
        exitY: -280,
    },
    {
        name: 'staircase-left',
        walls: [
            { column: 3, relativeY: 0, height: 'short' },
            { column: 2, relativeY: -140, height: 'short' },
            { column: 1, relativeY: -280, height: 'medium' },
        ],
        entryColumn: 3,
        exitColumn: 1,
        exitY: -280,
    },
    {
        name: 'wide-cross',
        walls: [
            { column: 0, relativeY: 0, height: 'tall' },
            { column: 4, relativeY: -180, height: 'tall' },
        ],
        entryColumn: 0,
        exitColumn: 4,
        exitY: -180,
    },
    {
        name: 'center-hop',
        walls: [
            { column: 1, relativeY: 0, height: 'medium' },
            { column: 2, relativeY: -150, height: 'medium' },
            { column: 3, relativeY: -300, height: 'medium' },
        ],
        entryColumn: 1,
        exitColumn: 3,
        exitY: -300,
    },
    {
        name: 'flip-required',
        walls: [
            { column: 1, relativeY: 0, height: 'medium' },
            { column: 1, relativeY: -200, height: 'medium' },
            { column: 3, relativeY: -360, height: 'medium' },
        ],
        entryColumn: 1,
        exitColumn: 3,
        exitY: -360,
    },
    {
        name: 'simple-alternate',
        walls: [
            { column: 1, relativeY: 0, height: 'medium' },
            { column: 3, relativeY: -160, height: 'medium' },
        ],
        entryColumn: 1,
        exitColumn: 3,
        exitY: -160,
    },
    {
        name: 'simple-alternate-rev',
        walls: [
            { column: 3, relativeY: 0, height: 'medium' },
            { column: 1, relativeY: -160, height: 'medium' },
        ],
        entryColumn: 3,
        exitColumn: 1,
        exitY: -160,
    },
];

// Chunk: contains 2 patterns
type Chunk = {
    pattern1: Pattern;
    pattern2: Pattern;
    baseY: number;
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
let currentColumn = 1;  // Current column player is expected to be at
let currentY = 0;       // Current Y position for generation
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

function createWall(x: number, y: number, height: number, color: string) {
    return Matter.Bodies.rectangle(x, y, CONFIG.WALL_WIDTH, height, {
        isStatic: true,
        label: 'wall',
        restitution: 0,
        render: { fillStyle: color }
    });
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function getWallHeight(size: WallSize): number {
    const range = WALL_HEIGHTS[size];
    return range.min + Math.random() * (range.max - range.min);
}

// --- LEVEL GENERATION (Chunk-Based) ---

const MAX_COLUMN_JUMP = 2; // Can jump ±2 columns

function pickRandomPattern(): Pattern {
    return PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
}

function mirrorPattern(pattern: Pattern): Pattern {
    return {
        ...pattern,
        name: pattern.name + '-mirrored',
        walls: pattern.walls.map(w => ({
            ...w,
            column: (NUM_COLUMNS - 1) - w.column,
        })),
        entryColumn: (NUM_COLUMNS - 1) - pattern.entryColumn,
        exitColumn: (NUM_COLUMNS - 1) - pattern.exitColumn,
    };
}

function pickPatternForEntry(entryCol: number): Pattern {
    // Find patterns that can be reached from entryCol
    const candidates: Pattern[] = [];
    
    for (const p of PATTERNS) {
        // Check if pattern entry is reachable
        if (Math.abs(p.entryColumn - entryCol) <= MAX_COLUMN_JUMP) {
            candidates.push(p);
        }
        // Also check mirrored version
        const mirrored = mirrorPattern(p);
        if (Math.abs(mirrored.entryColumn - entryCol) <= MAX_COLUMN_JUMP) {
            candidates.push(mirrored);
        }
    }
    
    if (candidates.length === 0) {
        // Fallback: use simple-alternate which works from any position
        return PATTERNS.find(p => p.name === 'simple-alternate') || PATTERNS[0];
    }
    
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function spawnPattern(pattern: Pattern, baseY: number): void {
    const colors = ['#FF0055', '#00AAFF', '#55FF00', '#FFCC00'];
    
    for (const wallDef of pattern.walls) {
        const x = getColumnX(wallDef.column);
        const y = baseY + wallDef.relativeY;
        const height = getWallHeight(wallDef.height);
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        const wall = createWall(x, y, height, color);
        walls.push(wall);
        Matter.World.add(world, wall);
        wallsGenerated++;
    }
}

function generateChunk(): void {
    // Pattern 1
    const pattern1 = pickPatternForEntry(currentColumn);
    spawnPattern(pattern1, currentY);
    
    // Update position after pattern 1
    const exitY1 = currentY + pattern1.exitY;
    const exitCol1 = pattern1.exitColumn;
    
    // Transition gap (150px between patterns)
    const transitionGap = 150;
    const pattern2BaseY = exitY1 - transitionGap;
    
    // Pattern 2
    const pattern2 = pickPatternForEntry(exitCol1);
    spawnPattern(pattern2, pattern2BaseY);
    
    // Update global state for next chunk
    currentColumn = pattern2.exitColumn;
    currentY = pattern2BaseY + pattern2.exitY - transitionGap;
}

function generateLevelStep() {
    const h = window.innerHeight;
    const spawnLimit = cameraY - h * CONFIG.GENERATE_AHEAD_SCREENS;
    
    // Generate chunks until we're ahead enough
    while (currentY > spawnLimit && walls.length < CONFIG.ACTIVE_WALL_CAP) {
        generateChunk();
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

    // Initial Walls using column system
    const startWallHeight = 420;
    const startWallY = floorTopY - startWallHeight / 2;
    const startWall = createWall(getColumnX(1), startWallY, startWallHeight, '#FF0055');
    walls.push(startWall);
    Matter.World.add(world, startWall);

    const secondWallHeight = 420;
    const secondWallY = floorTopY - secondWallHeight / 2;
    const secondWall = createWall(getColumnX(3), secondWallY, secondWallHeight, '#00AAFF');
    walls.push(secondWall);
    Matter.World.add(world, secondWall);

    // Initialize chunk generation state
    currentColumn = 1;  // Start from left column
    currentY = startWallY - startWallHeight / 2 - 100;  // Start generating above initial walls

    // Player
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

attachPhysicsEvents();
initUI();
// Start loop but it will pause if !gameActive
update();