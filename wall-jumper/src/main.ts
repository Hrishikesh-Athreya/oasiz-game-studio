// Wall Jumper - A vertical climbing game with wall jumping mechanics
// Tap or click to jump between walls, avoid spikes, collect coins!

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Settings {
    music: boolean;
    fx: boolean;
    haptics: boolean;
}

interface Player {
    x: number;
    y: number;
    vx: number;
    vy: number;
    width: number;
    height: number;
    onWall: 'left' | 'right' | null;
    onFloor: boolean;
    isJumping: boolean;
    rotation: number;
    targetRotation: number;
}

interface Spike {
    x: number;
    y: number;
    width: number;
    height: number;
    wall: 'left' | 'right';
}

interface Coin {
    x: number;
    y: number;
    radius: number;
    collected: boolean;
    bobOffset: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
    size: number;
}

type GameState = 'start' | 'playing' | 'gameover';

// ============================================================================
// CONSTANTS
// ============================================================================

const GRAVITY = 0.6;
const JUMP_FORCE_X = 12;
const JUMP_FORCE_Y = -14;
const WALL_WIDTH = 60;
const PLAYER_WIDTH = 30;
const PLAYER_HEIGHT = 40;
const SPIKE_WIDTH = 40;
const SPIKE_HEIGHT = 30;
const COIN_RADIUS = 15;
const SECTION_HEIGHT = 200;
const COINS_PER_SECTION = 2;
const SPIKE_CHANCE = 0.4;
const MIN_SPIKE_GAP = 150;
const FLOOR_HEIGHT = 20;
const COLOR_FLOOR = '#00d4ff';

// Colors
const COLOR_BG_DARK = '#0f0f1a';
const COLOR_BG_GRADIENT_START = '#1a1a2e';
const COLOR_BG_GRADIENT_END = '#16213e';
const COLOR_WALL_LEFT = '#2d3436';
const COLOR_WALL_RIGHT = '#2d3436';
const COLOR_WALL_ACCENT = '#00d4ff';
const COLOR_PLAYER = '#00d4ff';
const COLOR_PLAYER_ACCENT = '#00a8cc';
const COLOR_SPIKE = '#ff4757';
const COLOR_COIN = '#ffd700';
const COLOR_COIN_ACCENT = '#ffaa00';

// ============================================================================
// GAME STATE
// ============================================================================

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let gameState: GameState = 'start';
let score = 0;
let highestY = 0;
let cameraY = 0;
let targetCameraY = 0;

let player: Player;
let spikes: Spike[] = [];
let coins: Coin[] = [];
let particles: Particle[] = [];

let lastSectionY = 0;
let sectionsGenerated = 0;
let difficultyMultiplier = 1;
let floorY = 0; // Y position of the starting floor

let settings: Settings;

let isMobile = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

function init(): void {
    console.log('[init] Starting Wall Jumper');

    canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    ctx = canvas.getContext('2d')!;

    isMobile = window.matchMedia('(pointer: coarse)').matches;

    loadSettings();
    setupEventListeners();
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);

    requestAnimationFrame(gameLoop);
}

function loadSettings(): void {
    const saved = localStorage.getItem('wallJumperSettings');
    settings = saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
    updateSettingsUI();
}

function saveSettings(): void {
    localStorage.setItem('wallJumperSettings', JSON.stringify(settings));
}

function updateSettingsUI(): void {
    const musicToggle = document.getElementById('toggle-music');
    const fxToggle = document.getElementById('toggle-fx');
    const hapticsToggle = document.getElementById('toggle-haptics');

    if (musicToggle) musicToggle.classList.toggle('active', settings.music);
    if (fxToggle) fxToggle.classList.toggle('active', settings.fx);
    if (hapticsToggle) hapticsToggle.classList.toggle('active', settings.haptics);
}

function resizeCanvas(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    console.log('[resizeCanvas] Canvas size:', canvas.width, 'x', canvas.height);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners(): void {
    // Start button
    document.getElementById('start-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        startGame();
    });

    // Restart button
    document.getElementById('restart-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        startGame();
    });

    // Settings button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
        triggerHaptic('light');
        openSettings();
    });

    // Close settings
    document.getElementById('close-settings')?.addEventListener('click', () => {
        triggerHaptic('light');
        closeSettings();
    });

    // Settings modal background click
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('settings-modal')) {
            triggerHaptic('light');
            closeSettings();
        }
    });

    // Toggle switches
    document.getElementById('toggle-music')?.addEventListener('click', () => {
        triggerHaptic('light');
        settings.music = !settings.music;
        saveSettings();
        updateSettingsUI();
    });

    document.getElementById('toggle-fx')?.addEventListener('click', () => {
        triggerHaptic('light');
        settings.fx = !settings.fx;
        saveSettings();
        updateSettingsUI();
    });

    document.getElementById('toggle-haptics')?.addEventListener('click', () => {
        triggerHaptic('light');
        settings.haptics = !settings.haptics;
        saveSettings();
        updateSettingsUI();
    });

    // Jump controls
    canvas.addEventListener('click', handleJump);
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJump();
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            handleJump();
        }
    });
}

function handleJump(): void {
    if (gameState !== 'playing') return;
    if (player.isJumping && !player.onFloor && !player.onWall) return;

    jump();
}

// ============================================================================
// GAME CONTROL
// ============================================================================

function startGame(): void {
    console.log('[startGame] Starting new game');

    gameState = 'playing';
    score = 0;
    highestY = 0;
    cameraY = 0;
    targetCameraY = 0;

    // Set floor position (near bottom of screen)
    floorY = canvas.height - 100;

    // Reset player - start standing on the floor
    player = {
        x: canvas.width / 2 - PLAYER_WIDTH / 2,
        y: floorY - PLAYER_HEIGHT,
        vx: 0,
        vy: 0,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        onWall: null,
        onFloor: true,
        isJumping: false,
        rotation: 0,
        targetRotation: 0
    };

    // Reset world
    spikes = [];
    coins = [];
    particles = [];
    lastSectionY = canvas.height - SECTION_HEIGHT;
    sectionsGenerated = 0;
    difficultyMultiplier = 1;

    // Generate initial sections
    for (let i = 0; i < 10; i++) {
        generateSection();
    }

    // Update UI
    document.getElementById('start-screen')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.remove('active');
    document.getElementById('hud')?.classList.remove('hidden');
    document.getElementById('settings-btn')?.classList.remove('hidden');
    updateScoreDisplay();
}

function gameOver(): void {
    console.log('[gameOver] Game over with score:', score);

    gameState = 'gameover';

    triggerHaptic('error');
    submitScore(score);

    // Update UI
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('settings-btn')?.classList.add('hidden');
    document.getElementById('final-score')!.textContent = score.toString();
    document.getElementById('game-over')?.classList.add('active');

    // Spawn death particles
    for (let i = 0; i < 20; i++) {
        spawnParticle(
            player.x + player.width / 2,
            player.y + player.height / 2,
            COLOR_PLAYER,
            true
        );
    }
}

function openSettings(): void {
    document.getElementById('settings-modal')?.classList.add('active');
}

function closeSettings(): void {
    document.getElementById('settings-modal')?.classList.remove('active');
}

// ============================================================================
// PLAYER MECHANICS
// ============================================================================

function jump(): void {
    console.log('[jump] Player jumping from:', player.onFloor ? 'floor' : player.onWall);

    triggerHaptic('medium');

    player.isJumping = true;
    player.onFloor = false;
    player.vy = JUMP_FORCE_Y;

    // If on floor, jump straight up first time, then go toward a wall
    if (player.onFloor || !player.onWall) {
        // Jump toward right wall initially
        player.vx = JUMP_FORCE_X * 0.8;
        player.onWall = 'left'; // Will switch to right after landing
        player.targetRotation = Math.PI * 2;
    } else if (player.onWall === 'left') {
        player.vx = JUMP_FORCE_X;
        player.targetRotation = Math.PI * 2;
    } else {
        player.vx = -JUMP_FORCE_X;
        player.targetRotation = -Math.PI * 2;
    }

    // Spawn jump particles
    for (let i = 0; i < 5; i++) {
        spawnParticle(
            player.x + player.width / 2,
            player.y + player.height,
            COLOR_WALL_ACCENT,
            false
        );
    }
}

function updatePlayer(): void {
    if (gameState !== 'playing') return;

    // Apply gravity
    player.vy += GRAVITY;

    // Apply velocity
    player.x += player.vx;
    player.y += player.vy;

    // Smooth rotation
    player.rotation += (player.targetRotation - player.rotation) * 0.15;

    // Check wall collisions
    const leftWallEdge = WALL_WIDTH;
    const rightWallEdge = canvas.width - WALL_WIDTH - player.width;

    if (player.x <= leftWallEdge && player.vx < 0) {
        player.x = leftWallEdge;
        player.vx = 0;
        player.vy = Math.min(player.vy, 2); // Slow descent when attached
        player.onWall = 'left';
        player.onFloor = false;
        player.isJumping = false;
        player.targetRotation = 0;
        triggerHaptic('light');
    } else if (player.x >= rightWallEdge && player.vx > 0) {
        player.x = rightWallEdge;
        player.vx = 0;
        player.vy = Math.min(player.vy, 2);
        player.onWall = 'right';
        player.onFloor = false;
        player.isJumping = false;
        player.targetRotation = 0;
        triggerHaptic('light');
    }

    // Update highest point and score
    const worldY = cameraY + (canvas.height - player.y);
    if (worldY > highestY) {
        const heightGain = Math.floor((worldY - highestY) / 10);
        if (heightGain > 0) {
            score += heightGain;
            highestY = worldY;
            updateScoreDisplay();
        }
    }

    // Update camera
    const targetY = player.y - canvas.height * 0.6;
    if (targetY < targetCameraY) {
        targetCameraY = targetY;
    }
    cameraY += (targetCameraY - cameraY) * 0.1;

    // Check floor collision (only active at start before climbing high enough)
    const floorActive = highestY < 300;
    if (floorActive && player.y + player.height >= floorY && player.vy > 0) {
        player.y = floorY - player.height;
        player.vy = 0;
        player.vx = 0;
        player.isJumping = false;
        player.onFloor = true;
        player.onWall = null;
    }

    // Check if player fell below the floor or below screen after climbing
    if (player.y - cameraY > canvas.height + 100) {
        gameOver();
        return;
    }

    // Update difficulty
    difficultyMultiplier = 1 + (highestY / 5000);

    // Generate more sections as player climbs
    while (lastSectionY > cameraY - canvas.height) {
        generateSection();
    }

    // Clean up old objects
    cleanupObjects();

    // Check collisions
    checkCollisions();
}

// ============================================================================
// WORLD GENERATION
// ============================================================================

function generateSection(): void {
    sectionsGenerated++;

    const y = lastSectionY;
    lastSectionY -= SECTION_HEIGHT;

    // Increase spike chance with height
    const adjustedSpikeChance = Math.min(SPIKE_CHANCE + (sectionsGenerated * 0.01), 0.7);

    // Generate spikes
    if (Math.random() < adjustedSpikeChance && sectionsGenerated > 2) {
        const wall = Math.random() < 0.5 ? 'left' : 'right';
        const spikeY = y - SECTION_HEIGHT / 2 + (Math.random() - 0.5) * 80;

        // Check for minimum gap from other spikes
        const tooClose = spikes.some(s => Math.abs(s.y - spikeY) < MIN_SPIKE_GAP);
        if (!tooClose) {
            spikes.push({
                x: wall === 'left' ? WALL_WIDTH : canvas.width - WALL_WIDTH - SPIKE_WIDTH,
                y: spikeY,
                width: SPIKE_WIDTH,
                height: SPIKE_HEIGHT,
                wall
            });
        }
    }

    // Generate coins
    for (let i = 0; i < COINS_PER_SECTION; i++) {
        if (Math.random() < 0.4) {
            const coinX = WALL_WIDTH + 50 + Math.random() * (canvas.width - WALL_WIDTH * 2 - 100);
            const coinY = y - (i + 1) * (SECTION_HEIGHT / (COINS_PER_SECTION + 1));

            coins.push({
                x: coinX,
                y: coinY,
                radius: COIN_RADIUS,
                collected: false,
                bobOffset: Math.random() * Math.PI * 2
            });
        }
    }
}

function cleanupObjects(): void {
    const cleanupY = cameraY + canvas.height + 200;

    spikes = spikes.filter(s => s.y < cleanupY);
    coins = coins.filter(c => c.y < cleanupY && !c.collected);
    particles = particles.filter(p => p.life > 0);
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

function checkCollisions(): void {
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    // Check spike collisions
    for (const spike of spikes) {
        if (rectCollision(px, py, pw, ph, spike.x, spike.y, spike.width, spike.height)) {
            gameOver();
            return;
        }
    }

    // Check coin collisions
    for (const coin of coins) {
        if (coin.collected) continue;

        const cx = coin.x;
        const cy = coin.y;
        const cr = coin.radius;

        // Circle-rect collision
        const closestX = Math.max(px, Math.min(cx, px + pw));
        const closestY = Math.max(py, Math.min(cy, py + ph));
        const distanceX = cx - closestX;
        const distanceY = cy - closestY;
        const distanceSq = distanceX * distanceX + distanceY * distanceY;

        if (distanceSq < cr * cr) {
            collectCoin(coin);
        }
    }
}

function rectCollision(
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number
): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function collectCoin(coin: Coin): void {
    coin.collected = true;
    score += 10;
    updateScoreDisplay();

    triggerHaptic('success');

    // Spawn coin particles
    for (let i = 0; i < 8; i++) {
        spawnParticle(coin.x, coin.y, COLOR_COIN, true);
    }
}

// ============================================================================
// PARTICLES
// ============================================================================

function spawnParticle(x: number, y: number, color: string, explosive: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = explosive ? 3 + Math.random() * 5 : 1 + Math.random() * 2;

    particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (explosive ? 0 : 2),
        life: 1,
        maxLife: 1,
        color,
        size: 3 + Math.random() * 4
    });
}

function updateParticles(): void {
    for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 0.02;
        p.size *= 0.98;
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
    // Clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, COLOR_BG_GRADIENT_START);
    gradient.addColorStop(1, COLOR_BG_GRADIENT_END);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'start') {
        return;
    }

    ctx.save();
    ctx.translate(0, -cameraY);

    // Draw walls
    drawWalls();

    // Draw spikes
    for (const spike of spikes) {
        drawSpike(spike);
    }

    // Draw coins
    const time = Date.now() / 1000;
    for (const coin of coins) {
        if (!coin.collected) {
            drawCoin(coin, time);
        }
    }

    // Draw particles
    drawParticles();

    // Draw player
    if (gameState === 'playing') {
        drawPlayer();
    }

    ctx.restore();
}

function drawWalls(): void {
    const startY = Math.floor(cameraY / 100) * 100 - 100;
    const endY = cameraY + canvas.height + 100;

    // Left wall
    ctx.fillStyle = COLOR_WALL_LEFT;
    ctx.fillRect(0, startY, WALL_WIDTH, endY - startY);

    // Left wall accent line
    ctx.fillStyle = COLOR_WALL_ACCENT;
    ctx.fillRect(WALL_WIDTH - 3, startY, 3, endY - startY);

    // Right wall
    ctx.fillStyle = COLOR_WALL_RIGHT;
    ctx.fillRect(canvas.width - WALL_WIDTH, startY, WALL_WIDTH, endY - startY);

    // Right wall accent line
    ctx.fillStyle = COLOR_WALL_ACCENT;
    ctx.fillRect(canvas.width - WALL_WIDTH, startY, 3, endY - startY);

    // Draw starting floor (only visible when near bottom)
    const floorVisible = floorY > cameraY - 50;
    if (floorVisible) {
        ctx.fillStyle = COLOR_FLOOR;
        ctx.shadowColor = COLOR_FLOOR;
        ctx.shadowBlur = 15;
        ctx.fillRect(WALL_WIDTH, floorY, canvas.width - WALL_WIDTH * 2, FLOOR_HEIGHT);
        ctx.shadowBlur = 0;
    }

    // Draw height markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';

    for (let y = startY; y < endY; y += 200) {
        const height = Math.floor((canvas.height - y + cameraY) / 10);
        if (height > 0 && height % 10 === 0) {
            ctx.fillText(`${height}m`, canvas.width / 2, y);
        }
    }
}

function drawSpike(spike: Spike): void {
    ctx.fillStyle = COLOR_SPIKE;
    ctx.beginPath();

    if (spike.wall === 'left') {
        // Pointing right
        ctx.moveTo(spike.x, spike.y);
        ctx.lineTo(spike.x + spike.width, spike.y + spike.height / 2);
        ctx.lineTo(spike.x, spike.y + spike.height);
    } else {
        // Pointing left
        ctx.moveTo(spike.x + spike.width, spike.y);
        ctx.lineTo(spike.x, spike.y + spike.height / 2);
        ctx.lineTo(spike.x + spike.width, spike.y + spike.height);
    }

    ctx.closePath();
    ctx.fill();

    // Glow effect
    ctx.shadowColor = COLOR_SPIKE;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawCoin(coin: Coin, time: number): void {
    const bobY = Math.sin(time * 3 + coin.bobOffset) * 5;
    const scale = 0.9 + Math.sin(time * 2 + coin.bobOffset) * 0.1;

    ctx.save();
    ctx.translate(coin.x, coin.y + bobY);
    ctx.scale(scale, scale);

    // Outer glow
    ctx.shadowColor = COLOR_COIN;
    ctx.shadowBlur = 20;

    // Coin body
    ctx.beginPath();
    ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_COIN;
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 0, coin.radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_COIN_ACCENT;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawPlayer(): void {
    ctx.save();
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
    ctx.rotate(player.rotation);

    // Glow effect
    ctx.shadowColor = COLOR_PLAYER;
    ctx.shadowBlur = 20;

    // Body
    const gradient = ctx.createLinearGradient(-player.width / 2, -player.height / 2, player.width / 2, player.height / 2);
    gradient.addColorStop(0, COLOR_PLAYER);
    gradient.addColorStop(1, COLOR_PLAYER_ACCENT);
    ctx.fillStyle = gradient;

    // Rounded rectangle
    const r = 8;
    const w = player.width;
    const h = player.height;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();

    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    const eyeSize = 6;
    const eyeY = -5;
    ctx.beginPath();
    ctx.arc(-6, eyeY, eyeSize, 0, Math.PI * 2);
    ctx.arc(6, eyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(-4 + player.vx * 0.2, eyeY, 3, 0, Math.PI * 2);
    ctx.arc(8 + player.vx * 0.2, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawParticles(): void {
    for (const p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateScoreDisplay(): void {
    const scoreEl = document.getElementById('score-value');
    if (scoreEl) {
        scoreEl.textContent = score.toString();
    }
}

// ============================================================================
// PLATFORM INTEGRATION
// ============================================================================

function triggerHaptic(type: string): void {
    if (settings.haptics && typeof (window as any).triggerHaptic === 'function') {
        (window as any).triggerHaptic(type);
    }
}

function submitScore(finalScore: number): void {
    console.log('[submitScore] Submitting score:', finalScore);
    if (typeof (window as any).submitScore === 'function') {
        (window as any).submitScore(finalScore);
    }
}

// ============================================================================
// GAME LOOP
// ============================================================================

function gameLoop(): void {
    updatePlayer();
    updateParticles();
    render();

    requestAnimationFrame(gameLoop);
}

// ============================================================================
// START
// ============================================================================

init();
