// Pattern Editor for Wall Jumper
// Drag-and-drop visual editor for pattern wall positions

type WallSize = 'short' | 'medium' | 'tall';

type PatternWall = {
    dx: number;
    dy: number;
    height: WallSize;
};

type Pattern = {
    name: string;
    walls: PatternWall[];
    exitDx: number;
    exitDy: number;
    firstJumpDir: -1 | 1;
};

const WALL_HEIGHTS: Record<WallSize, number> = {
    'short': 130,
    'medium': 220,
    'tall': 330,
};

// Vertical spacing between walls within a pattern
// Medium walls are ~220px, so 280px spacing gives ~60px clearance
const WALL_VERTICAL_SPACING = 280;

// Default patterns with MEDIUM walls and proper spacing
const DEFAULT_PATTERNS: Pattern[] = [
    { name: 'stair-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 400, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
    ], exitDx: 400, exitDy: -WALL_VERTICAL_SPACING * 2, firstJumpDir: 1 },
    
    { name: 'stair-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -400, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
    ], exitDx: -400, exitDy: -WALL_VERTICAL_SPACING * 2, firstJumpDir: -1 },
    
    { name: 'zigzag-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 220, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 40, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: 260, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: 260, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: 1 },
    
    { name: 'zigzag-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -220, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -40, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: -260, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: -260, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: -1 },
    
    { name: 'step-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
    ], exitDx: 200, exitDy: -WALL_VERTICAL_SPACING, firstJumpDir: 1 },
    
    { name: 'step-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -200, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
    ], exitDx: -200, exitDy: -WALL_VERTICAL_SPACING, firstJumpDir: -1 },
    
    { name: 'long-stair-right', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: 180, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: 360, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: 540, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: 540, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: 1 },
    
    { name: 'long-stair-left', walls: [
        { dx: 0, dy: 0, height: 'medium' },
        { dx: -180, dy: -WALL_VERTICAL_SPACING, height: 'medium' },
        { dx: -360, dy: -WALL_VERTICAL_SPACING * 2, height: 'medium' },
        { dx: -540, dy: -WALL_VERTICAL_SPACING * 3, height: 'medium' },
    ], exitDx: -540, exitDy: -WALL_VERTICAL_SPACING * 3, firstJumpDir: -1 },
];

// State
let patterns: Pattern[] = [];
let selectedPatternIndex = 0;
let selectedWallIndex = -1;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Infinite canvas state - pan and zoom
let panX = 0;  // Canvas pan offset X
let panY = 0;  // Canvas pan offset Y
let zoom = 1;  // Zoom level
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// Canvas
const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// DOM elements
const patternListEl = document.getElementById('pattern-list')!;
const patternNameInput = document.getElementById('pattern-name') as HTMLInputElement;
const wallListEl = document.getElementById('wall-list')!;
const wallCountEl = document.getElementById('wall-count')!;
const codeOutputEl = document.getElementById('code-output')!;
const canvasInfoEl = document.getElementById('canvas-info')!;
const canvasTitleEl = document.getElementById('canvas-title')!;

// Load patterns from localStorage or use defaults
function loadPatterns(): Pattern[] {
    const saved = localStorage.getItem('wallJumperPatterns');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return JSON.parse(JSON.stringify(DEFAULT_PATTERNS));
        }
    }
    return JSON.parse(JSON.stringify(DEFAULT_PATTERNS));
}

// Save patterns to localStorage
function savePatterns(): void {
    localStorage.setItem('wallJumperPatterns', JSON.stringify(patterns));
    console.log('[Editor] Patterns saved to localStorage');
}

// Get current pattern
function currentPattern(): Pattern | null {
    return patterns[selectedPatternIndex] || null;
}

// Get current wall
function currentWall(): PatternWall | null {
    const p = currentPattern();
    if (!p || selectedWallIndex < 0) return null;
    return p.walls[selectedWallIndex] || null;
}

// Render pattern list
function renderPatternList(): void {
    patternListEl.innerHTML = patterns.map((p, i) => `
        <div class="pattern-item ${i === selectedPatternIndex ? 'selected' : ''}" data-index="${i}">
            ${p.name} (${p.walls.length} walls)
        </div>
    `).join('');
    
    patternListEl.querySelectorAll('.pattern-item').forEach(el => {
        el.addEventListener('click', () => {
            selectedPatternIndex = parseInt(el.getAttribute('data-index')!);
            selectedWallIndex = 0;
            centerOnPattern();
            updateUI();
        });
    });
}

// Render wall list
function renderWallList(): void {
    const p = currentPattern();
    if (!p) {
        wallListEl.innerHTML = '<div style="color: #666; font-size: 12px;">No pattern selected</div>';
        wallCountEl.textContent = '(0)';
        return;
    }
    
    wallCountEl.textContent = `(${p.walls.length})`;
    
    wallListEl.innerHTML = p.walls.map((w, i) => `
        <div class="wall-item ${i === selectedWallIndex ? 'selected' : ''}" data-index="${i}">
            <div class="wall-header">
                <span class="wall-label">Wall ${i + 1}</span>
            </div>
            <div class="wall-controls">
                <div class="control-group">
                    <label>X (dx)</label>
                    <input type="number" class="wall-dx" data-index="${i}" value="${w.dx}" step="10">
                </div>
                <div class="control-group">
                    <label>Y (dy)</label>
                    <input type="number" class="wall-dy" data-index="${i}" value="${w.dy}" step="10">
                </div>
                <div class="control-group">
                    <label>Height</label>
                    <select class="wall-height" data-index="${i}">
                        <option value="short" ${w.height === 'short' ? 'selected' : ''}>Short</option>
                        <option value="medium" ${w.height === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="tall" ${w.height === 'tall' ? 'selected' : ''}>Tall</option>
                    </select>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners
    wallListEl.querySelectorAll('.wall-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'SELECT') {
                selectedWallIndex = parseInt(el.getAttribute('data-index')!);
                updateUI();
            }
        });
    });
    
    wallListEl.querySelectorAll('.wall-dx').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-index')!);
            const val = parseInt((e.target as HTMLInputElement).value);
            if (!isNaN(val) && p.walls[idx]) {
                p.walls[idx].dx = val;
                updateExitPoint();
                renderCanvas();
                updateCodeOutput();
            }
        });
    });
    
    wallListEl.querySelectorAll('.wall-dy').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-index')!);
            const val = parseInt((e.target as HTMLInputElement).value);
            if (!isNaN(val) && p.walls[idx]) {
                p.walls[idx].dy = val;
                updateExitPoint();
                renderCanvas();
                updateCodeOutput();
            }
        });
    });
    
    wallListEl.querySelectorAll('.wall-height').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt((e.target as HTMLSelectElement).getAttribute('data-index')!);
            const val = (e.target as HTMLSelectElement).value as WallSize;
            if (p.walls[idx]) {
                p.walls[idx].height = val;
                renderCanvas();
                updateCodeOutput();
            }
        });
    });
}

// Update exit point to last wall position
function updateExitPoint(): void {
    const p = currentPattern();
    if (!p || p.walls.length === 0) return;
    
    const lastWall = p.walls[p.walls.length - 1];
    p.exitDx = lastWall.dx;
    p.exitDy = lastWall.dy;
    
    // Update firstJumpDir based on first wall's dx direction
    if (p.walls.length > 1) {
        p.firstJumpDir = p.walls[1].dx > p.walls[0].dx ? 1 : -1;
    } else {
        p.firstJumpDir = p.walls[0].dx >= 0 ? 1 : -1;
    }
}

// Update code output
function updateCodeOutput(): void {
    const p = currentPattern();
    if (!p) {
        codeOutputEl.textContent = '// No pattern selected';
        return;
    }
    
    const wallsCode = p.walls.map(w => 
        `        { dx: ${w.dx}, dy: ${w.dy}, height: '${w.height}' },`
    ).join('\n');
    
    codeOutputEl.textContent = `{ name: '${p.name}', walls: [
${wallsCode}
    ], exitDx: ${p.exitDx}, exitDy: ${p.exitDy}, firstJumpDir: ${p.firstJumpDir} },`;
}

// Update all UI
function updateUI(): void {
    renderPatternList();
    renderWallList();
    renderCanvas();
    updateCodeOutput();
    
    const p = currentPattern();
    if (p) {
        patternNameInput.value = p.name;
        canvasTitleEl.textContent = `Pattern: ${p.name}`;
    }
}

// Convert screen coordinates to world coordinates
function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    return {
        x: (screenX - centerX - panX) / zoom,
        y: (screenY - centerY - panY) / zoom
    };
}

// Convert world coordinates to screen coordinates
function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    return {
        x: centerX + panX + worldX * zoom,
        y: centerY + panY + worldY * zoom
    };
}

// Center view on pattern
function centerOnPattern(): void {
    const p = currentPattern();
    if (!p || p.walls.length === 0) {
        panX = 0;
        panY = 0;
        return;
    }
    
    // Find pattern bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const wall of p.walls) {
        minX = Math.min(minX, wall.dx);
        maxX = Math.max(maxX, wall.dx);
        minY = Math.min(minY, wall.dy);
        maxY = Math.max(maxY, wall.dy);
    }
    
    // Center on pattern midpoint
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    panX = -midX * zoom;
    panY = -midY * zoom;
}

// Canvas rendering
function renderCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    
    // Draw infinite grid (adjusted for pan and zoom)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const gridSize = 50 * zoom;
    const offsetX = (width / 2 + panX) % gridSize;
    const offsetY = (height / 2 + panY) % gridSize;
    
    // Vertical grid lines
    for (let x = offsetX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = offsetY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Draw origin crosshair at (0,0) in world space
    const origin = worldToScreen(0, 0);
    ctx.strokeStyle = '#FFCC00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origin.x - 20 * zoom, origin.y);
    ctx.lineTo(origin.x + 20 * zoom, origin.y);
    ctx.moveTo(origin.x, origin.y - 20 * zoom);
    ctx.lineTo(origin.x, origin.y + 20 * zoom);
    ctx.stroke();
    
    ctx.fillStyle = '#FFCC00';
    ctx.font = `${12 * zoom}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Origin (0,0)', origin.x + 25 * zoom, origin.y + 5);
    
    const p = currentPattern();
    if (!p) return;
    
    const wallWidth = 30 * zoom;
    
    // Draw jump connections first (behind walls)
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([5 * zoom, 5 * zoom]);
    for (let i = 0; i < p.walls.length - 1; i++) {
        const w1 = p.walls[i];
        const w2 = p.walls[i + 1];
        const p1 = worldToScreen(w1.dx, w1.dy);
        const p2 = worldToScreen(w2.dx, w2.dy);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // Draw walls
    p.walls.forEach((wall, idx) => {
        const pos = worldToScreen(wall.dx, wall.dy);
        const wallHeight = WALL_HEIGHTS[wall.height] * zoom;
        
        // Wall color
        const isSelected = idx === selectedWallIndex;
        const isFirst = idx === 0;
        const isLast = idx === p.walls.length - 1;
        
        if (isSelected) {
            ctx.fillStyle = '#55FF00';
        } else if (isFirst) {
            ctx.fillStyle = '#FFCC00';
        } else if (isLast) {
            ctx.fillStyle = '#00AAFF';
        } else {
            ctx.fillStyle = '#FF0055';
        }
        
        // Draw wall
        ctx.fillRect(pos.x - wallWidth / 2, pos.y - wallHeight / 2, wallWidth, wallHeight);
        
        // Wall label
        ctx.fillStyle = '#000';
        ctx.font = `bold ${12 * zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${idx + 1}`, pos.x, pos.y + 4 * zoom);
        
        // Position label
        ctx.fillStyle = '#fff';
        ctx.font = `${10 * zoom}px sans-serif`;
        ctx.fillText(`(${wall.dx}, ${wall.dy})`, pos.x, pos.y + wallHeight / 2 + 15 * zoom);
    });
    
    // Draw exit marker
    if (p.walls.length > 0) {
        const lastWall = p.walls[p.walls.length - 1];
        const exitPos = worldToScreen(p.exitDx, p.exitDy);
        const markerOffset = (WALL_HEIGHTS[lastWall.height] / 2 + 20) * zoom;
        
        ctx.fillStyle = '#00AAFF';
        ctx.beginPath();
        ctx.arc(exitPos.x, exitPos.y - markerOffset, 8 * zoom, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = `${10 * zoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('EXIT', exitPos.x, exitPos.y - markerOffset - 15 * zoom);
    }
    
    // Draw zoom level indicator
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Zoom: ${Math.round(zoom * 100)}%`, width - 10, height - 10);
}

// Get wall at canvas position (in screen coordinates)
function getWallAtPosition(canvasX: number, canvasY: number): number {
    const p = currentPattern();
    if (!p) return -1;
    
    const wallWidth = 30 * zoom;
    const hitPadding = 10 * zoom;
    
    // Check walls in reverse order (top walls first)
    for (let i = p.walls.length - 1; i >= 0; i--) {
        const wall = p.walls[i];
        const pos = worldToScreen(wall.dx, wall.dy);
        const wallHeight = WALL_HEIGHTS[wall.height] * zoom;
        
        if (canvasX >= pos.x - wallWidth / 2 - hitPadding && canvasX <= pos.x + wallWidth / 2 + hitPadding &&
            canvasY >= pos.y - wallHeight / 2 - hitPadding && canvasY <= pos.y + wallHeight / 2 + hitPadding) {
            return i;
        }
    }
    
    return -1;
}

// Canvas mouse events
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Middle mouse button or space+click for panning
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning = true;
        panStartX = x - panX;
        panStartY = y - panY;
        canvas.style.cursor = 'move';
        e.preventDefault();
        return;
    }
    
    const wallIdx = getWallAtPosition(x, y);
    if (wallIdx >= 0) {
        selectedWallIndex = wallIdx;
        isDragging = true;
        
        const p = currentPattern()!;
        const wall = p.walls[wallIdx];
        const screenPos = worldToScreen(wall.dx, wall.dy);
        
        dragOffsetX = x - screenPos.x;
        dragOffsetY = y - screenPos.y;
        
        canvas.style.cursor = 'grabbing';
        updateUI();
    } else {
        // Click on empty space - start panning
        isPanning = true;
        panStartX = x - panX;
        panStartY = y - panY;
        canvas.style.cursor = 'move';
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isPanning) {
        panX = x - panStartX;
        panY = y - panStartY;
        renderCanvas();
        canvasInfoEl.textContent = `Pan: (${Math.round(panX)}, ${Math.round(panY)})`;
        return;
    }
    
    if (isDragging && selectedWallIndex >= 0) {
        const p = currentPattern();
        if (!p) return;
        
        // Convert screen position to world position
        const worldPos = screenToWorld(x - dragOffsetX, y - dragOffsetY);
        
        // Snap to 10px grid
        const newDx = Math.round(worldPos.x / 10) * 10;
        const newDy = Math.round(worldPos.y / 10) * 10;
        
        p.walls[selectedWallIndex].dx = newDx;
        p.walls[selectedWallIndex].dy = newDy;
        
        updateExitPoint();
        renderWallList();
        renderCanvas();
        updateCodeOutput();
        
        canvasInfoEl.textContent = `Wall ${selectedWallIndex + 1}: dx=${newDx}, dy=${newDy}`;
    } else {
        const wallIdx = getWallAtPosition(x, y);
        canvas.style.cursor = wallIdx >= 0 ? 'grab' : 'crosshair';
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    isPanning = false;
    canvas.style.cursor = 'crosshair';
    canvasInfoEl.textContent = 'Drag walls | Scroll to zoom | Drag empty space to pan';
});

canvas.addEventListener('mouseleave', () => {
    isDragging = false;
    isPanning = false;
    canvas.style.cursor = 'crosshair';
});

// Zoom with mouse wheel
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Get world position under mouse before zoom
    const worldBefore = screenToWorld(mouseX, mouseY);
    
    // Adjust zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));
    
    // Get world position under mouse after zoom
    const worldAfter = screenToWorld(mouseX, mouseY);
    
    // Adjust pan to keep mouse position stable
    panX += (worldAfter.x - worldBefore.x) * zoom;
    panY += (worldAfter.y - worldBefore.y) * zoom;
    
    renderCanvas();
    canvasInfoEl.textContent = `Zoom: ${Math.round(zoom * 100)}%`;
}, { passive: false });

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT') return;
    
    const p = currentPattern();
    if (!p || selectedWallIndex < 0) return;
    
    const wall = p.walls[selectedWallIndex];
    const step = e.shiftKey ? 10 : 1;
    
    switch (e.key) {
        case 'ArrowLeft':
            wall.dx -= step;
            e.preventDefault();
            break;
        case 'ArrowRight':
            wall.dx += step;
            e.preventDefault();
            break;
        case 'ArrowUp':
            wall.dy -= step;
            e.preventDefault();
            break;
        case 'ArrowDown':
            wall.dy += step;
            e.preventDefault();
            break;
        case 'Delete':
        case 'Backspace':
            if (p.walls.length > 1) {
                p.walls.splice(selectedWallIndex, 1);
                selectedWallIndex = Math.min(selectedWallIndex, p.walls.length - 1);
            }
            e.preventDefault();
            break;
        default:
            return;
    }
    
    updateExitPoint();
    updateUI();
});

// Button handlers
document.getElementById('new-pattern-btn')!.addEventListener('click', () => {
    const name = `pattern-${patterns.length + 1}`;
    patterns.push({
        name,
        walls: [{ dx: 0, dy: 0, height: 'medium' }],
        exitDx: 0,
        exitDy: 0,
        firstJumpDir: 1
    });
    selectedPatternIndex = patterns.length - 1;
    selectedWallIndex = 0;
    updateUI();
});

document.getElementById('add-wall-btn')!.addEventListener('click', () => {
    const p = currentPattern();
    if (!p) return;
    
    // Add wall offset from last wall
    const lastWall = p.walls[p.walls.length - 1];
    const newDx = lastWall.dx + (p.firstJumpDir * 180);
    const newDy = lastWall.dy - 140;
    
    p.walls.push({ dx: newDx, dy: newDy, height: 'medium' });
    selectedWallIndex = p.walls.length - 1;
    updateExitPoint();
    updateUI();
});

document.getElementById('delete-wall-btn')!.addEventListener('click', () => {
    const p = currentPattern();
    if (!p || selectedWallIndex < 0 || p.walls.length <= 1) return;
    
    p.walls.splice(selectedWallIndex, 1);
    selectedWallIndex = Math.min(selectedWallIndex, p.walls.length - 1);
    updateExitPoint();
    updateUI();
});

document.getElementById('save-btn')!.addEventListener('click', () => {
    savePatterns();
    alert('Patterns saved to localStorage!');
});

document.getElementById('center-btn')!.addEventListener('click', () => {
    centerOnPattern();
    renderCanvas();
});

document.getElementById('export-btn')!.addEventListener('click', () => {
    const code = patterns.map(p => {
        const wallsCode = p.walls.map(w => 
            `        { dx: ${w.dx}, dy: ${w.dy}, height: '${w.height}' },`
        ).join('\n');
        return `    { name: '${p.name}', walls: [
${wallsCode}
    ], exitDx: ${p.exitDx}, exitDy: ${p.exitDy}, firstJumpDir: ${p.firstJumpDir} },`;
    }).join('\n\n');
    
    const fullCode = `const PATTERNS: Pattern[] = [\n${code}\n];`;
    
    navigator.clipboard.writeText(fullCode).then(() => {
        alert('All patterns copied to clipboard!');
    });
});

document.getElementById('copy-btn')!.addEventListener('click', () => {
    const code = codeOutputEl.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
        (document.getElementById('copy-btn') as HTMLButtonElement).textContent = 'Copied!';
        setTimeout(() => {
            (document.getElementById('copy-btn') as HTMLButtonElement).textContent = 'Copy';
        }, 2000);
    });
});

patternNameInput.addEventListener('change', () => {
    const p = currentPattern();
    if (p) {
        p.name = patternNameInput.value;
        updateUI();
    }
});

// Window resize
window.addEventListener('resize', () => renderCanvas());

// Prevent context menu on canvas
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Initialize
function init(): void {
    patterns = loadPatterns();
    if (patterns.length > 0) {
        selectedPatternIndex = 0;
        selectedWallIndex = 0;
    }
    centerOnPattern();
    updateUI();
}

init();
