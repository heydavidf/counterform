---
version: alpha
name: Counterform
description: An editorial workbench for composing with type, space and colour.
colors:
  primary: "#292d27"
  secondary: "#686d60"
  background: "#f8f7f3"
  workspace: "#e7e9e1"
  accent: "#414f3c"
  onAccent: "#ffffff"
  border: "#dddfd5"
  selection: "#dbe2cf"
  hover: "#e9ece1"
typography:
  wordmark:
    fontFamily: "cf-fraunces, serif"
    fontSize: 34px
    fontWeight: 500
    letterSpacing: -0.04em
    lineHeight: 1
  inspectorHeading:
    fontFamily: "cf-fraunces, serif"
    fontSize: 26px
    fontWeight: 450
    letterSpacing: -0.025em
    lineHeight: 1.2
  interface:
    fontFamily: "cf-source-sans-3, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "cf-source-sans-3, sans-serif"
    fontSize: 13px
    fontWeight: 500
  measurement:
    fontFamily: "cf-ibm-plex-mono, monospace"
    fontSize: 10px
    fontWeight: 400
rounded:
  control: 5px
  field: 4px
spacing:
  controlGap: 8px
  inspectorInset: 24px
  workspaceInset: 34px
components:
  primaryButton:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.onAccent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 11px 16px
---

# Design System: Counterform

## Overview

**Creative North Star: "The editorial workbench"**

Counterform places real typeset compositions on a paper canvas, with quiet side controls, generous margins and confident specimen colours. The inspector exposes relationships between type, space and colour while the application frame remains steady.

This direction was chosen during planning and approved for implementation. The composition is implemented directly in HTML/CSS; there is no raster comp, and no screenshot-matching claim is made. Product purpose and capabilities are described in the [README](../README.md).

**Key Characteristics:**

- Actual letterforms and editable content carry the visual identity.
- Warm paper, olive ink and pale sage frame independent specimen palettes.
- Fine rules and compact controls support a generous composition area.

## Colors

### Primary

Deep olive (`accent`) anchors primary actions, with white (`onAccent`) text. The selected composition tab uses the pale sage `selection` token. Controls use `hover` for quiet interaction feedback.

### Neutral

Dark olive `primary` is the principal interface ink; `secondary` supports instructions. Warm paper `background` carries the header and inspector, pale sage `workspace` surrounds the sheet, and `border` separates sections.

**The Independent Palette Rule.** Specimen colours change independently of the application frame. Six editable palettes cover light, dark and saturated grounds; the default specimen uses ink and vermilion on warm paper. Palette experiments never redefine control colours.

## Typography

Locally bundled Fraunces carries the wordmark and inspector headings; Source Sans 3 carries controls and instructions; IBM Plex Mono displays colour values. Frontmatter records their actual CSS aliases and recurring roles. The interface has a compact hierarchy: large wordmark, smaller serif inspector heading, reading instructions, medium-weight action labels and small monospaced measurements. Panel instructions use a short measure (30ch).

**The Three Roles Rule.** Specimen display, reading and supporting roles remain independent of interface typography. The default pairing is Fraunces, Source Serif 4 and Source Sans 3. The library provides twelve open font families and eight explained combinations; exact catalogue entries belong in the catalogue and font manifest.

Each role exposes family, size, weight, available style, leading, tracking and supported variable axes. Display family, weight, style and axes propagate to headings, quotations and large letterforms. Reading settings propagate to body paragraphs and decks. Supporting settings propagate to mastheads, footers, notes, navigation, details and sample controls, including the sample button. Specimen-specific size and leading relationships remain in the shared specimen stylesheet; changing a role does not make every element the same size.

## Layout

**Advanced Composition Rule (0.2).** The original specimens remain available. Activating one of six visual recipes adds a versioned layout to the study. The warm paper, olive controls and independent specimen palettes remain the visual authority. A labelled schematic anatomy map and reading-order list select the same block as clicking the page. The inspector exposes weighted columns, separate row/column gaps, independent margins, real row/span placement and editable content. Collapsible sections separate geometry, placement and typesetting.

Wide arrangements apply above 900px, medium above 600px through 900px, and narrow at 600px or less. Responsive variants can override columns, margins, gaps and block placement. Medium/narrow rows grow with content; bounded wide studies use explicit heights and report overflow. Grid guides use the actual grid lines without contributing to track sizing. Reading order remains explicit and can differ from manual visual placement; reordering blocks restacks the narrow arrangement.

**Output Surface Rule (0.3).** Web remains a responsive canvas whose width tests real reflow. Print and Social are fixed-dimension surfaces: Print uses A5, A4, A3 or Letter in portrait or landscape, as a single page or a facing spread; Social uses Square, Portrait, Story or Landscape pixel formats. Fixed surfaces scale to fit the workbench preview but retain their geometry and wide layout. The caption reports the selected dimensions and preview scale. Print uses CSS pixels for type and exposes the relationship `1 px = 0.75 pt`.

Print facing pages form one continuous double-width sheet with one shared grid; the fold is geometry, not a second independent composition. The facing starter uses twelve columns, places the shared Body and deck in a left-page reading area and the letterform, quotation and caption on the right, while retaining an intentional display-title crossing. Editorial single/facing actions select their named page mode; Poster retains the selected mode and names it in confirmation. Explicit Print Poster application gives Body and caption separate areas. Applying a starter retains shared copy, type, palette and pinned comparison A. Imported/saved layouts are not automatically repositioned. Web has no starter strip because its responsive canvas remains the open-ended baseline.

Linked rhythm uses two units for paragraph gaps and three for heading gaps. The body line height can seed the unit; independently changing a gap releases that spacing link. Real small caps and numeral variants are gated against the selected bundled face's OpenType tables. These choices do not promise glyph baseline snapping.

The geometry and responsive rules are shared by preview, comparison, saved studies and export. The following original-specimen rules apply when no advanced layout is present.

Desktop uses an 82px header, editable study row, specimen canvas and 326px inspector. The inspector is sticky and scrolls independently; the canvas uses the spacious inset recorded above. At 1150px and below, the inspector becomes 302px, labels simplify and A/B specimens stack. At 800px and below, the inspector follows the canvas in normal document flow. At 1800px and above, the inspector expands to 350px and the canvas gains more breathing room. Narrow application layouts retain access to controls and export, including at an actual 320px viewport.

**The True Width Rule.** The selected specimen width is independent of available preview space. A 1040px specimen scaled to fit still uses its desktop composition; the caption reports its scale. Choose a smaller specimen width to test composition reflow. A/B comparison renders two independent specimens with this same behaviour. Exported pages cap at the selected width and reflow on smaller screens.

Specimens use a container breakpoint at 600px: editorial, product and poster grids become one logical reading column, mastheads wrap and footers stack. Page margins respond to container width, bounded by the selected margin. Display size responds within the selected maximum; reading measure remains explicit. Modular and baseline overlays are guides, without automatic baseline snapping.

## Elevation & Depth

The paper sheet uses a soft shadow (`0 5px 18px #3e493617`). Controls remain visually flat, separated by borders and tonal states. The range thumb uses a narrow outline-like shadow; palette swatches use a subtle inset edge. These are control edges, not elevated cards.

## Shapes

Small rectangular controls and fine rules define the frame. Buttons use the control radius; fields and composition tabs use the smaller field radius. Circular range thumbs and status dots serve their native control roles. The large letterform specimen is actual rendered type, without generated lettering or a picture of text.

## Components

### Buttons

Primary actions use olive fill and white text; quiet and outlined actions share compact spacing and medium-weight interface type. Buttons have a minimum height of 36px in their base style. Hover changes background; the primary action deepens to `#2b3826`. Application buttons transition background and colour over 0.16s. Disabled application buttons reduce opacity and indicate an unavailable action.

### Inputs and ranges

Fields use warm near-white fill, fine borders and small corners. Range controls pair a slider with an editable numeric value. Keyboard focus is an explicit olive outline (`2px solid #6a7e55`, 3px offset; range inputs use 5px). Content textareas resize vertically. Role rows show a sample of the actual face and a tinted selected state.

### Navigation

Four inspector tabs own Type, Grid, Colour and Content. Selected inspector tabs combine darker text, heavier weight and an underline; composition tabs use a filled selection state. Separate views own Experiments and Export. The medium control band adds Web, Print and Social as a pressed three-way choice, followed by only the controls relevant to the selected surface. Print exposes page size, orientation and page count; Social exposes format. Editable starters are labelled and remain visible as actions. SVG icons use Lucide with a consistent thin stroke (1.7). Narrow layouts reduce visible action labels while retaining accessible names.

### Specimen canvas and sample controls

Editorial, product and poster specimens share settings and rendering code. Letter studies, reading columns and poster letterforms show type in context. The product specimen button is a disabled illustrative element styled with specimen ink and background, full opacity and inherited supporting typography. It is not an application action, and its appearance stays the same in preview and export. Fixed Web/Print/Social geometry is also rendered through this shared specimen path; output HTML, browser print proofs and Social PNG output use the same settings and specimen renderer.

### Medium controls and output

The output band is quiet and utilitarian: selected mode uses the existing filled selection treatment, while format controls use the existing fields and borders. Social export is an explicit pixel-sized PNG action and embeds the selected bundled or local font data for browser rasterization. Print export opens a browser print proof for one page or one double-width spread; the proof guidance asks for 100% scale, no headers or footers and backgrounds enabled. It is a proof surface, not a pagination engine or press-ready imposition.

The export panel gives a contents list before each download: file types, current dimensions, and font inclusion. Native SVG text and InDesign text frames are measured from the shared specimen rendering path. SVG includes selected open font data and its OFL text, though Adobe may still require the font to be installed. IDML contains one page or one facing spread, editable text frames, paragraph styles and palette swatches; it links font names and reconstructs placement rather than carrying CSS Grid. The browser PDF proof is the Illustrator PDF route. Private font inclusion applies to one download and requires a licence permission confirmation; the same gate applies before browser PDF embedding. Social PNG contains pixels, not a redistributable font file.

### Feedback

Missing private fonts are named in a visible warning. Contrast results include explicit text alongside their colour states. Named experiments display rendered type previews; the export summary uses a pale tonal panel. Fixed-layout overflow and block overlap are visible warnings so deliberate typographic tension can be judged. Print discloses retained Body not used by a layout and names nonempty Body/deck/caption areas entering a nominal 24 CSS px corridor on either side of the fold. Measurements use authored coordinates rather than the scaled preview; the allowance is composition guidance rather than binding certification. Display/artwork crossings remain possible. Print warnings remain visible but do not veto an explicit “Print anyway” action. Experimental specimen failures remain distinct from application accessibility.

### Comparison

Comparison is an editorial A/B reading mode, not a destructive toggle. Starting comparison immutably pins A as the reference and leaves the working controls editing B, the current adjustment. A and B render as separate specimen frames; on wide screens the current adjustment appears first, while narrow layouts stack the frames. The panel states the relationship plainly, accepts an optional intent (“What are you testing?”), and groups live differences by Type, Grid, Colour, Content, Format or Study. “Use reference settings” copies the pinned values into the current study without discarding the comparison record. Saved and imported settings retain the reference snapshot and intent; exports identify when they contain the current adjustment.

## Do's and Don'ts

- **Do** keep previews, CSS and exported HTML on the shared rendering path.
- **Do** preserve the three specimen roles across every composition.
- **Do** display selected width and preview scale honestly.
- **Do** keep font availability honest and name missing private fonts.
- **Do** explain pairings in words, without a numerical harmony score.
- **Do** distinguish application accessibility from experimental specimen choices.
- **Do** keep Web responsive, and keep Print and Social dimensions fixed after preview scaling.
- **Do** treat a facing spread as one continuous grid across the fold.
- **Do** expose medium, format, orientation, page-count and starter choices explicitly.
- **Do** keep A immutable as the pinned reference and show B as the current adjustment with intent and live diffs.
- **Do** let a deliberate overlap remain visible after its warning is acknowledged through Print anyway.
- **Don't** treat a scaled desktop canvas as proof of narrow-screen reflow.
- **Don't** give facing pages unrelated grids. A page grid mirrors or repeats one page, and an own right page still shares the spread's rows.
- **Don't** make print warnings silently block an intentional proof.
- **Don't** redistribute private uploaded fonts by default.
