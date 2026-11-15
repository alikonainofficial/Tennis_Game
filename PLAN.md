# Tennis (Pong) — implementation plan

Repo: `alikonainofficial/Tennis_Game` · Live: `https://alikonainofficial.github.io/Tennis_Game/` · Game id for storage: `tennis`

## 0. What the repo is today

A single `index.html` with inline JS: 800×600 canvas, `setInterval` at 30 fps, ball `ballSpeedX 10 / ballSpeedY 4` px/frame, paddles 10×100, left paddle follows the mouse, right paddle is an AI (`computerMovement`: moves 6 px/frame whenever its centre is more than 35 px from the ball), first to `WINNING_SCORE 3`, win screen dismissed by click.

Known defects:

- **Bounce angle bug:** `var deltaY = ballY - (paddle2Y + PADDLE_HEIGHT)` measures from the paddle's **bottom edge** (comment says centre). `deltaY` is always ≤ 0, so the ball goes upward after nearly every hit. Same for paddle 1. Must be `paddleY + PADDLE_HEIGHT / 2`.
- **Late collision:** paddle checks run only when `ballX > canvas.width` / `ballX < 0`, i.e. after the ball has passed the paddle face; the ball visibly sinks into the paddle.
- AI has one fixed speed and no reaction delay: never misses straight balls, always misses sharp angles.
- Ball speed never changes in a rally; no sound; no restart key; mouse only; score resets silently.

## 1. Target

Correct physics with accelerating rallies and a rally counter; an adaptive AI with three presets that nudges itself to keep the match close; first-to-7 matches with "match point", results overlay, win streak and a copyable line; optional second human player (W/S); keyboard, mouse and touch.

## 2. File layout after

```
index.html
css/arcade-shell.css  (copied, unmodified)
js/arcade-shell.js    (copied, unmodified)
js/game.js
```

## 3. Steps

### Step 1 — Shell + physics fix
1. Move the JS to `js/game.js`; `Arcade.init({ game: 'tennis', title: 'Tennis', onRestart: newMatch })`; `Arcade.loop(update, draw)`.
2. Units: `BALL_SPEED0 = 330` px/s (≈ 11 px/frame · 30), `PADDLE_SPEED = 540` px/s for keyboard control, AI speed in px/s (see Step 2).
3. Ball as `{x, y, vx, vy, r: 10}`. Serve: direction toward the player who just conceded, angle random in ±25°, speed `BALL_SPEED0`.
4. **Collision at the paddle face:** left paddle face is `x = PADDLE_WIDTH`, right is `x = W − PADDLE_WIDTH`. When the ball crosses the face this frame (`prevX − r ≥ face && x − r < face` for the left, mirror for the right) and `y` is within `[paddleY − r, paddleY + PADDLE_HEIGHT + r]`, reflect and snap `x` to the face.
5. **Angle:** `rel = (ballY − (paddleY + PADDLE_HEIGHT/2)) / (PADDLE_HEIGHT/2)` clamped to ±1; outgoing angle `= rel × 60°`; speed `= min(current × 1.04, BALL_SPEED0 × 2.4)`; set `vx, vy` from angle and speed. Top/bottom walls reflect `vy` and nudge the ball inside.
6. Controls for the left paddle: pointer `y` when a pointer is active (`Arcade.input.pointer.down` or any move in the last 500 ms), otherwise `ArrowUp/ArrowDown` (`W/S` when 2-player). `Arcade.input.capture([...])`. Touch: dragging on the left half moves the left paddle; on the right half the right paddle (2-player only); plus `Arcade.touch.buttons` ▲▼ on the left.
7. Remove the old `setInterval`, `handleMouseClick`, win-screen code.

Acceptance: the ball bounces at the angle you hit it, rallies speed up, nothing sinks into paddles.

### Step 2 — Adaptive AI
1. AI parameters: `reactionMs` (how long after the ball starts moving toward it before it reacts), `maxSpeed` px/s, `errorPx` (target offset chosen per approach, uniform in ±errorPx, re-rolled each time the ball changes direction toward it).
2. Presets: Easy `{320, 300, 70}`, Normal `{180, 420, 40}`, Hard `{80, 560, 15}`. Default Normal; a selector on the start overlay (buttons) persisted in `arcade.tennis.difficulty`.
3. Prediction: when the ball moves toward the AI, predict its `y` at the paddle face by simulating wall bounces; target `= predicted + error`; while the ball moves away, drift back toward centre at 40% speed. Move toward target at `maxSpeed`, with a 12-px dead zone to avoid jitter.
4. **Adaptation (light touch):** after each point, `diff = playerScore − aiScore`. If `diff ≥ 2`: `reactionMs −= 15`, `maxSpeed += 15`, `errorPx −= 4`. If `diff ≤ −2`: the reverse. Clamp within ±40% of the preset values. Never adjust when `|diff| < 2`. Also +2% `maxSpeed` for every 10 rally hits in the current rally (long rallies tighten). Reset to the preset at match start.
5. HUD shows `AI: Normal` (not the live numbers).

Acceptance: a beginner wins points on Easy; a good player can beat Hard; nobody sees the AI "cheat".

### Step 3 — Match structure, rally counter, feel, share
1. First to 7. `phase: 'start' | 'serve' | 'rally' | 'point' | 'over'`. Serve phase: 900 ms pause with the ball on the server's side and the score drawn big; Space skips.
2. Rally counter: hits since serve, drawn small under the net; at 10, 20, 30… `Arcade.ui.banner(ctx, 'Rally 20!')` for 600 ms. Longest rally of the match tracked.
3. "Match point" banner when either side is at 6 (`'Match point'` in coral during the serve pause); "Deuce"-style not needed.
4. Feel: `Arcade.sfx.play('hit', rallyHits)` on paddle hits (pitch rises with the rally), `Arcade.sfx.play('tick')` on walls, `Arcade.sfx.play('score')` / `'lose'` on points; paddle flash (white 80 ms) on hit; `Arcade.fx.shake(2, 80)` when the ball speed is above 1.8× base; ball trail (6 positions); score pop (draw the score at 1.4× for 150 ms). Net: dashed, in `theme.line`.
5. Results overlay: kicker "Match over", title `You win 7–4` / `AI wins 7–2`, lines `Longest rally 23`, `Win streak vs AI: 3` (from `arcade.tennis.streak`, increment on win, reset on loss; `arcade.tennis.best` = longest streak), buttons "Rematch", "Copy result" → `🏓 Beat the AI (Normal) 7–4 · longest rally 23` or `🏓 Lost to the AI (Hard) 5–7 · longest rally 31`.
6. **2-player:** start overlay buttons "vs AI" / "2 players". In 2-player the right paddle is `ArrowUp/ArrowDown` and the left is `W/S`; results say `Left wins 7–5`. No streak/best changes in 2-player.
7. `Arcade.store.bumpPlays()` per completed match.

### Step 4 — Polish and ship
- Start overlay: title "Tennis", lines "Move: mouse, W/S or drag", "First to 7", difficulty buttons, "Space to serve".
- Reduced motion: no shake, no trail.
- README: controls, difficulty, 2-player, streak stored locally.

## 4. Data formats

- `arcade.tennis.best` → number (longest win streak vs AI)
- `arcade.tennis.streak` → number (current)
- `arcade.tennis.difficulty` → `'easy' | 'normal' | 'hard'`
- `arcade.tennis.longestRally` → number (all-time)
- `arcade.tennis.plays` → number
- Share: `🏓 Beat the AI ({Difficulty}) {you}–{ai} · longest rally {n}` / `🏓 Lost to the AI ({Difficulty}) {you}–{ai} · longest rally {n}`

## 5. Test checklist

- [ ] Hitting the ball with the top of the paddle sends it up, bottom sends it down, centre flat
- [ ] Ball never visually enters a paddle; never escapes the court
- [ ] Rally speeds up and caps; pitch rises with rally
- [ ] Easy is winnable by a first-timer; Hard is hard; adaptation only kicks in at a 2-point gap
- [ ] 2-player works on one keyboard; touch drag works on both halves
- [ ] Match point banner at 6; results overlay; streak and best persist; copy string correct
- [ ] `R` restarts the match; `P` pauses; no console errors
