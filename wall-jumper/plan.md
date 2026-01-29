# Wall Generation Algorithm - Chunk-Based Design

## Current Problems

1. **Walls too far apart** - riseY values don't account for actual jump physics
2. **No structure** - random pattern selection leads to unpredictable difficulty
3. **No playability guarantee** - walls can spawn in unreachable positions
4. **Only 2 columns** - limits gameplay variety

---

## New Architecture: Chunk-Based Generation

### Core Concepts

```
┌─────────────────────────────────────────────────────┐
│                      CHUNK                          │
│  ┌─────────────────┐    ┌─────────────────┐        │
│  │    PATTERN A    │    │    PATTERN B    │        │
│  │   (3-5 walls)   │ → │   (3-5 walls)    │        │
│  │   guaranteed    │    │   guaranteed     │        │
│  │   playable      │    │   playable       │        │
│  └─────────────────┘    └─────────────────┘        │
│         ↑                        ↓                  │
│    entry point            exit point               │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                   NEXT CHUNK                        │
│    entry point ← connects to previous exit         │
└─────────────────────────────────────────────────────┘
```

---

## 1. Column System (5 Columns)

Instead of zones with percentage ranges, use **fixed columns**:

```typescript
const NUM_COLUMNS = 5;
const COLUMN_MARGIN = 0.08; // 8% margin on each side

function getColumnX(col: number): number {
    const w = window.innerWidth;
    const usableWidth = w * (1 - 2 * COLUMN_MARGIN);
    const colWidth = usableWidth / (NUM_COLUMNS - 1);
    return w * COLUMN_MARGIN + col * colWidth;
}

// Columns: 0=far-left, 1=left, 2=center, 3=right, 4=far-right
```

**Visual representation (screen width):**
```
|  0  |  1  |  2  |  3  |  4  |
 8%   29%   50%   71%   92%
```

---

## 2. Jump Physics Constants

Derive reachability from actual physics:

```typescript
// From CONFIG
const JUMP_ANGLE_DEG = 65;
const JUMP_INITIAL_SPEED = 14;
const THRUST_FORCE = 1.2;
const THRUST_MAX_MS = 400;
const GRAVITY = 0.8;

// Calculated max reach (approximate, tune empirically)
const MAX_HORIZONTAL_REACH = 400; // pixels
const MAX_VERTICAL_RISE = 200;    // pixels (with full thrust)
const MIN_VERTICAL_GAP = 50;      // pixels (minimum gap between walls)

// Column reachability: from any column, can reach ±2 columns
const MAX_COLUMN_JUMP = 2;
```

---

## 3. Pattern Definition

A **Pattern** is a pre-designed sequence of 3-5 walls that is **guaranteed playable**:

```typescript
type PatternWall = {
    column: number;           // 0-4 (absolute column position)
    relativeY: number;        // Y offset from pattern start (negative = up)
    height: WallSize;
};

type Pattern = {
    name: string;
    walls: PatternWall[];
    entryColumn: number;      // Which column player enters from
    exitColumn: number;       // Which column player exits to
    exitY: number;            // Y offset of exit point (negative)
};
```

### Example Patterns

**Zigzag (classic left-right-left):**
```typescript
{
    name: 'zigzag',
    walls: [
        { column: 1, relativeY: 0, height: 'medium' },
        { column: 3, relativeY: -150, height: 'medium' },
        { column: 1, relativeY: -300, height: 'medium' },
    ],
    entryColumn: 1,
    exitColumn: 1,
    exitY: -300,
}
```

**Staircase (same side, ascending with air flip):**
```typescript
{
    name: 'staircase',
    walls: [
        { column: 1, relativeY: 0, height: 'short' },
        { column: 1, relativeY: -180, height: 'short' },
        { column: 3, relativeY: -330, height: 'medium' },
    ],
    entryColumn: 1,
    exitColumn: 3,
    exitY: -330,
}
```

**Wide Cross:**
```typescript
{
    name: 'wide-cross',
    walls: [
        { column: 0, relativeY: 0, height: 'tall' },
        { column: 4, relativeY: -180, height: 'tall' },
    ],
    entryColumn: 0,
    exitColumn: 4,
    exitY: -180,
}
```

**Center Hop:**
```typescript
{
    name: 'center-hop',
    walls: [
        { column: 1, relativeY: 0, height: 'medium' },
        { column: 2, relativeY: -140, height: 'medium' },
        { column: 3, relativeY: -280, height: 'medium' },
    ],
    entryColumn: 1,
    exitColumn: 3,
    exitY: -280,
}
```

---

## 4. Chunk Definition

A **Chunk** contains 2 patterns with a transition wall between them:

```typescript
type Chunk = {
    patterns: [Pattern, Pattern];
    transitionWall: PatternWall;  // Connects Pattern A exit to Pattern B entry
    baseY: number;                // Y position where chunk starts
};
```

### Chunk Generation Rules

1. **Select Pattern A** randomly
2. **Add transition wall** that bridges Pattern A's exit to Pattern B's entry
3. **Select Pattern B** where entry is reachable from transition wall
4. **Validate** all transitions are within jump physics limits

```typescript
function generateChunk(entryColumn: number, entryY: number): Chunk {
    // Pick Pattern A
    const patternA = pickRandomPattern();
    
    // Mirror pattern if needed to match entry column
    const adjustedA = adjustPatternEntry(patternA, entryColumn);
    
    // Calculate exit position
    const exitY = entryY + adjustedA.exitY;
    const exitCol = adjustedA.exitColumn;
    
    // Create transition wall (bridge to Pattern B)
    const transitionY = exitY - 150; // 150px above Pattern A exit
    const transitionCol = pickReachableColumn(exitCol);
    
    // Pick Pattern B that starts from transition column
    const patternB = pickPatternWithEntry(transitionCol);
    
    return { patterns: [adjustedA, patternB], transitionWall, baseY: entryY };
}
```

---

## 5. Pattern Mirroring

Patterns can be horizontally mirrored to fit entry requirements:

```typescript
function mirrorPattern(pattern: Pattern): Pattern {
    return {
        ...pattern,
        walls: pattern.walls.map(w => ({
            ...w,
            column: (NUM_COLUMNS - 1) - w.column, // Mirror: 0↔4, 1↔3, 2↔2
        })),
        entryColumn: (NUM_COLUMNS - 1) - pattern.entryColumn,
        exitColumn: (NUM_COLUMNS - 1) - pattern.exitColumn,
    };
}
```

---

## 6. Reachability Rules

### Horizontal Reach
- From column X, can reach columns X-2 to X+2
- Example: From column 1, can reach columns 0, 1, 2, 3

### Vertical Reach
- **Minimum gap**: 50px (walls must not overlap)
- **Maximum rise**: 200px (with full thrust jump)
- **Comfortable rise**: 120-150px (reliable jump)

### Validation Function
```typescript
function canReach(fromCol: number, toCol: number, verticalGap: number): boolean {
    const colDiff = Math.abs(toCol - fromCol);
    
    // Check column distance
    if (colDiff > MAX_COLUMN_JUMP) return false;
    
    // Check vertical gap
    if (verticalGap < MIN_VERTICAL_GAP) return false;
    if (verticalGap > MAX_VERTICAL_RISE) return false;
    
    // Wider jumps need more vertical space
    if (colDiff === 2 && verticalGap < 100) return false;
    
    return true;
}
```

---

## 7. Generation Flow

```
GAME START
    │
    ▼
┌───────────────────────────────────────┐
│ Create starter walls at floor level   │
│ Set: currentCol=1, currentY=floorY    │
└───────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────┐
│         MAIN GENERATION LOOP          │
│                                       │
│ while (currentY > cameraY - buffer) { │
│     chunk = generateChunk(            │
│         currentCol, currentY          │
│     );                                │
│     spawnChunkWalls(chunk);           │
│     currentCol = chunk.exitColumn;    │
│     currentY = chunk.exitY;           │
│ }                                     │
└───────────────────────────────────────┘
```

---

## 8. Wall Spawning

```typescript
function spawnChunkWalls(chunk: Chunk): void {
    let y = chunk.baseY;
    
    // Spawn Pattern A walls
    for (const wall of chunk.patterns[0].walls) {
        const x = getColumnX(wall.column);
        const wallY = y + wall.relativeY;
        createWall(x, wallY, getWallHeight(wall.height));
    }
    
    // Spawn transition wall
    const transX = getColumnX(chunk.transitionWall.column);
    const transY = y + chunk.patterns[0].exitY - 150;
    createWall(transX, transY, getWallHeight(chunk.transitionWall.height));
    
    // Update Y for Pattern B
    y = transY;
    
    // Spawn Pattern B walls
    for (const wall of chunk.patterns[1].walls) {
        const x = getColumnX(wall.column);
        const wallY = y + wall.relativeY;
        createWall(x, wallY, getWallHeight(wall.height));
    }
}
```

---

## 9. Implementation Phases

### Phase 1: Column System
- [ ] Remove zone system
- [ ] Add `NUM_COLUMNS = 5`
- [ ] Implement `getColumnX(col: number)`
- [ ] Update initial walls to use columns

### Phase 2: Pattern Library
- [ ] Define `PatternWall` type
- [ ] Define `Pattern` type
- [ ] Create 6-8 hand-crafted patterns
- [ ] Add `mirrorPattern()` function
- [ ] Add pattern selection functions

### Phase 3: Chunk System
- [ ] Define `Chunk` type
- [ ] Implement `generateChunk()`
- [ ] Implement `spawnChunkWalls()`
- [ ] Add transition wall logic

### Phase 4: Integration
- [ ] Replace `generateLevelStep()` with chunk-based generation
- [ ] Update state tracking (currentCol, currentY)
- [ ] Test playability

### Phase 5: Polish
- [ ] Tune jump physics constants
- [ ] Add more pattern variety
- [ ] Implement difficulty progression
- [ ] Add visual feedback for pattern changes

---

## 10. Guarantees

| Guarantee | How It's Achieved |
|-----------|-------------------|
| **Intra-pattern playability** | Hand-crafted patterns tested for reachability |
| **Pattern A → Transition** | Transition wall within MAX_COLUMN_JUMP of exit |
| **Transition → Pattern B** | Pattern B entry matches transition column |
| **Chunk → Chunk** | Next chunk entry = previous chunk exit |

---

## 11. Difficulty Progression

```typescript
const DIFFICULTY_TIERS = [
    { scoreThreshold: 0, patterns: ['zigzag', 'center-hop'] },
    { scoreThreshold: 500, patterns: ['staircase', 'wide-cross'] },
    { scoreThreshold: 1500, patterns: ['flip-required', 'rapid-fire'] },
    { scoreThreshold: 3000, patterns: ['extreme-cross', 'micro-platforms'] },
];

function getAvailablePatterns(score: number): string[] {
    let available: string[] = [];
    for (const tier of DIFFICULTY_TIERS) {
        if (score >= tier.scoreThreshold) {
            available = [...available, ...tier.patterns];
        }
    }
    return available;
}
```
