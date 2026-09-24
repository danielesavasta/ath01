# Owl section · tetradrachm

A scanned Athenian owl (5th c. BC) that visitors can grab, throw and look at closely.
three.js for rendering, cannon-es for physics, both vendored in `lib/` so the installation runs offline.

## How it behaves

- **Play view.** Camera under a glass table. A closed hand on the coin picks it up; opening the hand throws it with the hand's speed. It flips, falls back onto the glass and settles with its face upright for the viewer. Which face lands (Athena or owl) stays random.
- **Statue.** The coin moves freely behind Athena, so the whole width is one table. The close-up still frames the coin in the free area beside her. `statueBlock: true` (panel: "heykel sikkeyi durdursun") turns the opaque part of `assets/athenaStatue.png` into a block the coin bounces off, with `blockHeight` deciding how high a throw must go to pass over her.
- **Close-up.** After `idle` seconds without a grab the camera moves in, framing the coin in the free zone beside the statue. Rings appear on the features; an open hand resting on a ring opens its card. Nobody touching it: the coin floats slowly and every `turnEvery` seconds turns to show the other face.
- **Turning vs throwing in the close-up.** Same gesture, two speeds: move slowly and the coin turns in your hand; flick fast and it is thrown, the camera pulls back.

## Wiring

- `js/scripts.js` sends every camera frame as a `ath:hands` event: `{ width, height, hands: [{ x, y, open, label }] }`, x and y 0..1 of the video frame, already mirrored.
- `js/sections.js` runs the menu and the sections. A hand over a letter rolls it to its icon (only icons whose file exists in `assets/`); resting there for 1.6 s opens the section. Inside, a hand resting on the ANA SAYFA button (bottom left) goes back, and so do 20 s without hands or mouse; the button's ring counts down the last 5 s. On the way back the letters roll to read ATHENA again. Timings are in `T` at the top of the file.
- `js/coin/coin.js` exports `createCoin(options)`; the returned object has `start()`, `stop()`, `setHands(list)`, `set(name, value)`, `toss()`, `reset()`, `enterInspect()`. Parameters and their defaults are in `DEFAULTS`.

## Keys while developing

`O` open the owl section · `M` back to the menu · `D` controls panel · `Space` toss · `I` close-up · `Esc` leave the close-up · `F` flip the coin in your hand. The mouse works like a hand: press = closed hand.
`index.htm?lite` skips the 5 MB model and uses a plain disc.

## Credits

Model: "An Athenian tetradrachm" by Classics and Ancient History at Warwick, CC BY 4.0 (`assets/coin/LICENSE.txt`). This credit must appear in the exhibition.
Info texts: CoinWeek, "The Tetradrachms of Athens (and Athena)"; Cleveland Museum of Art 1941.296. To be checked by the museum before opening.
