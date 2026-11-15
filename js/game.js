/*
 * Tennis (Pong) for the arcade. Runs on the shared cabinet shell (window.Arcade).
 * Units: positions in canvas px, speeds in px/second, angles in radians.
 */
(function () {
  'use strict';

  var A = window.Arcade, T = A.theme;

  // ---------------------------------------------------------------- court
  var W = 800, H = 600;
  var PADDLE_WIDTH = 10, PADDLE_HEIGHT = 100;
  var LEFT_FACE = PADDLE_WIDTH, RIGHT_FACE = W - PADDLE_WIDTH; // the x the ball bounces off
  var BALL_R = 10;

  // ---------------------------------------------------------------- tuning
  var BALL_SPEED0 = 330;                    // was 11 px/frame at 30 fps
  var BALL_SPEED_MAX = BALL_SPEED0 * 2.4;
  var HIT_SPEEDUP = 1.04;                   // every paddle hit
  var MAX_BOUNCE = 60 * Math.PI / 180;      // outgoing angle at the paddle's edge
  var SERVE_SPREAD = 25 * Math.PI / 180;
  var PADDLE_SPEED = 540;                   // keyboard and touch buttons
  var POINTER_ACTIVE_MS = 500;              // a hovering mouse steers this long after its last move
  var CPU_SPEED = 180, CPU_DEADZONE = 35;   // was 6 px/frame; replaced by the adaptive AI in step 2

  var LEFT = 0, RIGHT = 1;

  // ---------------------------------------------------------------- state
  var mode = 'ai';                          // 'ai' | '2p'
  var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BALL_R };
  var left = { y: (H - PADDLE_HEIGHT) / 2 };
  var right = { y: (H - PADDLE_HEIGHT) / 2 };
  var score = [0, 0];
  var hover = { t: -Infinity, y: 0 };       // last mouse move with no button held

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------------------------------------------------------------- match flow
  function newMatch() {
    score[LEFT] = 0; score[RIGHT] = 0;
    left.y = right.y = (H - PADDLE_HEIGHT) / 2;
    serve(Math.random() < 0.5 ? -1 : 1);
  }

  // dir: -1 serves toward the left player, +1 toward the right.
  function serve(dir) {
    var a = (Math.random() * 2 - 1) * SERVE_SPREAD;
    ball.x = W / 2; ball.y = H / 2;
    ball.vx = dir * BALL_SPEED0 * Math.cos(a);
    ball.vy = BALL_SPEED0 * Math.sin(a);
  }

  function pointTo(side) {
    score[side]++;
    serve(side === LEFT ? 1 : -1);          // toward whoever just conceded
  }

  // ---------------------------------------------------------------- paddles
  function setPaddleCentre(p, y) { p.y = clamp(y - PADDLE_HEIGHT / 2, 0, H - PADDLE_HEIGHT); }

  function moveByKeys(p, up, down, dt) {
    var dir = (down ? 1 : 0) - (up ? 1 : 0);
    p.y = clamp(p.y + dir * PADDLE_SPEED * dt, 0, H - PADDLE_HEIGHT);
  }

  // Pointer first (mouse hover, or a drag on that paddle's half), keys otherwise.
  function movePlayers(dt) {
    var I = A.input, twoP = mode === '2p';
    var leftY = null, rightY = null, id, p;
    for (id in I.pointers) {
      p = I.pointers[id];
      if (twoP && p.x >= W / 2) rightY = p.y; else leftY = p.y;
    }
    if (leftY === null && performance.now() - hover.t < POINTER_ACTIVE_MS) leftY = hover.y;

    if (leftY !== null) setPaddleCentre(left, leftY);
    else moveByKeys(left,
      I.isDown('KeyW') || I.isDown('PadUp') || (!twoP && I.isDown('ArrowUp')),
      I.isDown('KeyS') || I.isDown('PadDown') || (!twoP && I.isDown('ArrowDown')), dt);

    if (twoP) {
      if (rightY !== null) setPaddleCentre(right, rightY);
      else moveByKeys(right, I.isDown('ArrowUp'), I.isDown('ArrowDown'), dt);
    }
  }

  function moveComputer(dt) {
    var c = right.y + PADDLE_HEIGHT / 2;
    if (c < ball.y - CPU_DEADZONE) right.y += CPU_SPEED * dt;
    else if (c > ball.y + CPU_DEADZONE) right.y -= CPU_SPEED * dt;
    right.y = clamp(right.y, 0, H - PADDLE_HEIGHT);
  }

  // ---------------------------------------------------------------- ball
  function onPaddle(p) {
    return ball.y >= p.y - BALL_R && ball.y <= p.y + PADDLE_HEIGHT + BALL_R;
  }

  // dir: +1 when leaving the left paddle, -1 when leaving the right.
  function bounce(p, dir) {
    var rel = clamp((ball.y - (p.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2), -1, 1);
    var angle = rel * MAX_BOUNCE;
    var speed = Math.min(Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) * HIT_SPEEDUP, BALL_SPEED_MAX);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    ball.x = dir > 0 ? LEFT_FACE + BALL_R : RIGHT_FACE - BALL_R;
  }

  // Once the ball is past a paddle's face the point is lost; the paddle gives way so the two never overlap.
  function yieldToBall(p) {
    var top = ball.y - BALL_R, bottom = ball.y + BALL_R;
    if (bottom <= p.y || top >= p.y + PADDLE_HEIGHT) return;
    var above = top - PADDLE_HEIGHT, below = bottom;   // paddle.y that clears the ball on each side
    var canAbove = above >= 0, canBelow = below <= H - PADDLE_HEIGHT;
    if (canAbove && (!canBelow || Math.abs(above - p.y) <= Math.abs(below - p.y))) p.y = above;
    else p.y = below;
  }

  function stepBall(dt) {
    var prevX = ball.x;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Top and bottom walls: reflect, and put the ball back inside the court.
    if (ball.y < BALL_R && ball.vy < 0) { ball.y = 2 * BALL_R - ball.y; ball.vy = -ball.vy; }
    else if (ball.y > H - BALL_R && ball.vy > 0) { ball.y = 2 * (H - BALL_R) - ball.y; ball.vy = -ball.vy; }
    ball.y = clamp(ball.y, BALL_R, H - BALL_R);

    // Paddles: hit only on the frame the ball's edge crosses the paddle's face.
    if (ball.vx < 0 && prevX - BALL_R >= LEFT_FACE && ball.x - BALL_R < LEFT_FACE) {
      if (onPaddle(left)) bounce(left, 1);
    } else if (ball.vx > 0 && prevX + BALL_R <= RIGHT_FACE && ball.x + BALL_R > RIGHT_FACE) {
      if (onPaddle(right)) bounce(right, -1);
    }
    if (ball.x - BALL_R < LEFT_FACE) yieldToBall(left);
    if (ball.x + BALL_R > RIGHT_FACE) yieldToBall(right);

    if (ball.x < -BALL_R) pointTo(RIGHT);
    else if (ball.x > W + BALL_R) pointTo(LEFT);
  }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    movePlayers(dt);
    if (mode === 'ai') moveComputer(dt);
    stepBall(dt);
  }

  function draw(c) {
    c.fillStyle = T.bgDeep;
    c.fillRect(0, 0, W, H);

    // Net
    c.save();
    c.strokeStyle = T.line; c.lineWidth = 4; c.setLineDash([16, 14]);
    c.beginPath(); c.moveTo(W / 2, 8); c.lineTo(W / 2, H - 8); c.stroke();
    c.restore();

    A.ui.text(c, String(score[LEFT]), W / 4, 32, { size: 56, align: 'center', color: T.muted });
    A.ui.text(c, String(score[RIGHT]), W * 3 / 4, 32, { size: 56, align: 'center', color: T.muted });

    c.fillStyle = T.magenta;
    c.fillRect(0, left.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    c.fillStyle = T.blue;
    c.fillRect(W - PADDLE_WIDTH, right.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    c.fillStyle = T.text;
    c.beginPath(); c.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); c.fill();
  }

  // ---------------------------------------------------------------- boot
  A.init({ game: 'tennis', title: 'Tennis', onRestart: newMatch });
  A.input.capture(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space']);
  A.input.onPointerMove(function (p, id) {
    if (!A.input.pointers[id]) { hover.t = performance.now(); hover.y = p.y; }
  });
  A.touch.buttons([{ label: '▲', code: 'PadUp' }, { label: '▼', code: 'PadDown' }], 'left');

  newMatch();
  A.loop(update, draw);
})();
