# Tennis

A Pong-style tennis match for the browser. First to 7, against an AI that adapts to you or against a second player on the same keyboard or screen.

Play it: https://alikonainofficial.github.io/Tennis_Game/

## Controls

| | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Left paddle | `W` / `S` (the arrow keys work too against the AI) | move the pointer over the court | drag on the left half, or hold ▲ / ▼ |
| Right paddle (2 players) | `↑` / `↓` | | drag on the right half |

- `Space` starts the match and skips the short pause before each serve.
- `P` or `Esc` pauses. `R` restarts the match.
- The mouse takes over the left paddle while it is moving; half a second after it stops, the keys work again.

Where the ball meets your paddle sets its angle: the middle sends it back flat, the edges send it off at up to 60°. Every hit makes the ball 4% faster, up to 2.4 times the serve speed. The winner of a point serves the next one toward the player who lost it.

## Difficulty

Pick Easy, Normal or Hard on the start screen. The choice is remembered.

The presets differ in how long the AI takes to react, how fast its paddle moves and how far off its aim can be. During a match it also adjusts a little: whenever one side leads by two points or more, it tightens up or eases off by one notch per point, never more than 40% away from the preset, and it starts each match back at the preset. Long rallies make it 2% faster for every 10 hits.

## 2 players

Choose "2 players" on the start screen. The left player uses `W` / `S` and the right player uses `↑` / `↓`. On a touch screen each player drags on their own half.

## What is saved

Everything is kept in your browser's `localStorage`. Nothing is sent anywhere.

| Key | What it holds |
| --- | --- |
| `arcade.tennis.streak` | current win streak against the AI |
| `arcade.tennis.best` | longest win streak against the AI |
| `arcade.tennis.difficulty` | `easy`, `normal` or `hard` |
| `arcade.tennis.longestRally` | longest rally ever, in hits |
| `arcade.tennis.plays` | matches played to the end |

The streak goes up by one for each match you win against the AI and back to zero when you lose one. 2-player matches leave the streak alone.

After a match against the AI, "Copy result" copies a line such as `🏓 Beat the AI (Normal) 7–4 · longest rally 23`.

## Development

A plain static site with no build step: `index.html`, `js/game.js`, `css/game.css` and the arcade shell (`js/arcade-shell.js`, `css/arcade-shell.css`). The shell is shared with the other arcade games, so change it there rather than in this repo. To run it locally, open `index.html` in a browser or serve the folder with any static file server.
