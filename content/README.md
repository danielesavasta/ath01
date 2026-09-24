# content/

Files meant to be edited without touching the code.

- `texts.js`: every word a visitor reads, in each language (menu, hints, the tally, the coin's info cards).
- `venue.js`: settings for the room. Where the real statue stands in the projection (a black mask so
  nothing is projected onto her, or filled with light so the projector lights her), whether the statue photo is shown, which part of the camera image is
  used and how picky the hand detection is. Set it up on the running page with `K`, then use
  *Dosyaya kaydet* and put the downloaded `venue.js` here.

At the venue: `K` → *Heykel maskesi*: turn the mask on and the photo off, then drag the points until the
black shape covers the statue with a little margin. To light the statue from the projector instead, tick *Heykeli projektörle aydınlat*
and set the colour, brightness, edge softness and direction (brighter at the top or the bottom). → *Kamera*: frame the area where visitors' hands move.
Changes are live and kept in that browser; saving the file keeps them for good.
