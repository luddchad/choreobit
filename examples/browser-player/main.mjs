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
// The animation itself is assembled with the `@choreobit/authoring` builders —
// `defineAnimation`, `defineScene`, `sequence`/`parallel`, `move`/`set`, and
// `semanticStep`/`sourceCode` — over the `@choreobit/primitives` object
// constructors (`text`, `rectangle`). The result is an `AnimationDefinition` that
// runs through the very same `@choreobit/animation` schedule + evaluate and
// `@choreobit/renderer` pass as any other definition. Everything the player
// imports is pulled from the *built* packages through the import map, so this is a
// genuine end-to-end use of the published surface. The player is browser-free
// itself: the canvas, its context, and the `requestAnimationFrame` adapter live
// here, on the consumer side.
import {
  Player,
  createRequestAnimationFrameScheduler,
  createCodeSyncResolver,
} from '@choreobit/player';
import {
  defineAnimation,
  defineScene,
  parallel,
  move,
  set,
  semanticStep,
  sourceCode,
  rectangle,
  text,
  validateAnimationDefinition,
} from '@choreobit/authoring';

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

const TEXT_FONT = 'system-ui, sans-serif';

// --- The scene, built from primitives -------------------------------------
//
// Each visual object is a `@choreobit/primitives` constructor call producing a
// lean `VisualObject`: nine `text` array cells, three `text` pointers (low, high,
// mid), a `rectangle` highlight overlay under the current mid cell, and a title
// and result `text` label. The `move` and `set` operations below drive their
// position over the scene duration. The player never mutates this scene — it
// schedules the timeline once and evaluates fresh snapshots per frame.
const cellObjects = ARRAY.map((value, index) =>
  text(`cell-${index}`, String(value), {
    position: { x: cellX(index), y: CELL_Y },
    properties: { color: '#c7d0e6', fontSize: 20, fontFamily: TEXT_FONT },
  }),
);

const highlightOverlay = rectangle('hl', {
  position: { x: cellX(0), y: CELL_Y },
  properties: {
    width: 52,
    height: 52,
    fill: 'rgba(255, 204, 0, 0.18)',
    stroke: '#ffcc00',
    lineWidth: 2,
  },
});

const pointer = (id, label, index, color) =>
  text(id, label, {
    position: { x: cellX(index), y: POINTER_Y },
    properties: { color, fontSize: 15, fontFamily: TEXT_FONT },
  });

const resultLabel = text('result', 'searching\u2026', {
  position: { x: width / 2, y: RESULT_Y },
  properties: {
    color: '#9fb3d1',
    fontSize: 18,
    fontFamily: TEXT_FONT,
    textAlign: 'center',
  },
});

const title = text('title', `binary_search(a, ${TARGET})`, {
  position: { x: width / 2, y: TITLE_Y },
  properties: {
    color: '#e7edf7',
    fontSize: 22,
    fontFamily: TEXT_FONT,
    textAlign: 'center',
  },
});

// The timeline is seven beats, each a `parallel` of the operations that move on
// that beat. Iteration 1: mid = 4 (value 16) < 23 -> low = 5. Iteration 2:
// mid = 6 (value 38) > 23 -> high = 5. Iteration 3: mid = 5 (value 23) == 23
// -> found. The seven semantic steps tile [0, 10).
const nodes = [
  parallel(
    1.5,
    move('op-mid-move-1', 'ptr-mid', { x: cellX(4), y: POINTER_Y }, 1),
    move('op-hl-move-1', 'hl', { x: cellX(4), y: CELL_Y }, 1),
  ),
  parallel(3, move('op-low-move-1', 'ptr-low', { x: cellX(5), y: POINTER_Y }, 1)),
  parallel(
    4.5,
    move('op-mid-move-2', 'ptr-mid', { x: cellX(6), y: POINTER_Y }, 1),
    move('op-hl-move-2', 'hl', { x: cellX(6), y: CELL_Y }, 1),
  ),
  parallel(6, move('op-high-move-2', 'ptr-high', { x: cellX(5), y: POINTER_Y }, 1)),
  parallel(
    7.5,
    move('op-mid-move-3', 'ptr-mid', { x: cellX(5), y: POINTER_Y }, 1),
    move('op-hl-move-3', 'hl', { x: cellX(5), y: CELL_Y }, 1),
  ),
  parallel(9, set('op-result', 'result', 'text', `found ${TARGET} at index 5`, 1)),
];

const scene = defineScene({
  id: 'binary-search',
  duration: 10,
  objects: [
    title,
    ...cellObjects,
    highlightOverlay,
    pointer('ptr-low', 'low', 0, '#7aa2ff'),
    pointer('ptr-high', 'high', 8, '#7aa2ff'),
    pointer('ptr-mid', 'mid', 0, '#ffcc00'),
    resultLabel,
  ],
  nodes,
});

// The semantic steps: one per algorithmic beat, each bound to the scene and to
// the source line(s) that beat covers. Several beats map onto the same lines
// (every iteration re-runs `while low <= high` and `mid = (low + high) // 2`),
// which the de-duplicating resolver handles.
const steps = [
  semanticStep('step-init', {
    sceneId: 'binary-search',
    description: 'Initialise low and high at the ends of the array.',
    start: 0,
    end: 1.5,
    operations: [],
    sourceLocations: [{ line: 2, description: 'low, high = 0, len(a) - 1' }],
  }),
  semanticStep('step-mid-1', {
    sceneId: 'binary-search',
    description: 'Iteration 1: compute mid = 4 and compare a[mid] with the target.',
    start: 1.5,
    end: 3,
    operations: ['op-mid-move-1', 'op-hl-move-1'],
    sourceLocations: [
      { line: 4, description: 'while low <= high' },
      { line: 5, description: 'mid = (low + high) // 2' },
    ],
  }),
  semanticStep('step-narrow-low', {
    sceneId: 'binary-search',
    description: 'a[4] = 16 is below 23, so discard the left half: low = mid + 1.',
    start: 3,
    end: 4.5,
    operations: ['op-low-move-1'],
    sourceLocations: [
      { line: 8, description: 'if a[mid] < target' },
      { line: 9, description: 'low = mid + 1' },
    ],
  }),
  semanticStep('step-mid-2', {
    sceneId: 'binary-search',
    description: 'Iteration 2: compute mid = 6 and compare a[mid] with the target.',
    start: 4.5,
    end: 6,
    operations: ['op-mid-move-2', 'op-hl-move-2'],
    sourceLocations: [
      { line: 4, description: 'while low <= high' },
      { line: 5, description: 'mid = (low + high) // 2' },
    ],
  }),
  semanticStep('step-narrow-high', {
    sceneId: 'binary-search',
    description: 'a[6] = 38 is above 23, so discard the right half: high = mid - 1.',
    start: 6,
    end: 7.5,
    operations: ['op-high-move-2'],
    sourceLocations: [
      { line: 10, description: 'else' },
      { line: 11, description: 'high = mid - 1' },
    ],
  }),
  semanticStep('step-mid-3', {
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
  }),
  semanticStep('step-found', {
    sceneId: 'binary-search',
    description: 'a[5] = 23 matches, so return the index.',
    start: 9,
    end: 10,
    operations: ['op-result'],
    sourceLocations: [{ line: 7, description: 'return mid' }],
  }),
];

// Compose the portable definition. `duration` is left to default (the sum of the
// scenes), so the total is authoritative and never drifts from the scene.
const animation = defineAnimation({
  id: 'binary-search',
  name: 'Binary Search',
  description: 'Binary search of 23 in a sorted array of nine values, with source sync.',
  width,
  height,
  background: { kind: 'solid', color: '#1a1f2b' },
  scenes: [scene],
  semanticSteps: steps,
  sourceCode: sourceCode({
    language: 'python',
    filename: 'binary_search.py',
    content: SOURCE.join('\n'),
  }),
});

// Validate the assembled definition before it reaches the player, so a malformed
// authoring surfaces here rather than mid-playback.
const validation = validateAnimationDefinition(animation);
if (!validation.valid) {
  throw new Error(`invalid animation definition: ${validation.errors.join('; ')}`);
}

// The player plays a `Scene`, so hand it the one scene of the definition. The
// same `steps` feed both the resolver and the player's semantic stepping.
const resolver = createCodeSyncResolver(steps, 'binary-search');

// --- The player -----------------------------------------------------------
//
// The player binds the scene, the context, the render options, and a real
// `requestAnimationFrame` scheduler. The schedule is computed once inside the
// constructor and reused across every evaluation. The same `steps` feed the
// player's semantic stepping, so the Prev/Next transport controls move the
// single playback clock between the algorithm's beats.
const player = new Player({
  scene: animation.scenes[0],
  context,
  renderOptions: { width, height, background: '#1a1f2b' },
  frameScheduler: createRequestAnimationFrameScheduler(),
  loop: true,
  semanticSteps: steps,
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
const prevButton = document.getElementById('step-back');
const nextButton = document.getElementById('step-forward');
const stepReadout = document.getElementById('step');

// One listener mirrors the single PlayerState onto every UI surface: the
// transport readout, the error slot, the step indicator, and — through the
// resolver — the code viewer. Because the resolver is pure and a function of
// `state.currentTime`, the highlighted lines are exactly the lines the rendered
// frame corresponds to.
player.subscribe((state) => {
  playButton.textContent = state.status === 'playing' ? 'Pause' : 'Play';
  timeReadout.textContent = `${state.currentTime.toFixed(2)} / ${state.duration.toFixed(2)}s`;
  if (state.error) {
    errorReadout.textContent = `error (${state.error.code}): ${state.error.message}`;
  } else {
    errorReadout.textContent = '';
  }
  applyResolution(resolver.resolve(state.currentTime));

  // The step indicator counts how many stops the current time has reached. A time
  // exactly on a stop counts as having reached it, so a forward step to a new
  // beat is reflected immediately.
  let reached = 0;
  for (const stop of player.stopTimes) {
    if (state.currentTime + 1e-9 >= stop) {
      reached += 1;
    }
  }
  stepReadout.textContent = `beat ${reached} of ${player.stopTimes.length}`;
  prevButton.disabled = !player.hasPreviousStep();
  nextButton.disabled = !player.hasNextStep();
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

// Prev / Next walk the single clock between the algorithm's beats. Each call is
// a `seek`, so it pauses playback and renders the new frame; the subscribe
// listener above then refreshes the readout and the code highlight.
prevButton.addEventListener('click', () => player.stepBackward());
nextButton.addEventListener('click', () => player.stepForward());

// Render the first frame so the canvas is not blank while paused, and light the
// first step's source line. The subscribe() above keeps both in step.
player.seek(0);
