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
    upOnly: 70,        // a hand counts only if it points up, at most this many degrees from vertical (180: any)

    // Kinect depth (tools/kinect/bridge.py; the page uses it when the bridge runs). The Kinect hangs on the
    // wall facing the visitors; learn the empty room once (K, Kamera). Millimetres.
    depth: {
      near: 500,       // nearer than this is ignored
      far: 4000,       // further than this is ignored
      reach: 220,      // a hand counts when it is this much nearer to the wall than its owner's body
      margin: 120,     // how much nearer than the empty room something must be to count as a person
      push: 120        // pushing a hand this much towards the wall closes it (grabs the coin)
    }
  },

  // cloth parts the Craft section lights on the statue (setup screen: "Kumaş parçaları").
  // Their words are in content/texts.js (craft.parts), matched by id; photos in assets/craft/<id>.jpg.
  parts: [
      { id: 'chiton',   points: [[755, 620], [815, 615], [840, 690], [875, 770], [890, 840], [930, 880], [970, 910], [940, 940], [850, 1000], [760, 1030], [740, 840], [735, 700]] },
      { id: 'aegis',    points: [[815, 615], [900, 580], [1040, 580], [1055, 700], [1045, 860], [1025, 905], [970, 905], [930, 880], [890, 840], [875, 770], [840, 690]] },
      { id: 'himation', points: [[1040, 580], [1110, 580], [1150, 640], [1175, 740], [1195, 840], [1200, 910], [1150, 920], [1100, 960], [1060, 940], [1045, 860], [1055, 700]] },
      { id: 'roll',     points: [[760, 1045], [890, 975], [1000, 915], [1040, 910], [1070, 940], [1060, 980], [970, 1030], [870, 1075], [765, 1080]] }
  ]
};
