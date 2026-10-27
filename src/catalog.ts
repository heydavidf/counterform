// Offline font inventory. Files and axes are verified against the bundled sfnt tables.
// Provenance and SHA-256 hashes: public/fonts/manifest.json. Each family includes its OFL.
export type FontEntry = {
  id: string;
  name: string;
  category: "serif" | "sans" | "display" | "mono";
  designer: string;
  description: string;
  files: { path: string; style: "normal" | "italic"; weight: string }[];
  axes?: { tag: string; min: number; max: number; default: number }[];
  licensePath: string;
  source: string;
};

export type Pairing = {
  id: string;
  name: string;
  display: string;
  body: string;
  support: string;
  rationale: string;
};

export const fonts: FontEntry[] = [
  {
    id: "source-serif-4",
    name: "Source Serif 4",
    category: "serif",
    designer: "Frank Grießhammer",
    description:
      "A sturdy reading serif with optical sizes that adapt its details from text to headlines.",
    files: [
      {
        path: "fonts/source-serif-4/normal.ttf",
        style: "normal",
        weight: "200 900",
      },
      {
        path: "fonts/source-serif-4/italic.ttf",
        style: "italic",
        weight: "200 900",
      },
    ],
    licensePath: "fonts/source-serif-4/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/sourceserif4",
    axes: [
      {
        tag: "wght",
        min: 200.0,
        default: 400.0,
        max: 900.0,
      },
      {
        tag: "opsz",
        min: 8.0,
        default: 20.0,
        max: 60.0,
      },
    ],
  },
  {
    id: "source-sans-3",
    name: "Source Sans 3",
    category: "sans",
    designer: "Paul D. Hunt",
    description:
      "Open, humanist shapes for clear navigation, captions, and long stretches of screen text.",
    files: [
      {
        path: "fonts/source-sans-3/normal.ttf",
        style: "normal",
        weight: "200 900",
      },
      {
        path: "fonts/source-sans-3/italic.ttf",
        style: "italic",
        weight: "200 900",
      },
    ],
    licensePath: "fonts/source-sans-3/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/sourcesans3",
    axes: [
      {
        tag: "wght",
        min: 200.0,
        default: 200.0,
        max: 900.0,
      },
    ],
  },
  {
    id: "fraunces",
    name: "Fraunces",
    category: "display",
    designer: "Undercase Type, Phaedra Charles, Flavia Zimbardi",
    description:
      "An expressive soft serif with optical size, softness, and wonk controls for distinctive headlines.",
    files: [
      {
        path: "fonts/fraunces/normal.ttf",
        style: "normal",
        weight: "100 900",
      },
      {
        path: "fonts/fraunces/italic.ttf",
        style: "italic",
        weight: "100 900",
      },
    ],
    licensePath: "fonts/fraunces/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/fraunces",
    axes: [
      {
        tag: "opsz",
        min: 9.0,
        default: 9.0,
        max: 144.0,
      },
      {
        tag: "wght",
        min: 100.0,
        default: 900.0,
        max: 900.0,
      },
      {
        tag: "SOFT",
        min: 0.0,
        default: 0.0,
        max: 100.0,
      },
      {
        tag: "WONK",
        min: 0.0,
        default: 1.0,
        max: 1.0,
      },
    ],
  },
  {
    id: "manrope",
    name: "Manrope",
    category: "sans",
    designer: "Mikhail Sharanda",
    description:
      "A precise geometric sans with open counters and a calm, contemporary rhythm.",
    files: [
      {
        path: "fonts/manrope/normal.ttf",
        style: "normal",
        weight: "200 800",
      },
    ],
    licensePath: "fonts/manrope/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/manrope",
    axes: [
      {
        tag: "wght",
        min: 200.0,
        default: 200.0,
        max: 800.0,
      },
    ],
  },
  {
    id: "dm-sans",
    name: "DM Sans",
    category: "sans",
    designer: "Colophon Foundry",
    description:
      "A low-contrast sans with optical sizing that moves comfortably between interface and editorial work.",
    files: [
      {
        path: "fonts/dm-sans/normal.ttf",
        style: "normal",
        weight: "100 1000",
      },
      {
        path: "fonts/dm-sans/italic.ttf",
        style: "italic",
        weight: "100 1000",
      },
    ],
    licensePath: "fonts/dm-sans/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/dmsans",
    axes: [
      {
        tag: "opsz",
        min: 9.0,
        default: 9.0,
        max: 40.0,
      },
      {
        tag: "wght",
        min: 100.0,
        default: 400.0,
        max: 1000.0,
      },
    ],
  },
  {
    id: "dm-serif-display",
    name: "DM Serif Display",
    category: "display",
    designer: "Colophon Foundry",
    description:
      "A high-contrast display serif with generous curves; use its single weight at headline sizes.",
    files: [
      {
        path: "fonts/dm-serif-display/normal-400.ttf",
        style: "normal",
        weight: "400",
      },
      {
        path: "fonts/dm-serif-display/italic-400.ttf",
        style: "italic",
        weight: "400",
      },
    ],
    licensePath: "fonts/dm-serif-display/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/dmserifdisplay",
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    category: "sans",
    designer: "Mike Abbink, Bold Monday",
    description:
      "Humanist details meet engineered proportions, with variable width for compact or open settings.",
    files: [
      {
        path: "fonts/ibm-plex-sans/normal.ttf",
        style: "normal",
        weight: "100 700",
      },
      {
        path: "fonts/ibm-plex-sans/italic.ttf",
        style: "italic",
        weight: "100 700",
      },
    ],
    licensePath: "fonts/ibm-plex-sans/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/ibmplexsans",
    axes: [
      {
        tag: "wght",
        min: 100.0,
        default: 400.0,
        max: 700.0,
      },
      {
        tag: "wdth",
        min: 75.0,
        default: 100.0,
        max: 100.0,
      },
    ],
  },
  {
    id: "ibm-plex-serif",
    name: "IBM Plex Serif",
    category: "serif",
    designer: "Mike Abbink, Bold Monday",
    description:
      "A robust text serif that shares the Plex family’s distinctive curves and practical proportions.",
    files: [
      {
        path: "fonts/ibm-plex-serif/normal-100.ttf",
        style: "normal",
        weight: "100",
      },
      {
        path: "fonts/ibm-plex-serif/italic-100.ttf",
        style: "italic",
        weight: "100",
      },
      {
        path: "fonts/ibm-plex-serif/normal-200.ttf",
        style: "normal",
        weight: "200",
      },
      {
        path: "fonts/ibm-plex-serif/italic-200.ttf",
        style: "italic",
        weight: "200",
      },
      {
        path: "fonts/ibm-plex-serif/normal-300.ttf",
        style: "normal",
        weight: "300",
      },
      {
        path: "fonts/ibm-plex-serif/italic-300.ttf",
        style: "italic",
        weight: "300",
      },
      {
        path: "fonts/ibm-plex-serif/normal-400.ttf",
        style: "normal",
        weight: "400",
      },
      {
        path: "fonts/ibm-plex-serif/italic-400.ttf",
        style: "italic",
        weight: "400",
      },
      {
        path: "fonts/ibm-plex-serif/normal-500.ttf",
        style: "normal",
        weight: "500",
      },
      {
        path: "fonts/ibm-plex-serif/italic-500.ttf",
        style: "italic",
        weight: "500",
      },
      {
        path: "fonts/ibm-plex-serif/normal-600.ttf",
        style: "normal",
        weight: "600",
      },
      {
        path: "fonts/ibm-plex-serif/italic-600.ttf",
        style: "italic",
        weight: "600",
      },
      {
        path: "fonts/ibm-plex-serif/normal-700.ttf",
        style: "normal",
        weight: "700",
      },
      {
        path: "fonts/ibm-plex-serif/italic-700.ttf",
        style: "italic",
        weight: "700",
      },
    ],
    licensePath: "fonts/ibm-plex-serif/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/ibmplexserif",
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    category: "mono",
    designer: "Mike Abbink, Bold Monday",
    description:
      "Even character widths and expressive details for code, labels, and technical annotations.",
    files: [
      {
        path: "fonts/ibm-plex-mono/normal-100.ttf",
        style: "normal",
        weight: "100",
      },
      {
        path: "fonts/ibm-plex-mono/italic-100.ttf",
        style: "italic",
        weight: "100",
      },
      {
        path: "fonts/ibm-plex-mono/normal-200.ttf",
        style: "normal",
        weight: "200",
      },
      {
        path: "fonts/ibm-plex-mono/italic-200.ttf",
        style: "italic",
        weight: "200",
      },
      {
        path: "fonts/ibm-plex-mono/normal-300.ttf",
        style: "normal",
        weight: "300",
      },
      {
        path: "fonts/ibm-plex-mono/italic-300.ttf",
        style: "italic",
        weight: "300",
      },
      {
        path: "fonts/ibm-plex-mono/normal-400.ttf",
        style: "normal",
        weight: "400",
      },
      {
        path: "fonts/ibm-plex-mono/italic-400.ttf",
        style: "italic",
        weight: "400",
      },
      {
        path: "fonts/ibm-plex-mono/normal-500.ttf",
        style: "normal",
        weight: "500",
      },
      {
        path: "fonts/ibm-plex-mono/italic-500.ttf",
        style: "italic",
        weight: "500",
      },
      {
        path: "fonts/ibm-plex-mono/normal-600.ttf",
        style: "normal",
        weight: "600",
      },
      {
        path: "fonts/ibm-plex-mono/italic-600.ttf",
        style: "italic",
        weight: "600",
      },
      {
        path: "fonts/ibm-plex-mono/normal-700.ttf",
        style: "normal",
        weight: "700",
      },
      {
        path: "fonts/ibm-plex-mono/italic-700.ttf",
        style: "italic",
        weight: "700",
      },
    ],
    licensePath: "fonts/ibm-plex-mono/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/ibmplexmono",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    category: "sans",
    designer: "Florian Karsten",
    description:
      "A proportional sans with traces of monospace construction and a distinctively technical voice.",
    files: [
      {
        path: "fonts/space-grotesk/normal.ttf",
        style: "normal",
        weight: "300 700",
      },
    ],
    licensePath: "fonts/space-grotesk/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/spacegrotesk",
    axes: [
      {
        tag: "wght",
        min: 300.0,
        default: 300.0,
        max: 700.0,
      },
    ],
  },
  {
    id: "newsreader",
    name: "Newsreader",
    category: "serif",
    designer: "Production Type",
    description:
      "A fluid editorial serif with optical sizes for sustained reading and graceful large titles.",
    files: [
      {
        path: "fonts/newsreader/normal.ttf",
        style: "normal",
        weight: "200 800",
      },
      {
        path: "fonts/newsreader/italic.ttf",
        style: "italic",
        weight: "200 800",
      },
    ],
    licensePath: "fonts/newsreader/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/newsreader",
    axes: [
      {
        tag: "wght",
        min: 200.0,
        default: 400.0,
        max: 800.0,
      },
      {
        tag: "opsz",
        min: 6.0,
        default: 18.0,
        max: 72.0,
      },
    ],
  },
  {
    id: "archivo",
    name: "Archivo",
    category: "sans",
    designer: "Omnibus-Type",
    description:
      "A workhorse grotesque with a broad width range for compact labels and assertive headlines.",
    files: [
      {
        path: "fonts/archivo/normal.ttf",
        style: "normal",
        weight: "100 900",
      },
      {
        path: "fonts/archivo/italic.ttf",
        style: "italic",
        weight: "100 900",
      },
    ],
    licensePath: "fonts/archivo/OFL.txt",
    source: "https://github.com/google/fonts/tree/main/ofl/archivo",
    axes: [
      {
        tag: "wght",
        min: 100.0,
        default: 600.0,
        max: 900.0,
      },
      {
        tag: "wdth",
        min: 62.0,
        default: 100.0,
        max: 125.0,
      },
    ],
  },
];

export const pairings: Pairing[] = [
  {
    id: "literary-warmth",
    name: "Literary warmth",
    display: "fraunces",
    body: "source-serif-4",
    support: "source-sans-3",
    rationale:
      "Fraunces gives the headline a warm, unmistakable voice. Source Serif 4 settles into an even reading rhythm, while Source Sans 3 keeps labels quiet. Keep Fraunces to short titles so its character has room.",
  },
  {
    id: "source-family",
    name: "One shared language",
    display: "source-serif-4",
    body: "source-serif-4",
    support: "source-sans-3",
    rationale:
      "The Source superfamily builds continuity through related proportions. Let the serif handle title and text at different optical sizes; the sans makes navigation easy to distinguish.",
  },
  {
    id: "plex-system",
    name: "A complete system",
    display: "ibm-plex-sans",
    body: "ibm-plex-serif",
    support: "ibm-plex-mono",
    rationale:
      "Plex Sans, Serif, and Mono share a design vocabulary while giving headlines, reading, and annotations distinct jobs. A useful starting point for technical stories with a human voice.",
  },
  {
    id: "quiet-editorial",
    name: "Quiet editorial",
    display: "newsreader",
    body: "newsreader",
    support: "newsreader",
    rationale:
      "One family can carry the whole page. Newsreader’s optical sizes, true italic, and weight range create hierarchy through size and emphasis while keeping the texture consistent.",
  },
  {
    id: "modern-classic",
    name: "Modern classic",
    display: "dm-serif-display",
    body: "dm-sans",
    support: "dm-sans",
    rationale:
      "DM Serif Display brings broad curves and sharp contrast to the title; DM Sans provides a simpler texture beneath it. Give the display serif generous size and keep it at its genuine 400 weight.",
  },
  {
    id: "precise-and-fluid",
    name: "Precise & fluid",
    display: "manrope",
    body: "newsreader",
    support: "manrope",
    rationale:
      "Manrope’s measured geometry frames Newsreader’s fluid serif text. The change in texture makes the reading section distinct; keep headings concise and let the serif do the sustained reading.",
  },
  {
    id: "technical-human",
    name: "Technical / human",
    display: "space-grotesk",
    body: "source-sans-3",
    support: "ibm-plex-mono",
    rationale:
      "Space Grotesk gives short headlines an engineered character. Source Sans 3 opens up the reading texture, and Plex Mono separates metadata. Use the mono sparingly to preserve that distinction.",
  },
  {
    id: "archivo-alone",
    name: "One versatile voice",
    display: "archivo",
    body: "archivo",
    support: "archivo",
    rationale:
      "Archivo carries all three roles with a single family. Use weight, size, and spacing for hierarchy; its width axis offers another option for compact titles. Keep body text near its natural width.",
  },
];
