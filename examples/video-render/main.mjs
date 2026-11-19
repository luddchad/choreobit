// ChoreoBit video-render example.
//
// A minimal, dependency-free demonstration of @choreobit/video producing a
// deterministic filmstrip with no animation loop, no encoder, and no audio: an
// AnimationDefinition is rendered to a Canvas 2D context at a chosen frame rate,
// and a handful of frames are captured at evenly spaced times and laid out as a
// grid of thumbnails. It is the offline, batch end of the pipeline — the thing a
// downstream encoder or still-frame exporter consumes — as opposed to the
// browser-player example, which drives the same pipeline in real time.
//
// The renderer is imported from the *built* package (see the import map below),
// so this is a genuine end-to-end use of the published surface. The animation
// itself is assembled with the @choreobit/authoring builders over the
// @choreobit/primitives constructors and validated with
// validateAnimationDefinition, exactly like the player example, so the same
// definition runs through the same schedule + evaluate + render pass.
//
// The renderer is browser-free: it never owns a clock or an animation frame.
// Here, on the consumer side, the canvases and their contexts live in the DOM,
// and a real CanvasRenderingContext2D satisfies the renderer's Canvas2DContext
// contract by shape.
//
// Two properties of the renderer are what make a filmstrip safe to build out of
// order:
//   - Determinism. Frame n is n / fps seconds in, independent of how many frames
//     were already drawn, so sampling times in any order yields the same frames.
//   - Random access. renderFrameAtTime(t) resolves t to its nearest frame and
//     renders just that one, so a filmstrip can jump to its sample points without
//     paying for the frames in between.
//
// The filmstrip below is built with renderFrameAtTime (random access). A
// sequential producer — the frames() generator — yields the identical frames in
// order and is the lazy counterpart a real encoder would drive.
import { createFrameRenderer, isVideoError } from '@choreobit/video';
import {
  defineAnimation,
  defineScene,
  sequence,
  move,
  set,
  highlight,
  circle,
  rectangle,
  text,
  validateAnimationDefinition,
} from '@choreobit/authoring';

const canvas = document.getElementById('filmstrip');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('canvas element not found');
}
const context = canvas.getContext('2d');
if (context === null) {
  throw new Error('2D context unavailable');
}

// The logical canvas the definition lays out its objects on. The thumbnails are
// scaled down to fit the filmstrip; the definition and the renderer work in these
// logical units and never see the thumbnail scale.
const width = 600;
const height = 360;

// The frame rate the video is produced at. The definition carries only seconds,
// so the same animation could just as well be produced at 24 or 60 FPS; the
// renderer is the one place a rate is chosen.
const fps = 30;

// How many thumbnails the filmstrip shows, and the grid they form.
const columns = 4;
const rows = 3;
const thumbnailCount = columns * rows;
const thumbW = 200;
const thumbH = 120;
const gap = 12;

// --- The animation --------------------------------------------------------
//
// Two scenes, so the filmstrip exercises scene resolution: a global time resolves
// to the scene whose cumulative interval contains it, and to the time relative to
// that scene's start. Scene 0 sweeps a rectangle and pulses a circle; scene 1
// holds them and lights a label. Each object seeds from its initial
// VisualObjectState; the operations drive their properties over the scene
// duration. The renderer schedules each scene's timeline once at construction and
// reuses it, so a sampled frame never re-schedules.
const scene0 = defineScene({
  id: 'sweep',
  duration: 3,
  objects: [
    rectangle('box', {
      position: { x: 120, y: 180 },
      properties: { width: 90, height: 90, fill: '#4f8cff', stroke: '#9fc2ff', lineWidth: 2 },
    }),
    circle('orb', {
      position: { x: 480, y: 180 },
      properties: { radius: 26, fill: '#ffcc00' },
    }),
  ],
  nodes: [
    sequence(
      0,
      move('box-sweep', 'box', { x: 360, y: 180 }, 3),
      highlight('orb-pulse', 'orb', { duration: 3, color: '#ff7a7a' }),
    ),
  ],
});

const scene1 = defineScene({
  id: 'hold',
  duration: 2,
  objects: [
    rectangle('box', {
      position: { x: 360, y: 180 },
      properties: { width: 90, height: 90, fill: '#4f8cff', stroke: '#9fc2ff', lineWidth: 2 },
    }),
    circle('orb', {
      position: { x: 480, y: 180 },
      properties: { radius: 26, fill: '#ffcc00' },
    }),
    text('label', 'rendered', {
      position: { x: width / 2, y: 320 },
      properties: {
        color: '#e7edf7',
        fontSize: 20,
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      },
    }),
  ],
  nodes: [sequence(0, set('label-show', 'label', 'text', 'rendered offline', 1))],
});

// Compose the portable definition. `duration` defaults to the sum of the scenes
// (3 + 2 = 5s), so the total is authoritative and never drifts from the scenes.
const animation = defineAnimation({
  id: 'video-demo',
  name: 'Video Demo',
  description: 'A two-scene demo rendered offline to a deterministic filmstrip.',
  width,
  height,
  background: { kind: 'solid', color: '#1a1f2b' },
  scenes: [scene0, scene1],
});

// Validate the assembled definition before it reaches the renderer, so a malformed
// authoring surfaces here rather than as a per-frame VideoError mid-render.
const validation = validateAnimationDefinition(animation);
if (!validation.valid) {
  throw new Error(`invalid animation definition: ${validation.errors.join('; ')}`);
}

// --- The filmstrip --------------------------------------------------------
//
// Sample `thumbnailCount` times evenly across the duration and render each to its
// own offscreen canvas, then blit it into a grid on the visible canvas. Each
// thumbnail gets its own renderer because a renderer is bound to one context;
// rendering a sampled frame is random access, so the thumbnails can be produced in
// any order and always agree with a sequential pass.

// Size the visible canvas to the grid first: setting a canvas's width or height
// clears its contents, so this must happen before any drawing.
canvas.width = columns * (thumbW + gap);
canvas.height = rows * (thumbH + gap + 18);

const offscreen = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

function paintThumbnail(index) {
  // Sample a time evenly across [0, duration]. The endpoints land on frame 0 and
  // the final frame, so the strip spans the whole animation.
  const time = (index / (thumbnailCount - 1)) * animation.duration;

  // Render the single frame at this time onto a fresh offscreen context. A real
  // CanvasRenderingContext2D satisfies the renderer's Canvas2DContext contract, so
  // no adapter is needed.
  const tile = offscreen(width, height);
  const tileContext = tile.getContext('2d');
  if (tileContext === null) {
    throw new Error('2D context unavailable for a thumbnail');
  }

  const info = createFrameRenderer(animation, fps, tileContext).renderFrameAtTime(time);

  // Lay the tile out in its grid cell, with a caption naming the frame, its time,
  // and the scene it resolved to. The caption is the renderer's own reported
  // frameIndex / time / sceneIndex, so the strip shows the renderer's view, not a
  // re-derived one.
  const cellX = index % columns;
  const cellY = Math.floor(index / columns);
  const x = cellX * (thumbW + gap);
  const y = cellY * (thumbH + gap);

  context.drawImage(tile, x, y, thumbW, thumbH);

  context.fillStyle = '#9fb3d1';
  context.font = '12px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText(
    `frame ${info.index} · ${info.time.toFixed(2)}s · scene ${info.sceneIndex}`,
    x,
    y + thumbH + 16,
  );
}

// Render every thumbnail. A per-frame failure throws a VideoError naming the fault
// (e.g. 'render' for an unsupported object type); catch it, surface it, and stop,
// because a bad frame is a hard failure, not a skipped one.
const errorReadout = document.getElementById('error');
try {
  for (let i = 0; i < thumbnailCount; i++) {
    paintThumbnail(i);
  }
} catch (error) {
  if (isVideoError(error)) {
    errorReadout.textContent = `render failed (${error.code}): ${error.message}`;
  } else {
    errorReadout.textContent = `render failed: ${error?.message ?? String(error)}`;
  }
  throw error;
}

// Size the visible canvas to the grid it just filled.
canvas.width = columns * (thumbW + gap);
canvas.height = rows * (thumbH + gap + 18);
