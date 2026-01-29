import './style.css';
import Matter from 'matter-js';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 0.8,           // Lower gravity for more "air time"
    JUMP_FORCE_X: 12,       // Stronger push off the wall
    JUMP_FORCE_Y: -18,     // Increased for higher jumps
    WALL_WIDTH: 30,
    WALL_HEIGHT: 300,
    WALL_HEIGHT_MIN: 100,
    WALL_HEIGHT_MAX: 250,   // Reduced max for better spacing
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
let lastWallX = 80; // Track X for floating walls (start on left)
let cameraY = 0;

// Enums for clarity
const STATE = {
    AIR: 'AIR',
    WALL: 'WALL',
    GROUND: 'GROUND'
};
let currentState = STATE.GROUND;
let currentWallSide = 0; // -1 for left face of wall, 1 for right face
let canDoubleJump = false;

// --- 3. GAME OBJECTS ---

// Player Factory
function createPlayer(x: number, y: number) {
    return Matter.Bodies.rectangle(x, y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, {
        friction: 0,
        frictionAir: 0.01,  // Reduced from 0.02 for snappier movement
        restitution: 0,     // No bouncing
        chamfer: { radius: 4 }, // Rounded corners
        render: { fillStyle: '#e74c3c' },
        label: 'player'
    });
}

// Wall Factory
function createWall(x: number, y: number, height: number, isBounce = false) {
    return Matter.Bodies.rectangle(x, y, CONFIG.WALL_WIDTH, height, {
        isStatic: true, // Walls never move
        friction: 1,
        render: { fillStyle: isBounce ? '#3498db' : '#2ecc71' },
        label: isBounce ? 'bounce-wall' : 'wall'
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

function handleInput() {
    if (!gameActive) {
        return; // Don't restart on click, use the buttons
    }

    console.log('[Input] Current state:', currentState, 'Wall side:', currentWallSide);

    if (currentState === STATE.WALL) {
        // KICK OFF WALL
        Matter.Body.setStatic(player, false); // Unfreeze gravity

        // Calculate Launch Vector
        // If on Left wall (-1), launch Right (+1)
        // Launch Upwards (Negative Y)
        const directionX = currentWallSide === -1 ? 1 : -1;

        Matter.Body.setVelocity(player, {
            x: directionX * CONFIG.JUMP_FORCE_X,
            y: CONFIG.JUMP_FORCE_Y
        });

        // Add some spin for style
        Matter.Body.setAngularVelocity(player, directionX * 0.1);

        currentState = STATE.AIR;
        canDoubleJump = true; // Unlock air jump
        console.log('[Input] Kicked off wall, direction:', directionX);

    } else if (currentState === STATE.GROUND) {
        // JUMP FROM GROUND - go toward a wall
        Matter.Body.setStatic(player, false);

        // Jump toward the closer wall or alternate
        const goRight = player.position.x < window.innerWidth / 2;
        const directionX = goRight ? 1 : -1;

        Matter.Body.setVelocity(player, {
            x: directionX * CONFIG.JUMP_FORCE_X,
            y: CONFIG.JUMP_FORCE_Y
        });

        Matter.Body.setAngularVelocity(player, directionX * 0.1);

        currentState = STATE.AIR;
        canDoubleJump = true;
        console.log('[Input] Jumped from ground, direction:', directionX);

    } else if (currentState === STATE.AIR && canDoubleJump) {
        // AIR JUMP (Double Jump)
        // Simply boost up, kill horizontal momentum slightly
        Matter.Body.setVelocity(player, {
            x: player.velocity.x, // Keep momentum
            y: CONFIG.JUMP_FORCE_Y * 0.8 // Slightly weaker jump
        });

        // Spin animation
        Matter.Body.setAngularVelocity(player, player.velocity.x > 0 ? 0.2 : -0.2);

        canDoubleJump = false; // Consume jump
        console.log('[Input] Double jump used');
    }
}

// Event Listeners
window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(); }, { passive: false });

// Collision Handling (The "Stick" Logic)
// --- COLLISION HANDLING ---
Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // 1. Extract the labels so we know what hit what
        const labelA = bodyA.label;
        const labelB = bodyB.label;

        // 2. Check if the PLAYER hit a WALL
        let playerBody: Matter.Body | null = null;
        let wallBody: Matter.Body | null = null;

        // Find which body is which (since they can be in any order)
        if (labelA === 'player' && labelB === 'wall') {
            playerBody = bodyA;
            wallBody = bodyB;
        } else if (labelB === 'player' && labelA === 'wall') {
            playerBody = bodyB;
            wallBody = bodyA;
        }

        // 3. Execute Collision Logic
        if (playerBody && wallBody) {
            // Stop gravity/sliding temporarily
            Matter.Body.setStatic(playerBody, true);

            // Update game state
            currentState = STATE.WALL;
            canDoubleJump = true;

            // Reset rotation
            Matter.Body.setAngle(playerBody, 0);

            // Determine which side of the wall the player hit
            // If player X is less than Wall X, they are on the Left face
            const isPlayerOnLeft = playerBody.position.x < wallBody.position.x;

            const xOffset = (CONFIG.WALL_WIDTH / 2) + (CONFIG.PLAYER_SIZE / 2) + 1;

            // Snap player to the correct face of the wall
            Matter.Body.setPosition(playerBody, {
                x: isPlayerOnLeft
                    ? wallBody.position.x - xOffset  // Stick to Left side
                    : wallBody.position.x + xOffset, // Stick to Right side
                y: playerBody.position.y
            });

            // Set jump direction based on which face we're on
            // Left face (-1) = jump left, Right face (1) = jump right
            currentWallSide = isPlayerOnLeft ? -1 : 1;

            // Haptic feedback
            if (typeof (window as any).triggerHaptic === 'function') {
                (window as any).triggerHaptic('light');
            }

            console.log('[Collision] Stuck to wall at', wallBody.position.x, 'player on', isPlayerOnLeft ? 'LEFT' : 'RIGHT', 'face');
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

    // Set initial state - player is on the ground, touching the left wall
    // We'll treat this as STATE.WALL so first click kicks off
    currentState = STATE.WALL;
    currentWallSide = -1; // On left side (will jump RIGHT)
    canDoubleJump = true;

    // Make player static initially so they don't fall
    Matter.Body.setStatic(player, true);

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