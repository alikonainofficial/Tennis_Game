/*
 * Tennis (Pong) for the arcade. Runs on the shared cabinet shell (window.Arcade).
 * Units: positions in canvas px, speeds in px/second, angles in radians, timers in seconds.
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

  var WIN_SCORE = 7;
  var SERVE_PAUSE = 0.9;                    // ball waits on the server's side; Space skips
  var POINT_PAUSE = 0.6;                    // between a point and the next serve
  var RALLY_BANNER_EVERY = 10, RALLY_BANNER_TIME = 0.6;
  var FLASH_TIME = 0.08;                    // paddle turns white on a hit
  var POP_TIME = 0.15, POP_SCALE = 1.4;     // score grows when it changes
  var SHAKE_SPEED = BALL_SPEED0 * 1.8;      // hits faster than this shake the screen
  var TRAIL_LENGTH = 6, TRAIL_STEP = 1 / 60;

  // ---------------------------------------------------------------- AI
  // reactionMs: delay before it reacts to a ball coming its way. maxSpeed: px/s.
  // errorPx: how far off its aim can be, re-rolled for every approach.
  var PRESETS = {
    easy: { label: 'Easy', reactionMs: 320, maxSpeed: 300, errorPx: 70 },
    normal: { label: 'Normal', reactionMs: 180, maxSpeed: 420, errorPx: 40 },
    hard: { label: 'Hard', reactionMs: 80, maxSpeed: 560, errorPx: 15 }
  };
  var DIFFICULTIES = ['easy', 'normal', 'hard'];
  var AI_KEYS = ['reactionMs', 'maxSpeed', 'errorPx'];
  var AI_HARDER = { reactionMs: -15, maxSpeed: 15, errorPx: -4 }; // one adaptation notch
  var AI_ADAPT_LIMIT = 0.4;                 // never more than 40% away from the preset
  var AI_DEADZONE = 12;                     // px around the target where it holds still
  var AI_DRIFT = 0.4;                       // share of its speed used to drift back to centre
  var AI_RALLY_BONUS = 0.02;                // extra speed for every 10 hits in the rally

  var LEFT = 0, RIGHT = 1;

  // ---------------------------------------------------------------- state
  var mode = 'ai';                          // 'ai' | '2p'
  var difficulty = 'normal';                // key of PRESETS, saved in arcade.tennis.difficulty
  var phase = 'start';                      // 'start' | 'serve' | 'rally' | 'point' | 'over'
  var phaseT = 0;                           // seconds spent in the current phase
  var server = LEFT;                        // who serves next: the winner of the last point
  var ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BALL_R };
  var left = { y: (H - PADDLE_HEIGHT) / 2, flash: 0 };
  var right = { y: (H - PADDLE_HEIGHT) / 2, flash: 0 };
  var score = [0, 0];
  var pop = [0, 0];                         // time left on each score's pop
  var rallyHits = 0;                        // paddle hits since the serve
  var longestRally = 0;                     // this match
  var banner = { text: '', t: 0 };          // "Rally 20!"
  var trail = [], trailT = 0;
  var ai = { reactionMs: 0, maxSpeed: 0, errorPx: 0, incoming: false, waited: 0, error: 0 };
  var hover = { t: -Infinity, y: 0 };       // last mouse move with no button held
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Reduced motion: no screen shake, no ball trail.
  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }

  // ---------------------------------------------------------------- overlays and HUD
  function showStart() {
    phase = 'start';
    var buttons = [
      { label: 'vs AI', keepOpen: true, onClick: function () { mode = 'ai'; showStart(); } },
      { label: '2 players', keepOpen: true, onClick: function () { mode = '2p'; showStart(); } }
    ].concat(DIFFICULTIES.map(function (d) {
      return { label: PRESETS[d].label, keepOpen: true, onClick: function () { setDifficulty(d); showStart(); } };
    }));
    A.ui.overlay({
      title: 'Tennis',
      lines: [mode === 'ai' ? 'Move: mouse, W/S or drag' : 'Left: W/S · Right: ↑/↓ or drag', 'First to ' + WIN_SCORE],
      buttons: buttons,
      hint: A.touch.isCoarse() ? 'Tap to serve' : 'Space to serve',
      action: newMatch
    });

    // Dress the shell's button row: mode on one line, difficulty on the next, current choices lit.
    var btns = document.querySelectorAll('.arcade-overlay .arcade-btn');
    var rowBreak = document.createElement('span');
    rowBreak.style.cssText = 'flex-basis:100%;height:0';
    btns[1].parentNode.insertBefore(rowBreak, btns[2]);
    Array.prototype.forEach.call(btns, function (btn, i) {
      var on = i < 2 ? i === (mode === 'ai' ? 0 : 1) : DIFFICULTIES[i - 2] === difficulty;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { btn.style.borderColor = T.brass; btn.style.color = T.brassHi; btn.style.background = T.surface2; }
      if (i >= 2 && mode === '2p') btn.style.opacity = '0.45';   // difficulty only matters against the AI
    });
    // A click or tap anywhere on the card except its buttons starts the match too.
    document.querySelector('.arcade-overlay-box').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.arcade-btn')) return;
      A.ui.hideOverlay();
      newMatch();
    });
    fitOverlay();
    refreshHud();
  }

  // On a phone the court is short and the shell's roomy card can be taller than it: tighten the spacing.
  function fitOverlay() {
    var o = document.querySelector('.arcade-overlay'), box = o.querySelector('.arcade-overlay-box');
    if (box.offsetHeight <= o.clientHeight) return;
    function each(sel, fn) { Array.prototype.forEach.call(box.querySelectorAll(sel), fn); }
    box.style.padding = '4px 12px';
    each('.arcade-overlay-title', function (e) { e.style.marginBottom = '4px'; });
    each('.arcade-overlay-line', function (e) { e.style.fontSize = '15px'; e.style.margin = '2px 0'; });
    each('.arcade-overlay-buttons', function (e) { e.style.marginTop = '8px'; e.style.gap = '6px 8px'; });
    each('.arcade-btn', function (e) { e.style.padding = '5px 12px'; });
    each('.arcade-overlay-hint', function (e) { e.style.marginTop = '8px'; });
  }

  function setDifficulty(d) {
    difficulty = d;
    A.store.set('difficulty', d);
  }

  function refreshHud() {
    if (mode === 'ai') A.ui.hud({ AI: PRESETS[difficulty].label, Streak: A.store.get('streak', 0) | 0, Best: A.store.get('best', 0) | 0 });
    else A.ui.hud({ Mode: '2 players' });
  }

  function showResults() {
    var leftWon = score[LEFT] > score[RIGHT];
    var result = Math.max(score[LEFT], score[RIGHT]) + '–' + Math.min(score[LEFT], score[RIGHT]);
    var lines = ['Longest rally ' + longestRally];
    var buttons = [{ label: 'Rematch', onClick: newMatch }];
    var title;
    if (mode === 'ai') {
      title = (leftWon ? 'You win ' : 'AI wins ') + result;
      lines.push('Win streak vs AI: ' + (A.store.get('streak', 0) | 0));
      buttons.push({ label: 'Copy result', keepOpen: true, onClick: function () { A.share.copy(shareText()); } });
    } else {
      title = (leftWon ? 'Left wins ' : 'Right wins ') + result;
    }
    A.ui.overlay({ kicker: 'Match over', title: title, lines: lines, buttons: buttons });
    fitOverlay();
  }

  // 🏓 Beat the AI (Normal) 7–4 · longest rally 23   /   🏓 Lost to the AI (Hard) 5–7 · longest rally 31
  function shareText() {
    return '🏓 ' + (score[LEFT] > score[RIGHT] ? 'Beat' : 'Lost to') + ' the AI (' + PRESETS[difficulty].label + ') ' +
      score[LEFT] + '–' + score[RIGHT] + ' · longest rally ' + longestRally;
  }

  // ---------------------------------------------------------------- match flow
  function newMatch() {
    score[LEFT] = 0; score[RIGHT] = 0;
    pop[LEFT] = 0; pop[RIGHT] = 0;
    left.y = right.y = (H - PADDLE_HEIGHT) / 2;
    left.flash = right.flash = 0;
    longestRally = 0;
    aiReset();
    refreshHud();
    beginServe(Math.random() < 0.5 ? LEFT : RIGHT);
  }

  // R: restart the match in progress (on the start screen there is nothing to restart).
  function onRestart() {
    if (phase === 'start') showStart(); else newMatch();
  }

  // The shell's pause overlay replaces ours; put our own screen back afterwards.
  function onPauseChange(paused) {
    if (paused) return;
    if (phase === 'start') showStart();
    else if (phase === 'over') showResults();
  }

  // The ball waits on the server's side, then goes toward the player who conceded.
  function beginServe(side) {
    server = side;
    phase = 'serve'; phaseT = 0;
    rallyHits = 0;
    banner.t = 0;
    trail.length = 0; trailT = 0;
    ai.incoming = false;
    ball.x = side === LEFT ? W / 4 : W * 3 / 4;
    ball.y = H / 2;
    ball.vx = 0; ball.vy = 0;
  }

  function launch() {
    var a = (Math.random() * 2 - 1) * SERVE_SPREAD;
    ball.vx = (server === LEFT ? 1 : -1) * BALL_SPEED0 * Math.cos(a);
    ball.vy = BALL_SPEED0 * Math.sin(a);
    phase = 'rally'; phaseT = 0;
  }

  function pointTo(side) {
    score[side]++;
    pop[side] = POP_TIME;
    if (rallyHits > longestRally) longestRally = rallyHits;
    if (rallyHits > 0) A.store.best('longestRally', rallyHits);
    if (mode === 'ai') aiAdapt();
    A.sfx.play(mode === 'ai' && side === RIGHT ? 'lose' : 'score');
    server = side;
    phase = 'point'; phaseT = 0;
  }

  function endMatch() {
    phase = 'over';
    A.store.bumpPlays();
    if (mode === 'ai') {                    // streaks are only kept against the AI
      var streak = score[LEFT] > score[RIGHT] ? (A.store.get('streak', 0) | 0) + 1 : 0;
      A.store.set('streak', streak);
      if (streak > 0) A.store.best('best', streak);
    }
    refreshHud();
    showResults();
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

  // ---------------------------------------------------------------- AI paddle
  function aiReset() {
    var p = PRESETS[difficulty];
    AI_KEYS.forEach(function (k) { ai[k] = p[k]; });
    ai.incoming = false;
  }

  // Light touch, after each point: only when someone leads by two or more, the AI
  // moves one notch toward whoever is behind, within 40% of its preset.
  function aiAdapt() {
    var diff = score[LEFT] - score[RIGHT];
    var dir = diff >= 2 ? 1 : diff <= -2 ? -1 : 0;
    if (!dir) return;
    var p = PRESETS[difficulty];
    AI_KEYS.forEach(function (k) {
      ai[k] = clamp(ai[k] + dir * AI_HARDER[k], p[k] * (1 - AI_ADAPT_LIMIT), p[k] * (1 + AI_ADAPT_LIMIT));
    });
  }

  // Where the ball will be when it reaches the AI's paddle face, following it off the walls.
  function predictY() {
    var t = Math.max(0, (RIGHT_FACE - BALL_R - ball.x) / ball.vx);
    var y = ball.y + ball.vy * t, lo = BALL_R, hi = H - BALL_R;
    for (var i = 0; i < 32 && (y < lo || y > hi); i++) y = y < lo ? 2 * lo - y : 2 * hi - y;
    return clamp(y, lo, hi);
  }

  function moveAI(dt) {
    var live = phase === 'rally';
    if (live && ball.x + BALL_R > RIGHT_FACE) return;      // already beaten
    var incoming = live && ball.vx > 0;
    if (incoming && !ai.incoming) {                        // a new approach: restart the reaction clock, re-roll the aim
      ai.waited = 0;
      ai.error = (Math.random() * 2 - 1) * ai.errorPx;
    }
    ai.incoming = incoming;
    if (incoming) ai.waited += dt * 1000;

    var speed = ai.maxSpeed * (1 + AI_RALLY_BONUS * Math.floor(rallyHits / 10));
    var target;
    if (incoming && ai.waited >= ai.reactionMs) target = predictY() + ai.error;
    else { target = H / 2; speed *= AI_DRIFT; }

    var d = target - (right.y + PADDLE_HEIGHT / 2);
    if (Math.abs(d) <= AI_DEADZONE) return;
    right.y = clamp(right.y + (d > 0 ? 1 : -1) * Math.min(speed * dt, Math.abs(d)), 0, H - PADDLE_HEIGHT);
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

    rallyHits++;
    p.flash = FLASH_TIME;
    A.sfx.play('hit', rallyHits);                          // pitch climbs with the rally
    if (speed > SHAKE_SPEED && !reducedMotion()) A.fx.shake(2, 80);
    if (rallyHits % RALLY_BANNER_EVERY === 0) { banner.text = 'Rally ' + rallyHits + '!'; banner.t = RALLY_BANNER_TIME; }
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
    if (ball.y < BALL_R && ball.vy < 0) { ball.y = 2 * BALL_R - ball.y; ball.vy = -ball.vy; A.sfx.play('tick'); }
    else if (ball.y > H - BALL_R && ball.vy > 0) { ball.y = 2 * (H - BALL_R) - ball.y; ball.vy = -ball.vy; A.sfx.play('tick'); }
    ball.y = clamp(ball.y, BALL_R, H - BALL_R);

    // Paddles: hit only on the frame the ball's edge crosses the paddle's face.
    if (ball.vx < 0 && prevX - BALL_R >= LEFT_FACE && ball.x - BALL_R < LEFT_FACE) {
      if (onPaddle(left)) bounce(left, 1);
    } else if (ball.vx > 0 && prevX + BALL_R <= RIGHT_FACE && ball.x + BALL_R > RIGHT_FACE) {
      if (onPaddle(right)) bounce(right, -1);
    }
    if (ball.x - BALL_R < LEFT_FACE) yieldToBall(left);
    if (ball.x + BALL_R > RIGHT_FACE) yieldToBall(right);

    trailT += dt;
    if (reducedMotion()) trail.length = 0;
    else if (trailT >= TRAIL_STEP) {
      trailT = 0;
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    }

    if (ball.x < -BALL_R) pointTo(RIGHT);
    else if (ball.x > W + BALL_R) pointTo(LEFT);
  }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (phase === 'start' || phase === 'over') return;

    left.flash = Math.max(0, left.flash - dt);
    right.flash = Math.max(0, right.flash - dt);
    pop[LEFT] = Math.max(0, pop[LEFT] - dt);
    pop[RIGHT] = Math.max(0, pop[RIGHT] - dt);
    banner.t = Math.max(0, banner.t - dt);

    movePlayers(dt);
    if (mode === 'ai') moveAI(dt);

    phaseT += dt;
    if (phase === 'serve') {
      if (phaseT >= SERVE_PAUSE || A.input.wasPressed('Space')) launch();
    } else if (phase === 'rally') {
      stepBall(dt);
    } else if (phase === 'point' && phaseT >= POINT_PAUSE) {
      if (Math.max(score[LEFT], score[RIGHT]) >= WIN_SCORE) endMatch();
      else beginServe(server);
    }
  }

  function drawScore(c, side, x) {
    var big = phase === 'serve';
    var size = (big ? 120 : 56) * (pop[side] > 0 ? POP_SCALE : 1);
    A.ui.text(c, String(score[side]), x, big ? 150 : 64, { size: size, align: 'center', baseline: 'middle', color: big ? T.text : T.muted });
  }

  function drawPaddle(c, p, x, color) {
    c.fillStyle = p.flash > 0 ? T.white : color;
    c.fillRect(x, p.y, PADDLE_WIDTH, PADDLE_HEIGHT);
  }

  function draw(c) {
    var i;
    c.fillStyle = T.bgDeep;
    c.fillRect(0, 0, W, H);

    // Net, with the rally counter underneath it
    c.save();
    c.strokeStyle = T.line; c.lineWidth = 4; c.setLineDash([16, 14]);
    c.beginPath(); c.moveTo(W / 2, 8); c.lineTo(W / 2, H - 52); c.stroke();
    c.restore();
    if (rallyHits > 0 && (phase === 'rally' || phase === 'point')) {
      A.ui.text(c, 'Rally ' + rallyHits, W / 2, H - 26, { size: 18, align: 'center', baseline: 'middle', color: T.muted });
    }

    drawScore(c, LEFT, W / 4);
    drawScore(c, RIGHT, W * 3 / 4);

    if (phase === 'serve' && Math.max(score[LEFT], score[RIGHT]) === WIN_SCORE - 1) A.ui.banner(c, 'Match point', { color: T.coral });
    if (banner.t > 0) A.ui.banner(c, banner.text);

    // Trail under the paddles, ball on top.
    var live = phase === 'serve' || phase === 'rally';
    if (live) {
      c.fillStyle = T.text;
      for (i = 0; i < trail.length; i++) {
        c.globalAlpha = 0.05 + 0.25 * (i + 1) / (trail.length + 1);
        c.beginPath(); c.arc(trail[i].x, trail[i].y, BALL_R * (0.5 + 0.5 * (i + 1) / (trail.length + 1)), 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }

    drawPaddle(c, left, 0, T.magenta);
    drawPaddle(c, right, W - PADDLE_WIDTH, T.blue);

    if (live) {
      c.fillStyle = T.text;
      c.beginPath(); c.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); c.fill();
    }
  }

  // ---------------------------------------------------------------- boot
  A.init({ game: 'tennis', title: 'Tennis', onRestart: onRestart, onPauseChange: onPauseChange });
  A.input.capture(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space']);
  A.input.onPointerMove(function (p, id) {
    if (!A.input.pointers[id]) { hover.t = performance.now(); hover.y = p.y; }
  });
  A.touch.buttons([{ label: '▲', code: 'PadUp' }, { label: '▼', code: 'PadDown' }], 'left');

  var saved = A.store.get('difficulty', 'normal');
  if (DIFFICULTIES.indexOf(saved) >= 0) difficulty = saved;

  showStart();
  A.loop(update, draw);
})();
