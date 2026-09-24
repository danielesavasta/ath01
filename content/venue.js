// Settings for one room: where the real statue stands in the projection, which part of the camera
// image to watch, and how picky the hand detection is.
//
// You don't need to edit this by hand. At the venue press K on the running page: the setup screen
// changes everything live and keeps it in this browser. Its "Save file" button downloads a new
// venue.js; put it here (content/venue.js) so the settings survive a new browser or computer.
//
// Positions are in pixels of the 1920×1080 frame the installation is drawn in.

window.VENUE_FILE = {
  // the statue photo in the middle, for working without the real statue
  statueImage: true,

  // black shape over the real statue, so nothing is projected onto it (coin, hands, letters)
  // (with light.on, the shape is filled with light instead)
  mask: {
    on: false,
    points: [[905, 150], [830, 380], [848, 520], [719, 600], [701, 1080], [1226, 1080], [1238, 920],
             [1200, 700], [1138, 580], [1008, 540], [1063, 420], [1048, 260], [990, 150]],

    // the projector lights the statue through the same shape
    light: {
      on: false,
      color: "#fff1dc",   // warm white
      level: 0.55,        // brightness, 0..1
      soft: 12,           // softened edge, pixels (the glow spills a little past the shape)
      slope: 0.3          // 0 even; towards 1 brighter at the top, towards -1 brighter at the bottom
    }
  },

  // the part of the camera image mapped onto the screen: zoom 1 = the whole width,
  // 2 = half the width (people further away look twice as big to the hand detector).
  // cx, cy: its centre, 0..1 of the (mirrored) camera image.
  camera: { zoom: 1, cx: 0.5, cy: 0.5 },

  detect: {
    confidence: 0.6,   // 0.3 finds more hands (and more false ones), 0.8 only clear ones
    upOnly: 70         // a hand counts only if it points up, at most this many degrees from vertical (180: any)
  }
};
