// ChoreoBit browser-player example.
//
// A minimal, dependency-free demonstration of the @choreobit/player controller
// driving a real animation loop in the browser. The Player owns the *logic* of
// an animation loop — advancing time, evaluating a frame, rendering it, looping or
// ending — and delegates the *timing* to a frame scheduler built on
// `requestAnimationFrame`. The transport controls below exercise its public
// surface: play, pause, restart, loop, and playback rate.
//
// Everything the player imports is pulled from the *built* packages through the
// import map, so this is a genuine end-to-end use of the published surface. The
// player is browser-free itself: the canvas, its context, and the
// `requestAnimationFrame` adapter live here, on the consumer side.
import { Player, createRequestAnimationFrameScheduler } from '@choreobit/player';

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

// The scene's length in seconds. A single `move` operation sweeps a rectangle
// horizontally over this interval, and the loop (when on) wraps on it.
const duration = 6;

// A core Scene: a rectangle that sweeps horizontally, a stationary circle, and a
// white text label. Each object seeds from its initial `VisualObjectState`; the
// one `move` operation drives the rectangle's position over the scene duration.
// The player never mutates this scene — it schedules the timeline once and
// evaluates fresh snapshots per frame.
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

// --- Transport UI -----------------------------------------------------------

const playButton = document.getElementById('play');
const restartButton = document.getElementById('restart');
const loopToggle = document.getElementById('loop');
const rateSlider = document.getElementById('rate');
const rateValue = document.getElementById('rate-value');
const timeReadout = document.getElementById('time');
const errorReadout = document.getElementById('error');

function syncButtons(state) {
  playButton.textContent = state.status === 'playing' ? 'Pause' : 'Play';
  timeReadout.textContent = `${state.currentTime.toFixed(2)} / ${state.duration.toFixed(2)}s`;
  if (state.error) {
    errorReadout.textContent = `error (${state.error.code}): ${state.error.message}`;
  } else {
    errorReadout.textContent = '';
  }
}

// Keep the transport bar in step with the player on every change.
player.subscribe(syncButtons);

// Play/pause toggles through the player's status.
playButton.addEventListener('click', () => {
  if (player.getState().status === 'playing') {
    player.pause();
  } else {
    player.play();
  }
});

// Restart returns to frame 0, paused.
restartButton.addEventListener('click', () => player.restart());

// The loop checkbox drives the player's loop flag live.
loopToggle.addEventListener('change', () => player.setLoop(loopToggle.checked));

// The rate slider drives the playback rate live.
rateSlider.addEventListener('input', () => {
  const rate = Number.parseFloat(rateSlider.value);
  player.setPlaybackRate(rate);
  rateValue.textContent = `${rate.toFixed(2)}\u00d7`;
});

// Render the first frame so the canvas is not blank while paused. A natural
// media-player default: the first frame is shown, the clock is at 0. The
// subscribe() above keeps the transport bar in step with this.
player.seek(0);
