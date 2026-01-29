import './style.css';
import Matter from 'matter-js';

// --- CONFIGURATION ---
const CONFIG = {
    GRAVITY: 1.2,
    JUMP_FORCE_X: 9,
    JUMP_FORCE_Y: -13,
    WALL_WIDTH: 40,
    WALL_HEIGHT_MIN: 100,
    WALL_HEIGHT_MAX: 300,
    PLAYER_SIZE: 30,
    GENERATE_AHEAD: 1000, // How far up to generate walls
    DELETE_BELOW: 800,    // When to delete walls below camera
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
let lastWallY = 0; // Tracks the height of the last generated wall
let cameraY = 0;

// Enums for clarity
const STATE = {
    AIR: 'AIR',
    WALL: 'WALL',
    GROUND: 'GROUND'
};
let currentState = STATE.GROUND;
let currentWallSide = 0; // -1 for Left Wall, 1 for Right Wall
let canDoubleJump = false;

// --- 3. GAME OBJECTS ---

// Player Factory
function createPlayer(x: number, y: number) {
    return Matter.Bodies.rectangle(x, y, CONFIG.PLAYER_SIZE, CONFIG.PLAYER_SIZE, {
        friction: 0,
        frictionAir: 0.02, // Low drag for snappy jumps
        restitution: 0,    // No bouncing
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

// Level Generator (The "Dual-Block-Dodge" Logic adapted for Physics)
function generateLevelStep() {
    const spawnLimit = cameraY - CONFIG.GENERATE_AHEAD; // Remember Y goes DOWN as you go UP in Canvas usually, but Matter.js is standard cartesian? 
    // Actually in Matter.js/Canvas: Y increases DOWNWARDS. 
    // So "Up" is negative Y.

    // While the last wall is below the spawn limit (meaning we need more walls above)
    while (lastWallY > spawnLimit) {
        const nextY = lastWallY - (150 + Math.random() * 50); // Move UP by 150-200px

        // Cone Algorithm: Ensure next wall is reachable
        // We alternate sides roughly, or pick random X within jump distance
        const screenCenter = window.innerWidth / 2;
        const isLeft = Math.random() > 0.5;

        // Spawn mainly on sides to encourage wall jumping
        let nextX;
        if (Math.random() > 0.3) {
            // Side walls
            nextX = isLeft ? 50 : window.innerWidth - 50;
        } else {
            // Middle blocks (harder)
            nextX = screenCenter + (Math.random() * 200 - 100);
        }

        const height = CONFIG.WALL_HEIGHT_MIN + Math.random() * (CONFIG.WALL_HEIGHT_MAX - CONFIG.WALL_HEIGHT_MIN);
        const newWall = createWall(nextX, nextY, height);

        walls.push(newWall);
        Matter.World.add(world, newWall);
        lastWallY = nextY;
    }

    // Cleanup Logic (Dual-Block-Dodge style)
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
Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Identify who is who
        let playerBody = null;
        let otherBody = null;

        if (bodyA.label === 'player') { playerBody = bodyA; otherBody = bodyB; }
        else if (bodyB.label === 'player') { playerBody = bodyB; otherBody = bodyA; }

        if (playerBody && (otherBody.label === 'wall' || otherBody.label === 'bounce-wall')) {
            // THE "CHEAT": Freeze physics immediately
            Matter.Body.setStatic(playerBody, true);
            Matter.Body.setAngle(playerBody, 0); // Reset rotation so he looks flat against wall

            currentState = STATE.WALL;
            canDoubleJump = true; // Reset double jump

            // Determine side
            if (playerBody.position.x < otherBody.position.x) {
                currentWallSide = -1; // Left of wall
                Matter.Body.setPosition(playerBody, { x: otherBody.position.x - CONFIG.WALL_WIDTH / 2 - CONFIG.PLAYER_SIZE / 2, y: playerBody.position.y });
            } else {
                currentWallSide = 1; // Right of wall
                Matter.Body.setPosition(playerBody, { x: otherBody.position.x + CONFIG.WALL_WIDTH / 2 + CONFIG.PLAYER_SIZE / 2, y: playerBody.position.y });
            }
        }

        if (playerBody && otherBody.label === 'ground') {
            currentState = STATE.GROUND;
            canDoubleJump = true;
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
    lastWallY = window.innerHeight - 200; // Start generating walls above this
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