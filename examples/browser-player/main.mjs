// ChoreoBit browser-player example.
//
// A dependency-free demonstration of the @choreobit/player controller driving a
// real animation loop in the browser, with the *code synchronizer* wired to the
// same playback clock. The Player owns the *logic* of an animation loop —
// advancing time, evaluating a frame, rendering it, looping or ending — and
// delegates the *timing* to a frame scheduler built on `requestAnimationFrame`.
//
// On top of that, this example binds a binary-search animation to its source:
// each beat of the algorithm is a `SemanticStep`, and the `createCodeSyncResolver`
// maps scene-relative time to the source lines that beat covers. A single
// `player.subscribe` listener projects both the transport bar and the code viewer
// from one `PlayerState`, so the highlighted lines are always the lines the frame
// the player draws corresponds to.
//
// Everything the player imports is pulled from the *built* packages through the
// import map, so this is a genuine end-to-end use of the published surface. The
// player is browser-free itself: the canvas, its context, and the
// `requestAnimationFrame` adapter live here, on the consumer side.
import {
  Player,
  createRequestAnimationFrameScheduler,
  createCodeSyncResolver,
} from '@choreobit/player';

const canvas = document.getElementById('choreobit');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas element not found');
}
const context = canvas.getContext('2d');
if (context === null) {
  throw new Error('2D context unavailable');
}

const width = canvas.width;
const height = canvas.height;

// --- The algorithm we are visualizing -------------------------------------
//
// A binary search of 23 in a sorted array of nine values. The found index is 5.
// Three iterations:
//   1. mid = 4 (value 16)  < 23  -> low  = 5
//   2. mid = 6 (value 38)  > 23  -> high = 5
//   3. mid = 5 (value 23)  == 23 -> found
const ARRAY = [2, 5, 8, 12, 16, 23, 38, 56, 72];
const TARGET = 23;

// The source code a student reads alongside the animation. One line per element,
// 1-based. The semantic steps below map algorithm beats onto these line numbers.
const SOURCE = [
  'def binary_search(a, target):',
  '    low, high = 0, len(a) - 1',
  '',
  '    while low <= high:',
  '        mid = (low + high) // 2',
  '        if a[mid] == target:',
  '            return mid',
  '        if a[mid] < target:',
  '            low = mid + 1',
  '    else:',
  '        high = mid - 1',
];

// Layout constants for the canvas (a 600x360 surface).
const CELL_Y = 250;
const POINTER_Y = 190;
const RESULT_Y = 310;
const TITLE_Y = 50;
const cellX = (index) => 60 + index * 60;

// The scene's length in seconds. The seven semantic steps tile [0, 10.5).
const duration = 10.5;

// Build the nine array cells as `text` objects, plus the three pointers (low,
// high, mid), a moving highlight overlay that sits under the current mid cell,
// and a result label. Each object seeds from its initial state; the `move` and
// `set` operations below drive their position over the scene duration. The
// player never mutates this scene — it schedules the timeline once and evaluates
// fresh snapshots per frame.
const cellObjects = ARRAY.map((value, index) => ({
  id: `cell-${index}`,
  type: 'text',
  state: {
    position: { x: cellX(index), y: CELL_Y },
    properties: {
      text: String(value),
      color: '#c7d0e6',
      fontSize: 20,
      fontFamily: 'system-ui, sans-serif',
    },
  },
  children: [],
}));

const highlightOverlay = {
  id: 'hl',
  type: 'rectangle',
  state: {
    position: { x: cellX(0), y: CELL_Y },
    properties: {
      width: 52,
      height: 52,
      fill: 'rgba(255, 204, 0, 0.18)',
      stroke: '#ffcc00',
      lineWidth: 2,
    },
  },
  children: [],
};

const pointer = (id, label, index, color) => ({
  id,
  type: 'text',
  state: {
    position: { x: cellX(index), y: POINTER_Y },
    properties: {
      text: label,
      color,
      fontSize: 15,
      fontFamily: 'system-ui, sans-serif',
    },
  },
  children: [],
});

const resultLabel = {
  id: 'result',
  type: 'text',
  state: {
    position: { x: width / 2, y: RESULT_Y },
    properties: {
      text: 'searching\u2026',
      color: '#9fb3d1',
      fontSize: 18,
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
    },
  },
  children: [],
};

const scene = {
  id: 'binary-search',
  duration,
  objects: [
    {
      id: 'title',
      type: 'text',
      state: {
        position: { x: width / 2, y: TITLE_Y },
        properties: {
          text: `binary_search(a, ${TARGET})`,
          color: '#e7edf7',
          fontSize: 22,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        },
      },
      children: [],
    },
    ...cellObjects,
    highlightOverlay,
    pointer('ptr-low', 'low', 0, '#7aa2ff'),
    pointer('ptr-high', 'high', 8, '#7aa2ff'),
    pointer('ptr-mid', 'mid', 0, '#ffcc00'),
    resultLabel,
  ],
  timeline: {
    nodes: [
      // Iteration 1: mid = 4 (value 16) < 23 -> low = 5.
      {
        kind: 'parallel',
        startAt: 1.5,
        operations: [
          {
            id: 'op-mid-move-1',
            type: 'move',
            target: 'ptr-mid',
            duration: 1,
            params: { x: cellX(4), y: POINTER_Y },
          },
          {
            id: 'op-hl-move-1',
            type: 'move',
            target: 'hl',
            duration: 1,
            params: { x: cellX(4), y: CELL_Y },
          },
        ],
      },
      {
        kind: 'parallel',
        startAt: 3,
        operations: [
          {
            id: 'op-low-move-1',
            type: 'move',
            target: 'ptr-low',
            duration: 1,
            params: { x: cellX(5), y: POINTER_Y },
          },
        ],
      },
      // Iteration 2: mid = 6 (value 38) > 23 -> high = 5.
      {
        kind: 'parallel',
        startAt: 4.5,
        operations: [
          {
            id: 'op-mid-move-2',
            type: 'move',
            target: 'ptr-mid',
            duration: 1,
            params: { x: cellX(6), y: POINTER_Y },
          },
          {
            id: 'op-hl-move-2',
            type: 'move',
            target: 'hl',
            duration: 1,
            params: { x: cellX(6), y: CELL_Y },
          },
        ],
      },
      {
        kind: 'parallel',
        startAt: 6,
        operations: [
          {
            id: 'op-high-move-2',
            type: 'move',
            target: 'ptr-high',
            duration: 1,
            params: { x: cellX(5), y: POINTER_Y },
          },
        ],
      },
      // Iteration 3: mid = 5 (value 23) == 23 -> found.
      {
        kind: 'parallel',
        startAt: 7.5,
        operations: [
          {
            id: 'op-mid-move-3',
            type: 'move',
            target: 'ptr-mid',
            duration: 1,
            params: { x: cellX(5), y: POINTER_Y },
          },
          {
            id: 'op-hl-move-3',
            type: 'move',
            target: 'hl',
            duration: 1,
            params: { x: cellX(5), y: CELL_Y },
          },
        ],
      },
      {
        kind: 'parallel',
        startAt: 9,
        operations: [
          {
            id: 'op-result',
            type: 'set',
            target: 'result',
            duration: 1,
            params: { name: 'text', value: `found ${TARGET} at index 5` },
          },
        ],
      },
    ],
  },
};

// The semantic steps: one per algorithmic beat, each bound to the scene and to
// the source line(s) that beat covers. Several beats map onto the same lines
// (every iteration re-runs `while low <= high` and `mid = (low + high) // 2`),
// which the de-duplicating resolver handles.
const steps = [
  {
    id: 'step-init',
    sceneId: 'binary-search',
    description: 'Initialise low and high at the ends of the array.',
    start: 0,
    end: 1.5,
    operations: [],
    sourceLocations: [{ line: 2, description: 'low, high = 0, len(a) - 1' }],
  },
  {
    id: 'step-mid-1',
    sceneId: 'binary-search',
    description: 'Iteration 1: compute mid = 4 and compare a[mid] with the target.',
    start: 1.5,
    end: 3,
    operations: ['op-mid-move-1', 'op-hl-move-1'],
    sourceLocations: [
      { line: 4, description: 'while low <= high' },
      { line: 5, description: 'mid = (low + high) // 2' },
    ],
  },
  {
    id: 'step-narrow-low',
    sceneId: 'binary-search',
    description: 'a[4] = 16 is below 23, so discard the left half: low = mid + 1.',
    start: 3,
    end: 4.5,
    operations: ['op-low-move-1'],
    sourceLocations: [
      { line: 8, description: 'if a[mid] < target' },
      { line: 9, description: 'low = mid + 1' },
    ],
  },
  {
    id: 'step-mid-2',
    sceneId: 'binary-search',
    description: 'Iteration 2: compute mid = 6 and compare a[mid] with the target.',
    start: 4.5,
    end: 6,
    operations: ['op-mid-move-2', 'op-hl-move-2'],
    sourceLocations: [
      { line: 4, description: 'while low <= high' },
      { line: 5, description: 'mid = (low + high) // 2' },
    ],
  },
  {
    id: 'step-narrow-high',
    sceneId: 'binary-search',
    description: 'a[6] = 38 is above 23, so discard the right half: high = mid - 1.',
    start: 6,
    end: 7.5,
    operations: ['op-high-move-2'],
    sourceLocations: [
      { line: 10, description: 'else' },
      { line: 11, description: 'high = mid - 1' },
    ],
  },
  {
    id: 'step-mid-3',
    sceneId: 'binary-search',
    description: 'Iteration 3: compute mid = 5 and compare a[mid] with the target.',
    start: 7.5,
    end: 9,
    operations: ['op-mid-move-3', 'op-hl-move-3'],
    sourceLocations: [
      { line: 4, description: 'while low <= high' },
      { line: 5, description: 'mid = (low + high) // 2' },
      { line: 6, description: 'if a[mid] == target' },
    ],
  },
  {
    id: 'step-found',
    sceneId: 'binary-search',
    description: 'a[5] = 23 matches, so return the index.',
    start: 9,
    end: duration,
    operations: ['op-result'],
    sourceLocations: [{ line: 7, description: 'return mid' }],
  },
];

// Build a code-sync resolver once, scoped to this scene. Validation happens
// eagerly here, so a malformed step would surface before the first frame.
const resolver = createCodeSyncResolver(steps, 'binary-search');

// --- The player -----------------------------------------------------------
//
// The player binds the scene, the context, the render options, and a real
// `requestAnimationFrame` scheduler. The schedule is computed once inside the
// constructor and reused across every evaluation.
const player = new Player({
  scene,
  context,
  renderOptions: { width, height, background: '#1a1f2b' },
  frameScheduler: createRequestAnimationFrameScheduler(),
  loop: true,
});

// --- Code viewer ----------------------------------------------------------
//
// Build one DOM row per source line. Each row carries its 1-based line number in
// `dataset.line`, so the resolver's active locations can light them up.
const codeContainer = document.getElementById('code');

const lineElements = new Map();
SOURCE.forEach((text, i) => {
  const line = i + 1;
  const row = document.createElement('div');
  row.className = 'line';
  row.dataset.line = String(line);

  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(line);

  const code = document.createElement('span');
  code.className = 'src';
  code.textContent = text.length === 0 ? ' ' : text;

  row.append(num, code);
  codeContainer.append(row);
  lineElements.set(line, row);
});

// Apply one resolution to the DOM: light the active lines, dim the rest, and
// surface the active step's description as a caption.
const caption = document.getElementById('caption');
function applyResolution(resolution) {
  for (const row of lineElements.values()) {
    row.classList.remove('active');
  }
  const activeLines = new Set();
  for (const location of resolution.activeLocations) {
    activeLines.add(location.line);
    if (location.endLine !== undefined) {
      for (let l = location.line; l <= location.endLine; l++) {
        activeLines.add(l);
      }
    }
  }
  for (const [line, row] of lineElements) {
    if (activeLines.has(line)) {
      row.classList.add('active');
    }
  }
  const activeStep = steps.find((step) => resolution.activeStepIds.includes(step.id));
  caption.textContent = activeStep ? activeStep.description : 'no step active';
}

// --- Transport UI ---------------------------------------------------------

const playButton = document.getElementById('play');
const restartButton = document.getElementById('restart');
const loopToggle = document.getElementById('loop');
const rateSlider = document.getElementById('rate');
const rateValue = document.getElementById('rate-value');
const timeReadout = document.getElementById('time');
const errorReadout = document.getElementById('error');

// One listener mirrors the single PlayerState onto every UI surface: the
// transport readout, the error slot, and — through the resolver — the code
// viewer. Because the resolver is pure and a function of `state.currentTime`,
// the highlighted lines are exactly the lines the rendered frame corresponds to.
player.subscribe((state) => {
  playButton.textContent = state.status === 'playing' ? 'Pause' : 'Play';
  timeReadout.textContent = `${state.currentTime.toFixed(2)} / ${state.duration.toFixed(2)}s`;
  if (state.error) {
    errorReadout.textContent = `error (${state.error.code}): ${state.error.message}`;
  } else {
    errorReadout.textContent = '';
  }
  applyResolution(resolver.resolve(state.currentTime));
});

playButton.addEventListener('click', () => {
  if (player.getState().status === 'playing') {
    player.pause();
  } else {
    player.play();
  }
});

restartButton.addEventListener('click', () => player.restart());

loopToggle.addEventListener('change', () => player.setLoop(loopToggle.checked));

rateSlider.addEventListener('input', () => {
  const rate = Number.parseFloat(rateSlider.value);
  player.setPlaybackRate(rate);
  rateValue.textContent = `${rate.toFixed(2)}\u00d7`;
});

// Render the first frame so the canvas is not blank while paused, and light the
// first step's source line. The subscribe() above keeps both in step.
player.seek(0);
