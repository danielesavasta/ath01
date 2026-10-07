// Every word a visitor reads in the installation, in each language.
//
// Edit the text between the quotes and save; reload the page to see it.
//  · Keep the quotes, the colons and the commas at line ends.
//  · A quote inside a text needs a backslash: \"  (or use “curly quotes”, as below).
//  · Every language has the same keys. If a text is missing in one language, the Turkish one is shown.
//  · To add a language: add it to `languages` and copy the whole `en: { ... }` block under a new code.
//
// The positions of the rings on the coin are in js/coin/coin.js (HOTSPOTS); here are only their words,
// matched by the same names (olive, helmet, ...).

export default {
  // first entry is the language every new visitor starts with
  languages: [
    { code: "tr", short: "TR", name: "Türkçe" },
    { code: "en", short: "EN", name: "English" }
  ],

  tr: {
    menu: {
      back: "ANA SAYFA"
    },

    owl: {
      tally: { athena: "ATHENA", owl: "BAYKUŞ" },
      hint: {
        play: "Sikkeyi avucunla yakala, havaya savur, bırak.\nAthena mı gelecek, baykuş mu?",
        // with the Kinect's depth (no fingers): push the hand towards the wall to hold the coin
        playPush: "Sikkeyi tutmak için elini duvara doğru it.\nSavur, elini geri çek: Athena mı, baykuş mu?",
        inspect: "Elini beyaz bir halkanın üstünde biraz tut, hikâyesi açılsın.\nSikkeyi yakalayıp yavaşça çevirebilir, hızla savurup yeniden atabilirsin."
      },
      loading: "Sikke hazırlanıyor",
      loadFailed: "Sikke yüklenemedi",
      cards: {
        olive:   { title: "ZEYTİN YAPRAKLARI", text: "Miğferin önünde üç zeytin yaprağı. Pers Savaşları'ndan sonra basılan sikkelerde görülür; zeytin hem Athena'nın hem Atina'nın işareti." },
        helmet:  { title: "MİĞFER",            text: "Attika tipi bir miğfer, üstünde sarmal bir palmet süsü. Savaşın tanrıçası, barışın yaprağıyla birlikte." },
        eye:     { title: "GÖZ",               text: "Yüz yandan, göz önden çizilmiş. Arkaik sanattan kalma bir alışkanlık: Athena yana dönük ama sana bakıyor." },
        earring: { title: "KÜPE",              text: "Kulağında yuvarlak bir küpe. Savaş tanrıçası, ama süsünü de ihmal etmiyor." },
        owl:     { title: "BAYKUŞ",            text: "Athena'nın kuşu adını hâlâ taşıyor: kukumavın bilimsel adı Athene noctua. Başı sana dönük, gövdesi yandan." },
        ethe:    { title: "ΑΘΕ",               text: "ΑΘΕΝΑΙΟΝ'un kısaltması, yani “Atinalıların”. Sikkenin üstündeki tek yazı bu." },
        branch:  { title: "ZEYTİN DALI VE HİLAL", text: "Baykuşun arkasında bir zeytin dalı ve küçük bir hilal. Hilalin, MÖ 480'de hilal ay altında kazanılan Salamis Savaşı'nı andığı düşünülür." },
        silver:  { title: "GÜMÜŞ",             text: "Dört drahmi, yani yaklaşık 17 gram gümüş. Gümüşü Atina yakınlarındaki Laurion madenlerinden çıkıyordu." }
      }
    },

    egg: {
      hint: "Bir hikaye okumak için elinizi eserin üzerine koyun.",
      noImage: "Buraya henüz bir görsel eklenmedi"
    },

    // one sentence appears every few arrows turned to stone, in this order
    war: {
      tally: "TAŞ",
      hint: "Elini kaldır,\nkıpırdatmadan tut.",
      lines: [
        "Ares savaşın öfkesidir, Athena savaşın aklıdır.",
        "Göğsündeki aigis'te Medusa'nın başı vardır; saldırmak için değil, uzak tutmak için.",
        "Ona Promachos derlerdi: en önde duran.",
        "Miğferi yüzüne indirilmemiş, başına itilmiştir. Savaşta değil, nöbettedir."
      ]
    },

    // DRAFT: which garments these are must be checked with the museum before the opening.
    // One entry per part in content/venue.js (same id); photo in assets/craft/<id>.jpg.
    craft: {
      hint: "Elini heykelin önünde gezdir,\nbir parçanın üstünde bekle.",
      parts: {
        chiton:   { title: "KİTON",    greek: "χιτών",   text: "En altta giyilen ince giysi. Sık ve keskin kıvrımlar hafif bir kumaşı taklit eder." },
        aegis:    { title: "AİGİS",    greek: "αἰγίς",   text: "Göğsü örten pullu deri. Ortasında Medusa'nın başı, kenarında kıvrılan yılanlar." },
        himation: { title: "HİMATİON", greek: "ἱμάτιον", text: "Omuzdan aşağı dökülen kalın örtü. Kıvrımları kitonunkilerden daha derin ve ağır." },
        roll:     { title: "KIVRIM",   greek: "",        text: "Örtünün kalçadan geçen, sarılmış kenarı." }
      }
    },

    // DRAFT: one sentence after another while the olive grows (js/mind.js); the drawings follow the sentences
    mind: {
      species: "Olea europaea",
      lines: [
        "Athena'nın gücü kaba kuvvet değil, mētis'tir: kurnaz ve pratik akıl.",
        "Poseidon Atina'ya tuzlu bir su kaynağı verdi, Athena bir zeytin ağacı. Kazanan zeytin oldu.",
        "Odysseus'un yirmi yıl boyunca yanında oldu. İkisi de zekâyla kazanır.",
        "Odysseus, Kyklops'u zeytin ağacından bir kazıkla kör etti.",
        "Yatağını canlı bir zeytin ağacının gövdesine kurdu. Eve döndüğünde Penelope onu bu yataktan tanıdı."
      ]
    }
  },

  en: {
    menu: {
      back: "HOME"
    },

    owl: {
      tally: { athena: "ATHENA", owl: "OWL" },
      hint: {
        play: "Catch the coin in your fist, flick it up and let go.\nWill it land on Athena or the owl?",
        playPush: "Push your hand towards the wall to hold the coin.\nFlick it and pull back: Athena or the owl?",
        inspect: "Rest your hand on a white ring to read its story.\nCatch the coin to turn it slowly, or flick it to toss again."
      },
      loading: "Getting the coin ready",
      loadFailed: "The coin could not be loaded",
      cards: {
        olive:   { title: "OLIVE LEAVES", text: "Three olive leaves on the front of the helmet. They appear on coins struck after the Persian Wars; the olive stood for Athena and for Athens." },
        helmet:  { title: "HELMET",       text: "An Attic helmet decorated with a spiral palmette. The goddess of war, wearing the leaf of peace." },
        eye:     { title: "EYE",          text: "The face is in profile, yet the eye is drawn as if seen from the front. A habit from Archaic art: Athena looks sideways, but she is looking at you." },
        earring: { title: "EARRING",      text: "A round earring. A goddess of war who still cares about her jewellery." },
        owl:     { title: "OWL",          text: "Athena's bird still carries her name: the little owl is Athene noctua. Its head turns to you, its body stays in profile." },
        ethe:    { title: "ΑΘΕ",          text: "Short for ΑΘΕΝΑΙΟΝ, “of the Athenians”. The only writing on the coin." },
        branch:  { title: "OLIVE SPRIG AND CRESCENT", text: "Behind the owl, an olive sprig and a small crescent moon. The crescent is thought to recall the Battle of Salamis, won under a crescent moon in 480 BC." },
        silver:  { title: "SILVER",       text: "Four drachmas: about 17 grams of silver, mined at Laurion near Athens." }
      }
    },

    egg: {
      hint: "Rest a hand over an artwork to read about its story.",
      noImage: "No image has been added here yet"
    },

    war: {
      tally: "STONE",
      hint: "Raise your hand\nand hold it still.",
      lines: [
        "Ares is the fury of war. Athena is its intelligence.",
        "On her chest the aegis carries the head of Medusa, worn to keep danger away rather than to attack.",
        "They called her Promachos, the one who stands in front.",
        "Her helmet is pushed back, not lowered. She is not fighting. She is watching."
      ]
    },

    craft: {
      hint: "Move your hand over the statue\nand rest it on a part.",
      parts: {
        chiton:   { title: "CHITON",   greek: "χιτών",   text: "The thin garment worn underneath. Close, sharp folds imitate a light fabric." },
        aegis:    { title: "AEGIS",    greek: "αἰγίς",   text: "The scaled skin over her chest, with Medusa's head at the centre and snakes coiled along the edge." },
        himation: { title: "HIMATION", greek: "ἱμάτιον", text: "The heavy mantle falling from the shoulder. Its folds are deeper and heavier than the chiton's." },
        roll:     { title: "THE ROLL", greek: "",        text: "The rolled edge of the mantle, drawn across the hips." }
      }
    },

    mind: {
      species: "Olea europaea",
      lines: [
        "Athena's power is not force. It is mētis: cunning, practical intelligence.",
        "Poseidon gave Athens a spring of salt water. Athena gave it an olive tree, and the olive won.",
        "She stood by Odysseus for twenty years. Both of them win by thinking.",
        "He blinded the Cyclops with a stake of olive wood.",
        "He built his bed around a living olive tree. When he came home, that bed was how Penelope knew him."
      ]
    }
  }
};
