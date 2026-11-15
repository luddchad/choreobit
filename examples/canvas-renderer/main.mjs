// ChoreoBit canvas-renderer example.
//
// A minimal, dependency-free demonstration of the full ChoreoBit pipeline on a
// Canvas 2D surface: a core {@link Scene} is scheduled once with
// `scheduleTimeline`, then `evaluateSceneAt` produces a `SceneVisualState` for
// each frame and `renderScene` draws it onto a real 2D canvas context. The
// renderer is imported from the *built* package (see the import map below), so
// this is a genuine end-to-end use of the published surface, not a source import.
//
// The renderer never touches the DOM: the canvas element and its context live
// here, on the consumer side. The renderer only issues 2D-context commands,
// proving the structural-contract design. The evaluator likewise is pure: it
// reads the scene and a schedule and returns a fresh snapshot, mutating nothing.
import { evaluateSceneAt, scheduleTimeline } from '@choreobit/animation';
import { renderScene } from '@choreobit/renderer';

const canvas = document.getElementById('choreobit');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas element not found');
}
const context = canvas.getContext('2d');
if (context === null) {
  throw new Error('2D context unavailable');
}

// The width/height the renderer clears and lays out for.
const width = canvas.width;
const height = canvas.height;

// The scene's length in seconds. The single `move` operation sweeps a rectangle
// across the surface over this interval, and the loop time wraps on it.
const duration = 6;

// A core Scene: a rectangle that sweeps horizontally, a stationary circle, and a
// white text label. Each object seeds from its initial `VisualObjectState`; the
// one `move` operation drives the rectangle's position over the scene duration.
// No rotation or scale — the evaluation contract carries neither, and the
// renderer draws only position and opacity.
const scene = {
  id: 'demo',
  duration,
  objects: [
    {
      id: 'sweep',
      type: 'rectangle',
      state: {
        position: { x: 100, y: 160 },
        highlighted: true,
        properties: {
          width: 120,
          height: 70,
          fill: '#4f8cff',
          stroke: '#9fc2ff',
          lineWidth: 2,
        },
      },
      children: [],
    },
    {
      id: 'dot',
      type: 'circle',
      state: {
        position: { x: 400, y: 80 },
        properties: {
          radius: 28,
          fill: '#ffcc00',
        },
      },
      children: [],
    },
    {
      id: 'label',
      type: 'text',
      state: {
        position: { x: 240, y: 300 },
        properties: {
          text: 'ChoreoBit',
          color: '#ffffff',
          fontSize: 22,
          fontFamily: 'system-ui, sans-serif',
        },
      },
      children: [],
    },
  ],
  timeline: {
    nodes: [
      {
        kind: 'sequence',
        startAt: 0,
        operations: [
          {
            id: 'sweep-move',
            type: 'move',
            target: 'sweep',
            duration,
            params: { x: 380, y: 160 },
          },
        ],
      },
    ],
  },
};

// Schedule the timeline once; evaluation reuses this every frame.
const schedule = scheduleTimeline(scene.timeline);

function frame(now) {
  // Wrap the clock onto the scene's interval so the sweep loops.
  const time = (now / 1000) % duration;
  const result = evaluateSceneAt(scene, schedule, time);
  // Evaluation is a total function over a well-formed scene; on the rare
  // malformed input it returns an error variant, which we log and skip rather
  // than render.
  if (!result.ok) {
    console.warn(
      `evaluation failed at t=${time.toFixed(2)}:`,
      result.error.code,
      result.error.message,
    );
  } else {
    renderScene(context, result.state, { width, height, background: '#1a1f2b' });
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
