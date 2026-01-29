import './style.css';
import Matter from 'matter-js';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 0.8,           // Lower gravity gives more reaction time
    JUMP_FORCE_X: 12,       // Strong kick to reach far walls
    JUMP_FORCE_Y: -16,      // Good vertical height
    WALL_WIDTH: 40,
    WALL_HEIGHT: 250,
    WALL_HEIGHT_MIN: 100,
    WALL_HEIGHT_MAX: 250,
    PLAYER_SIZE: 30,
    GENERATE_AHEAD: 1000,   // How far up to generate walls
    DELETE_BELOW: 800,      // When to delete walls below camera
    WALL_PADDING: 60,       // Keep walls away from edge
    WALL_GAP_MIN: 50,      // Minimum vertical gap between walls
    WALL_GAP_MAX: 150,      // Maximum vertical gap between walls
};

// --- 1. SETUP ENGINE ---
const engine = Matter.Engine.create();
engine.gravity.y = CONFIG.GRAVITY;
const world = engine.world;

const render = Matter.Render.create({
    element: document.body,
    engine: engine,
    options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: '#2c3e50',
        hasBounds: true // Crucial for camera tracking
    }
});

// --- 2. GAME STATE ---
let player: Matter.Body;
let walls: Matter.Body[] = [];
let gameActive = false;
let score = 0;
let highestPoint = 0;
let lastWallY = window.innerHeight - 100;
let lastWallX = 80;
let cameraY = 0;

// Wall sliding state
let currentWallSide = 0; // -1 for left wall, 1 for right wall, 0 for none
let isWallSliding = false;
let canJump = false;

// --- 3. GAME OBJECTS ---

// Player Factory
function createPlayer(x: number, y: number) {
    return Matter.Bodies.rectangle(x, y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, {
        label: 'player',
        restitution: 0,      // No bounce
        friction: 0.8,       // High friction for grip
        frictionAir: 0.02,   // Light air resistance
        inertia: Infinity,   // IMPORTANT: Prevents rotation (rolling off the wall)
        render: { fillStyle: '#e74c3c' }
    });
}

// Wall Factory
// Wall Factory
function createWall(x: number, y: number, height: number, isBounce = false) {
    return Matter.Bodies.rectangle(x, y, CONFIG.WALL_WIDTH, height, {
        isStatic: true,
        label: isBounce ? 'bounce-wall' : 'wall',
        restitution: 0, // IMPORTANT: Walls must not be bouncy
        render: { fillStyle: isBounce ? '#3498db' : '#2ecc71' }
    });
}

// Level Generator - Floating Walls with Random X within Screen Halves
function generateLevelStep() {
    // Only generate if we need more walls above the camera
    const spawnLimit = cameraY - CONFIG.GENERATE_AHEAD;

    // Only spawn ONE wall if we need one
    if (lastWallY > spawnLimit) {
        const screenWidth = window.innerWidth;
        const center = screenWidth / 2;

        // 1. Determine which "half" of the screen to spawn on
        // If the last wall was on the Left, spawn this one on the Right (and vice versa)
        const isLastWallLeft = lastWallX < center;

        let minX, maxX;

        if (isLastWallLeft) {
            // Spawn on the RIGHT half
            minX = center + 50;          // 50px buffer from center
            maxX = screenWidth - 80;      // 80px buffer from right edge
        } else {
            // Spawn on the LEFT half
            minX = 80;                    // 80px buffer from left edge
            maxX = center - 50;           // 50px buffer from center
        }

        // 2. Randomize X within that calculated range
        const nextX = Math.random() * (maxX - minX) + minX;

        // 3. Vertical Spacing (Gap)
        const gap = 120 + Math.random() * 40;
        const nextY = lastWallY - gap;

        // 4. Create the Floating Wall Body
        const wallHeight = 200 + Math.random() * 100;
        const wallColor = isLastWallLeft ? '#00aaff' : '#ff0055'; // Blue for Right, Red for Left

        const wall = Matter.Bodies.rectangle(
            nextX,
            nextY,
            CONFIG.WALL_WIDTH,
            wallHeight,
            {
                isStatic: true,
                label: 'wall',
                restitution: 0,  // CRITICAL: Prevents bouncing
                render: { fillStyle: wallColor }
            }
        );

        walls.push(wall);
        Matter.World.add(engine.world, wall);

        // 5. Update state for the next generation cycle
        lastWallY = nextY;
        lastWallX = nextX;
    }

    // Cleanup - remove walls far below camera
    walls = walls.filter(wall => {
        if (wall.position.y > cameraY + CONFIG.DELETE_BELOW) {
            Matter.World.remove(world, wall);
            return false;
        }
        return true;
    });
}

// --- 4. INPUT & PHYSICS LOGIC ---

const handleJump = () => {
    if (!player) return;

    if (canJump) {
        // --- WALL JUMP LOGIC ---
        if (isWallSliding) {
            // Logic: Jump AWAY from the wall.
            // If I am on the Left (-1), I want to kick Left (-1) ??? 
            // WAIT - The user's logic says: "If I am on the Left (-1), I want to kick Left (-1)."
            // BUT standard physics would kick RIGHT if on left wall.
            // Let's re-read the user request carefully.

            // User Request Text:
            // "Logic: Jump AWAY from the wall.
            // If I am on the Left (-1), I want to kick Left (-1).
            // If I am on the Right (1), I want to kick Right (1).
            // jumpX = CONFIG.JUMP_FORCE_X * jumpDirection;"

            // This is contradictory to "Jump AWAY". If on Left wall (-1), kicking Left (-1) pushes you further left (into/through wall or just same side).
            // Typically: Left Wall -> Kick Right (+1). Right Wall -> Kick Left (-1).

            // HOWEVER, the user's snippet explicitly uses `jumpDirection = currentWallSide`.
            // Let's look at how `currentWallSide` is calculated.
            // `const isPlayerOnLeft = playerBody.position.x < wallBody.position.x;`
            // `currentWallSide = isPlayerOnLeft ? -1 : 1;`

            // If Player is Left of Wall (Side -1):
            // We want to jump LEFT (away from wall? No, wall is to the right). 
            // Wait, if player X < wall X, player is on the LEFT of the wall. The wall is to the RIGHT.
            // So jumping LEFT (-1) is jumping AWAY from the wall.
            // YES. This makes sense. The player is on the LEFT side of the wall. To jump away, they must go LEFT.

            // So Jump Direction = Current Wall Side.

            const jumpDirection = currentWallSide;

            Matter.Body.setVelocity(player, {
                x: CONFIG.JUMP_FORCE_X * jumpDirection, // Kick away horizontally
                y: CONFIG.JUMP_FORCE_Y                  // Jump up
            });

            // Unlock the player immediately so they don't get "stuck" for 1 frame
            isWallSliding = false;
        }
        // --- NORMAL JUMP LOGIC (Optional / Start of game) ---
        else {
            Matter.Body.setVelocity(player, {
                x: 0,
                y: CONFIG.JUMP_FORCE_Y
            });
        }

        canJump = false; // Prevent spamming jump
    }
};

// Hook up the listeners
window.addEventListener('mousedown', handleJump);
window.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleJump();
}, { passive: false });

// --- COLLISION HANDLING (Wall Sliding Physics) ---

Matter.Events.on(engine, 'collisionActive', (event) => {
    event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        let playerBody: Matter.Body | null = null;
        let wallBody: Matter.Body | null = null;

        // 1. Identify Player and Wall
        if (bodyA.label === 'player' && bodyB.label === 'wall') {
            playerBody = bodyA;
            wallBody = bodyB;
        } else if (bodyB.label === 'player' && bodyA.label === 'wall') {
            playerBody = bodyB;
            wallBody = bodyA;
        }

        if (playerBody && wallBody) {
            isWallSliding = true;
            canJump = true; // Allow jumping again

            // 2. Determine Wall Side
            // If player X < wall X, player is on the Left (-1)
            const isPlayerOnLeft = playerBody.position.x < wallBody.position.x;
            currentWallSide = isPlayerOnLeft ? -1 : 1;

            // 2. FORCE THE GRIP (Kill X Velocity)
            // Push player slightly INTO the wall to ensure contact remains

            // 3. FORCE THE SLIDE (Cap Y Velocity)
            const slideSpeed = 2;

            Matter.Body.setVelocity(playerBody, {
                x: 0, // Stop horizontal movement so we stick
                y: playerBody.velocity.y > slideSpeed ? slideSpeed : playerBody.velocity.y
            });
        }

        // Ground collision (keep simple)
        if ((bodyA.label === 'player' && bodyB.label === 'ground') ||
            (bodyB.label === 'player' && bodyA.label === 'ground')) {
            canJump = true;
            isWallSliding = false;
            currentWallSide = 0;
        }
    });
});

// Reset state when leaving the wall
Matter.Events.on(engine, 'collisionEnd', (event) => {
    event.pairs.forEach((pair) => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (labels.includes('player') && labels.includes('wall')) {
            isWallSliding = false;
            currentWallSide = 0;
        }
    });
});

// --- 5. GAME LOOP ---

function resetGame() {
    // Clear World
    Matter.World.clear(world, false);
    engine.events = {}; // Nuke events to prevent duplication, then re-add collision

    // Re-add Collision (since we cleared events)
    // Actually, World.clear with keepStatic=false wipes bodies. Events stay on engine.

    score = 0;
    cameraY = 0;
    lastWallY = window.innerHeight - 200;
    lastWallX = 80;
    walls = [];

    // Spawn Ground (floor at bottom)
    const ground = Matter.Bodies.rectangle(window.innerWidth / 2, window.innerHeight - 10, window.innerWidth, 40, {
        isStatic: true, label: 'ground', render: { fillStyle: '#95a5a6' }
    });
    Matter.World.add(world, ground);

    // Spawn starting LEFT wall (player will cling to this)
    const startingWall = createWall(CONFIG.WALL_WIDTH / 2, window.innerHeight - 150, 250);
    walls.push(startingWall);
    Matter.World.add(world, startingWall);

    // Spawn Player on the LEFT wall (resting against it, on the floor)
    const playerX = CONFIG.WALL_WIDTH + CONFIG.PLAYER_SIZE / 2 + 2; // Just to the right of the wall
    const playerY = window.innerHeight - 30 - CONFIG.PLAYER_SIZE / 2; // On the floor
    player = createPlayer(playerX, playerY);
    Matter.World.add(world, player);

    // Set initial state - player can jump immediately
    canJump = true;
    isWallSliding = true;  // Treat initial position as on wall
    currentWallSide = -1;  // On left side (will jump RIGHT)

    // Player is NOT static - they can slide down if they want

    // Force initial walls above
    generateLevelStep();

    console.log('[resetGame] Player spawned on left wall at', playerX, playerY);
}

function update() {
    if (!gameActive) {
        requestAnimationFrame(update);
        return;
    }

    // Camera Follow (Smooth Lerp)
    // Target is player Y - offset (to keep player near bottom 1/3 of screen)
    const targetY = player.position.y - window.innerHeight * 0.6;

    // Only scroll UP (Negative Y), never down
    if (targetY < cameraY) {
        cameraY += (targetY - cameraY) * 0.1;
    }

    // Update Render Bounds (The Camera)
    Matter.Render.lookAt(render, {
        min: { x: 0, y: cameraY },
        max: { x: window.innerWidth, y: cameraY + window.innerHeight }
    });

    // Level Gen
    generateLevelStep();

    // Check Death (Fall below camera)
    if (player.position.y > cameraY + window.innerHeight + 100) {
        console.log("Game Over");
        gameActive = false;
        document.getElementById('score').innerText = "Game Over! Click to Restart";
    } else {
        // Score update (height based)
        const currentHeight = Math.abs(Math.round(player.position.y));
        if (currentHeight > score) score = currentHeight;
        const ui = document.getElementById('score');
        if (ui) ui.innerText = `Height: ${score}`;
    }

    requestAnimationFrame(update);
}

// --- 6. INIT ---
// Hide the dynamically created score (we'll use the HTML one instead)
function initUI() {
    // Connect to existing HTML elements
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const startScreen = document.getElementById('start-screen');
    const hud = document.getElementById('hud');
    const settingsBtn = document.getElementById('settings-btn');
    const gameOverScreen = document.getElementById('game-over');
    const scoreValue = document.getElementById('score-value');
    const finalScore = document.getElementById('final-score');

    // Start button handler
    startBtn?.addEventListener('click', () => {
        console.log('[UI] Start button clicked');
        startScreen?.classList.add('hidden');
        hud?.classList.remove('hidden');
        settingsBtn?.classList.remove('hidden');
        resetGame();
        gameActive = true;
    });

    // Restart button handler
    restartBtn?.addEventListener('click', () => {
        console.log('[UI] Restart button clicked');
        gameOverScreen?.classList.remove('active');
        hud?.classList.remove('hidden');
        settingsBtn?.classList.remove('hidden');
        resetGame();
        gameActive = true;
    });

    // Settings handlers
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.add('active');
    });

    document.getElementById('close-settings')?.addEventListener('click', () => {
        document.getElementById('settings-modal')?.classList.remove('active');
    });

    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('settings-modal')) {
            document.getElementById('settings-modal')?.classList.remove('active');
        }
    });

    // Update score display function
    (window as any).updateScoreUI = (newScore: number) => {
        if (scoreValue) scoreValue.textContent = newScore.toString();
    };

    // Show game over function
    (window as any).showGameOver = (finalScoreValue: number) => {
        if (finalScore) finalScore.textContent = finalScoreValue.toString();
        gameOverScreen?.classList.add('active');
        hud?.classList.add('hidden');
        settingsBtn?.classList.add('hidden');
    };
}

// Override the update function's game over logic
const originalUpdate = update;
function updateWithUI() {
    if (!gameActive) {
        requestAnimationFrame(updateWithUI);
        return;
    }

    // Camera Follow (Smooth Lerp)
    const targetY = player.position.y - window.innerHeight * 0.6;

    // Only scroll UP (Negative Y), never down
    if (targetY < cameraY) {
        cameraY += (targetY - cameraY) * 0.1;
    }

    // Update Render Bounds (The Camera)
    Matter.Render.lookAt(render, {
        min: { x: 0, y: cameraY },
        max: { x: window.innerWidth, y: cameraY + window.innerHeight }
    });

    // Level Gen
    generateLevelStep();



    // Check Death (Fall below camera)
    if (player.position.y > cameraY + window.innerHeight + 100) {
        console.log("Game Over");
        gameActive = false;
        (window as any).showGameOver?.(score);
    } else {
        // Score update (height based)
        const currentHeight = Math.abs(Math.round(player.position.y));
        if (currentHeight > score) {
            score = currentHeight;
            (window as any).updateScoreUI?.(score);
        }
    }

    requestAnimationFrame(updateWithUI);
}

// Initialize
Matter.Runner.run(Matter.Runner.create(), engine);
Matter.Render.run(render);
initUI();

console.log('[WallJumper] Game initialized, waiting for start...');
// Don't start the game automatically - wait for user to click PLAY
updateWithUI();