// Platform integration wrappers
function submitScore(score: number): void {
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }
}

function triggerHaptic(type: string): void {
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// Mobile detection utility
const isMobile = window.matchMedia('(pointer: coarse)').matches;

// Matter.js imports
import Matter from 'matter-js';
import { AssetManager } from './AssetManager';
import { AudioManager } from './AudioManager';

// Settings class
class Settings {
  private music: boolean = true;
  private fx: boolean = true;
  private haptics: boolean = true;

  constructor() {
    this.loadSettings();
    this.setupUI();
    this.applySettings();
  }

  private loadSettings(): void {
    const saved = localStorage.getItem("unicycleHeroSettings");
    if (saved) {
      const settings = JSON.parse(saved);
      this.music = settings.music ?? true;
      this.fx = settings.fx ?? true;
      this.haptics = settings.haptics ?? true;
    }
  }

  private saveSettings(): void {
    const settings = {
      music: this.music,
      fx: this.fx,
      haptics: this.haptics
    };
    localStorage.setItem("unicycleHeroSettings", JSON.stringify(settings));
  }

  private applySettings(): void {
    AudioManager.setMusicEnabled(this.music);
    AudioManager.setFXEnabled(this.fx);
  }

  private setupUI(): void {
    const musicToggle = document.getElementById("musicToggle") as HTMLElement;
    const fxToggle = document.getElementById("fxToggle") as HTMLElement;
    const hapticsToggle = document.getElementById("hapticsToggle") as HTMLElement;
    const settingsBtn = document.getElementById("settingsBtn") as HTMLElement;
    const settingsModal = document.getElementById("settingsModal") as HTMLElement;

    // Set initial states
    musicToggle.classList.toggle("active", this.music);
    fxToggle.classList.toggle("active", this.fx);
    hapticsToggle.classList.toggle("active", this.haptics);

    // Setup toggle handlers
    musicToggle.addEventListener("click", () => {
      this.music = !this.music;
      musicToggle.classList.toggle("active", this.music);
      AudioManager.setMusicEnabled(this.music);
      this.saveSettings();
    });

    fxToggle.addEventListener("click", () => {
      this.fx = !this.fx;
      fxToggle.classList.toggle("active", this.fx);
      AudioManager.setFXEnabled(this.fx);
      this.saveSettings();
    });

    hapticsToggle.addEventListener("click", () => {
      this.haptics = !this.haptics;
      hapticsToggle.classList.toggle("active", this.haptics);
      this.saveSettings();
    });

    // Settings modal handlers
    settingsBtn.addEventListener("click", () => {
      settingsModal.classList.add("show");
    });

    // Close modal when clicking outside
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove("show");
      }
    });
  }

  getMusicEnabled(): boolean { return this.music; }
  getFXEnabled(): boolean { return this.fx; }
  getHapticsEnabled(): boolean { return this.haptics; }
}

// Physics Engine Setup
const {
  Engine,
  Render,
  Runner,
  World,
  Bodies,
  Body,
  Composite,
  Constraint,
  Mouse,
  MouseConstraint,
  Events
} = Matter;

// Create unicycle avatar function
function createUnicycleAvatar(x: number, y: number): Matter.Composite {
  const unicycle = Composite.create({ label: 'unicycle' });

  // Wheel - high friction, heavy circle with sprite
  const wheel = Bodies.circle(x, y, 25, {
    label: 'wheel',
    friction: 1.0,
    density: 0.02,
    restitution: 0.3,
    render: {
      sprite: {
        texture: 'wheel',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  // Seat post - rectangle rigidly constrained to wheel center
  const seatPost = Bodies.rectangle(x, y - 40, 5, 40, {
    label: 'seatPost',
    density: 0.001,
    render: {
      fillStyle: '#8B4513'
    }
  });

  // Rider ragdoll parts with sprites
  const head = Bodies.circle(x, y - 90, 12, {
    label: 'head',
    density: 0.001,
    render: {
      sprite: {
        texture: 'head',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const torso = Bodies.rectangle(x, y - 65, 20, 35, {
    label: 'torso',
    density: 0.001,
    render: {
      sprite: {
        texture: 'torso',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const upperArmLeft = Bodies.rectangle(x - 15, y - 65, 5, 20, {
    label: 'upperArmLeft',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'arm',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const upperArmRight = Bodies.rectangle(x + 15, y - 65, 5, 20, {
    label: 'upperArmRight',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'arm',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const lowerArmLeft = Bodies.rectangle(x - 15, y - 45, 5, 20, {
    label: 'lowerArmLeft',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'arm',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const lowerArmRight = Bodies.rectangle(x + 15, y - 45, 5, 20, {
    label: 'lowerArmRight',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'arm',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const upperLegLeft = Bodies.rectangle(x - 8, y - 35, 6, 25, {
    label: 'upperLegLeft',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'leg',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const upperLegRight = Bodies.rectangle(x + 8, y - 35, 6, 25, {
    label: 'upperLegRight',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'leg',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const lowerLegLeft = Bodies.rectangle(x - 8, y - 15, 6, 25, {
    label: 'lowerLegLeft',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'leg',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  const lowerLegRight = Bodies.rectangle(x + 8, y - 15, 6, 25, {
    label: 'lowerLegRight',
    density: 0.0005,
    render: {
      sprite: {
        texture: 'leg',
        xScale: 0.5,
        yScale: 0.5
      }
    }
  });

  // Add all bodies to composite
  Composite.add(unicycle, [
    wheel,
    seatPost,
    head,
    torso,
    upperArmLeft,
    upperArmRight,
    lowerArmLeft,
    lowerArmRight,
    upperLegLeft,
    upperLegRight,
    lowerLegLeft,
    lowerLegRight
  ]);

  // Constraints (same as before)
  const seatPostToWheel = Constraint.create({
    bodyA: wheel,
    bodyB: seatPost,
    pointA: { x: 0, y: 0 },
    pointB: { x: 0, y: 20 },
    stiffness: 1,
    length: 0
  });

  const headToTorso = Constraint.create({
    bodyA: head,
    bodyB: torso,
    pointA: { x: 0, y: 12 },
    pointB: { x: 0, y: -17.5 },
    stiffness: 0.8,
    length: 2
  });

  const leftUpperArmToTorso = Constraint.create({
    bodyA: upperArmLeft,
    bodyB: torso,
    pointA: { x: 0, y: -10 },
    pointB: { x: -10, y: -10 },
    stiffness: 0.8,
    length: 2
  });

  const rightUpperArmToTorso = Constraint.create({
    bodyA: upperArmRight,
    bodyB: torso,
    pointA: { x: 0, y: -10 },
    pointB: { x: 10, y: -10 },
    stiffness: 0.8,
    length: 2
  });

  const leftLowerArmToUpperArm = Constraint.create({
    bodyA: lowerArmLeft,
    bodyB: upperArmLeft,
    pointA: { x: 0, y: -10 },
    pointB: { x: 0, y: 10 },
    stiffness: 0.8,
    length: 2
  });

  const rightLowerArmToUpperArm = Constraint.create({
    bodyA: lowerArmRight,
    bodyB: upperArmRight,
    pointA: { x: 0, y: -10 },
    pointB: { x: 0, y: 10 },
    stiffness: 0.8,
    length: 2
  });

  const leftUpperLegToTorso = Constraint.create({
    bodyA: upperLegLeft,
    bodyB: torso,
    pointA: { x: 0, y: -12.5 },
    pointB: { x: -8, y: 17.5 },
    stiffness: 0.8,
    length: 2
  });

  const rightUpperLegToTorso = Constraint.create({
    bodyA: upperLegRight,
    bodyB: torso,
    pointA: { x: 0, y: -12.5 },
    pointB: { x: 8, y: 17.5 },
    stiffness: 0.8,
    length: 2
  });

  const leftLowerLegToUpperLeg = Constraint.create({
    bodyA: lowerLegLeft,
    bodyB: upperLegLeft,
    pointA: { x: 0, y: -12.5 },
    pointB: { x: 0, y: 12.5 },
    stiffness: 0.8,
    length: 2
  });

  const rightLowerLegToUpperLeg = Constraint.create({
    bodyA: lowerLegRight,
    bodyB: upperLegRight,
    pointA: { x: 0, y: -12.5 },
    pointB: { x: 0, y: 12.5 },
    stiffness: 0.8,
    length: 2
  });

  const leftFootToWheel = Constraint.create({
    bodyA: lowerLegLeft,
    bodyB: wheel,
    pointA: { x: 0, y: 12.5 },
    pointB: { x: -10, y: 0 },
    stiffness: 0.9,
    length: 5
  });

  const rightFootToWheel = Constraint.create({
    bodyA: lowerLegRight,
    bodyB: wheel,
    pointA: { x: 0, y: 12.5 },
    pointB: { x: 10, y: 0 },
    stiffness: 0.9,
    length: 5
  });

  const hipToSeatPost = Constraint.create({
    bodyA: torso,
    bodyB: seatPost,
    pointA: { x: 0, y: 17.5 },
    pointB: { x: 0, y: -20 },
    stiffness: 0.1,
    length: 10
  });

  // Add all constraints to composite
  Composite.add(unicycle, [
    seatPostToWheel,
    headToTorso,
    leftUpperArmToTorso,
    rightUpperArmToTorso,
    leftLowerArmToUpperArm,
    rightLowerArmToUpperArm,
    leftUpperLegToTorso,
    rightUpperLegToTorso,
    leftLowerLegToUpperLeg,
    rightLowerLegToUpperLeg,
    leftFootToWheel,
    rightFootToWheel,
    hipToSeatPost
  ]);

  return unicycle;
}

// Game class
class UnicycleHero {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: Settings;
  private isPlaying: boolean = false;
  private score: number = 0;
  
  // Matter.js properties
  private engine!: Matter.Engine;
  private render!: Matter.Render;
  private runner!: Matter.Runner;
  private unicycle!: Matter.Composite;
  private ground!: Matter.Body;

  // Input handling
  private inputLeft: boolean = false;
  private inputRight: boolean = false;
  private mouseX: number = 0;
  private mouseY: number = 0;

  // Camera tracking
  private cameraX: number = 0;
  private cameraY: number = 0;
  private cameraSmooth: number = 0.1; // Lerp factor for smooth camera

  // Custom rendering
  private customRenderer: Matter.Render | null = null;

  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.settings = new Settings();
    
    this.setupCanvas();
    this.initializeGame();
  }

  private async initializeGame(): Promise<void> {
    await AssetManager.loadAssets();
    AudioManager.initialize();
    this.setupPhysics();
    this.setupEventListeners();
    this.gameLoop();
  }

  private setupCanvas(): void {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // Update Matter.js render bounds
    if (this.render) {
      this.render.canvas.width = this.canvas.width;
      this.render.canvas.height = this.canvas.height;
      this.render.bounds.max.x = this.canvas.width;
      this.render.bounds.max.y = this.canvas.height;
    }
  }

  private setupPhysics(): void {
    // Create engine
    this.engine = Engine.create();
    this.engine.gravity.y = 1.5;

    // Create renderer with sprites (wireframes disabled)
    this.render = Render.create({
      canvas: this.canvas,
      engine: this.engine,
      options: {
        width: this.canvas.width,
        height: this.canvas.height,
        wireframes: false, // Use sprite rendering
        background: '#87CEEB',
        showVelocity: false,
        showAngleIndicator: false
      }
    });

    // Set up custom rendering for sprites and constraints
    this.customRenderer = this.render;
    Render.world(this.customRenderer);

    // Create runner
    this.runner = Runner.create();

    // Create ground
    this.ground = Bodies.rectangle(
      this.canvas.width / 2,
      this.canvas.height - 20,
      this.canvas.width,
      40,
      { 
        isStatic: true,
        label: 'ground',
        friction: 1.0,
        render: {
          fillStyle: '#8B4513'
        }
      }
    );

    // Create unicycle avatar
    this.unicycle = createUnicycleAvatar(200, 300);

    // Add bodies to world
    World.add(this.engine.world, [this.ground, this.unicycle]);

    // Run the engine and renderer
    Runner.run(this.runner, this.engine);
    Render.run(this.render);

    console.log("[UnicycleHero] Physics engine initialized");
  }

  private setupEventListeners(): void {
    const playBtn = document.getElementById("playBtn") as HTMLElement;
    const startScreen = document.getElementById("startScreen") as HTMLElement;
    const hud = document.getElementById("hud") as HTMLElement;

    playBtn.addEventListener("click", () => {
      startScreen.classList.add("hidden");
      hud.classList.remove("hidden");
      this.startGame();
    });

    // Keyboard input handling
    window.addEventListener("keydown", (e) => {
      if (e.code === "ArrowLeft") this.inputLeft = true;
      if (e.code === "ArrowRight") this.inputRight = true;
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft") this.inputLeft = false;
      if (e.code === "ArrowRight") this.inputRight = false;
    });

    // Mouse input handling
    this.canvas.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    // Touch input for mobile
    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) {
        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
      }
    });

    // Mobile button controls
    const leftBtn = document.getElementById("leftBtn") as HTMLElement;
    const rightBtn = document.getElementById("rightBtn") as HTMLElement;

    if (leftBtn && rightBtn) {
      // Touch events for mobile buttons
      leftBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.inputLeft = true;
      });
      leftBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.inputLeft = false;
      });
      leftBtn.addEventListener("mousedown", () => this.inputLeft = true);
      leftBtn.addEventListener("mouseup", () => this.inputLeft = false);

      rightBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.inputRight = true;
      });
      rightBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        this.inputRight = false;
      });
      rightBtn.addEventListener("mousedown", () => this.inputRight = true);
      rightBtn.addEventListener("mouseup", () => this.inputRight = false);
    }

    // Add mouse control for testing (but disable during gameplay)
    const mouse = Mouse.create(this.render.canvas);
    const mouseConstraint = MouseConstraint.create(this.engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: {
          visible: false
        }
      }
    });

    World.add(this.engine.world, mouseConstraint);
    this.render.mouse = mouse;
  }

  private startGame(): void {
    this.isPlaying = true;
    this.score = 0;
    console.log("[UnicycleHero] Game started");
    
    // Start circus music
    AudioManager.playCircusMusic();
    
    // Reset unicycle position
    Body.setPosition(this.unicycle.bodies[0], { x: 200, y: 300 });
    Body.setVelocity(this.unicycle.bodies[0], { x: 0, y: 0 });
    Body.setAngularVelocity(this.unicycle.bodies[0], 0);
  }

  private gameLoop(): void {
    if (this.isPlaying) {
      this.update();
    }
    
    // Custom rendering for constraints
    this.renderConstraints();
    
    requestAnimationFrame(() => this.gameLoop());
  }

  private renderConstraints(): void {
    if (!this.customRenderer) return;

    const ctx = this.customRenderer.context;
    const constraints = Composite.allConstraints(this.unicycle);

    ctx.save();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;

    constraints.forEach(constraint => {
      if (constraint.bodyA && constraint.bodyB) {
        const bodyA = constraint.bodyA;
        const bodyB = constraint.bodyB;
        
        // Calculate constraint points
        const pointA = {
          x: bodyA.position.x + (constraint.pointA?.x || 0),
          y: bodyA.position.y + (constraint.pointA?.y || 0)
        };
        
        const pointB = {
          x: bodyB.position.x + (constraint.pointB?.x || 0),
          y: bodyB.position.y + (constraint.pointB?.y || 0)
        };

        // Transform to screen coordinates
        const screenA = this.worldToScreen(pointA.x, pointA.y);
        const screenB = this.worldToScreen(pointB.x, pointB.y);

        // Draw constraint line
        ctx.beginPath();
        ctx.moveTo(screenA.x, screenA.y);
        ctx.lineTo(screenB.x, screenB.y);
        ctx.stroke();

        // Draw joint circles for important constraints
        if (constraint.stiffness < 0.5) { // Soft joints like seat
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(screenA.x, screenA.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(screenB.x, screenB.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    ctx.restore();
  }

  private worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const bounds = this.render.bounds;
    return {
      x: (worldX - bounds.min.x) * (this.canvas.width / (bounds.max.x - bounds.min.x)),
      y: (worldY - bounds.min.y) * (this.canvas.height / (bounds.max.y - bounds.min.y))
    };
  }

  private update(): void {
    if (!this.isPlaying) return;

    // Get body references
    const wheel = Composite.allBodies(this.unicycle).find(body => body.label === 'wheel');
    const torso = Composite.allBodies(this.unicycle).find(body => body.label === 'torso');
    const head = Composite.allBodies(this.unicycle).find(body => body.label === 'head');
    const upperArmLeft = Composite.allBodies(this.unicycle).find(body => body.label === 'upperArmLeft');
    const upperArmRight = Composite.allBodies(this.unicycle).find(body => body.label === 'upperArmRight');

    if (!wheel || !torso || !head) return;

    // Physics Application
    this.applyPhysicsControls(wheel, torso, upperArmLeft, upperArmRight);

    // Camera tracking
    this.updateCamera(torso);

    // Collision detection for fail state
    this.checkCollisions(head, torso);

    // Update score based on wheel position
    this.score = Math.floor(wheel.position.x / 10);
    document.getElementById("score")!.textContent = this.score.toString();
  }

  private applyPhysicsControls(wheel: Matter.Body, torso: Matter.Body, upperArmLeft: Matter.Body | undefined, upperArmRight: Matter.Body | undefined): void {
    // Pedaling: Apply torque to wheel based on input
    const pedalTorque = 0.003;
    if (this.inputLeft) {
      wheel.torque = -pedalTorque;
      AudioManager.playPedalSound(); // Play pedal sound
    }
    if (this.inputRight) {
      wheel.torque = pedalTorque;
      AudioManager.playPedalSound(); // Play pedal sound
    }

    // Balancing: Apply torque to torso for counter-leaning
    const balanceTorque = 0.002;
    if (this.inputLeft) {
      torso.torque = balanceTorque; // Lean right when pedaling left
    }
    if (this.inputRight) {
      torso.torque = -balanceTorque; // Lean left when pedaling right
    }

    // Arm aiming: Point arms toward mouse position
    if (upperArmLeft && upperArmRight) {
      this.pointArmAtMouse(upperArmLeft, this.mouseX, this.mouseY);
      this.pointArmAtMouse(upperArmRight, this.mouseX, this.mouseY);
    }
  }

  private pointArmAtMouse(arm: Matter.Body, mouseX: number, mouseY: number): void {
    // Calculate angle from shoulder to mouse
    const shoulderX = arm.position.x;
    const shoulderY = arm.position.y;
    
    // Convert mouse position to world coordinates (account for camera)
    const worldMouseX = mouseX + this.cameraX - this.canvas.width / 2;
    const worldMouseY = mouseY + this.cameraY - this.canvas.height / 2;
    
    const angle = Math.atan2(worldMouseY - shoulderY, worldMouseX - shoulderX);
    
    // Set arm angle
    Body.setAngle(arm, angle);
    Body.setAngularVelocity(arm, 0); // Stop physics rotation of arms
  }

  private updateCamera(torso: Matter.Body): void {
    // Target position (center on torso)
    const targetX = torso.position.x;
    const targetY = torso.position.y;

    // Linear interpolation for smooth camera movement
    this.cameraX += (targetX - this.cameraX) * this.cameraSmooth;
    this.cameraY += (targetY - this.cameraY) * this.cameraSmooth;

    // Update Matter.js render bounds
    const halfWidth = this.canvas.width / 2;
    const halfHeight = this.canvas.height / 2;
    
    this.render.bounds.min.x = this.cameraX - halfWidth;
    this.render.bounds.min.y = this.cameraY - halfHeight;
    this.render.bounds.max.x = this.cameraX + halfWidth;
    this.render.bounds.max.y = this.cameraY + halfHeight;
  }

  private checkCollisions(head: Matter.Body, torso: Matter.Body): void {
    // Check collision between head and ground
    const headCollisions = Matter.Query.collides(head, [this.ground]);
    // Check collision between torso and ground
    const torsoCollisions = Matter.Query.collides(torso, [this.ground]);
    
    if (headCollisions.length > 0 || torsoCollisions.length > 0) {
      console.log('CRASH');
      this.gameOver();
    }
  }

  private gameOver(): void {
    this.isPlaying = false;
    console.log("[UnicycleHero] Game over - Score:", this.score);
    
    // Show game over screen (could be enhanced)
    const startScreen = document.getElementById("startScreen") as HTMLElement;
    const hud = document.getElementById("hud") as HTMLElement;
    const playBtn = document.getElementById("playBtn") as HTMLElement;
    
    startScreen.classList.remove("hidden");
    hud.classList.add("hidden");
    playBtn.textContent = "Play Again";
    
    // Submit score
    submitScore(this.score);
    
    // Trigger haptic feedback
    triggerHaptic("failure");
  }
}

// Initialize game when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("[UnicycleHero] Initializing game");
  new UnicycleHero();
});
