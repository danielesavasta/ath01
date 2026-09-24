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
    }
  }
};
