# Owl section · tetradrachm

A scanned Athenian owl (5th c. BC) that visitors can grab, throw and look at closely.
three.js for rendering, cannon-es for physics, both vendored in `lib/` so the installation runs offline.

## How it behaves

- **Play view.** Camera under a glass table. A closed hand on the coin picks it up; opening the hand throws it with the hand's speed. It flips, falls back onto the glass and settles with its face upright for the viewer. Which face lands (Athena or owl) stays random.
- **Statue.** The opaque part of `assets/athenaStatue.png` becomes an invisible block: the coin bounces off Athena, and a strong throw goes over her head to the other side.
- **Close-up.** After `idle` seconds without a grab the camera moves in, framing the coin in the free zone beside the statue. Rings appear on the features; an open hand resting on a ring opens its card. Nobody touching it: the coin floats slowly and every `turnEvery` seconds turns to show the other face.
- **Turning vs throwing in the close-up.** Same gesture, two speeds: move slowly and the coin turns in your hand; flick fast and it is thrown, the camera pulls back.

## Wiring

- `js/scripts.js` sends every camera frame as a `ath:hands` event: `{ width, height, hands: [{ x, y, open, label }] }`, x and y 0..1 of the video frame, already mirrored.
- `js/sections.js` switches between the letter menu and this section (open hand on the owl for 1.5 s), maps hands to the coin stage and returns to the menu after 25 s without hands.
- `js/coin/coin.js` exports `createCoin(options)`; the returned object has `start()`, `stop()`, `setHands(list)`, `set(name, value)`, `toss()`, `reset()`, `enterInspect()`. Parameters and their defaults are in `DEFAULTS`.

## Keys while developing

`O` open the owl section · `M` back to the menu · `D` controls panel · `Space` toss · `I` close-up · `Esc` leave the close-up · `F` flip the coin in your hand. The mouse works like a hand: press = closed hand.
`index.htm?lite` skips the 5 MB model and uses a plain disc.

## Credits

Model: "An Athenian tetradrachm" by Classics and Ancient History at Warwick, CC BY 4.0 (`assets/coin/LICENSE.txt`). This credit must appear in the exhibition.
Info texts: CoinWeek, "The Tetradrachms of Athens (and Athena)"; Cleveland Museum of Art 1941.296. To be checked by the museum before opening.
