import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { captureArtwork, type ArtworkText } from "./export-artwork";
import { fonts } from "./catalog";
import { fontName, type Settings, type UploadedFont } from "./model";
import { surfaceGeometry, surfaceOf } from "./surface";

const packageNamespace = "http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging";
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc);
const parse = (value: Uint8Array) => {
  const doc = new DOMParser().parseFromString(strFromU8(value), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The IDML template is invalid.");
  return doc;
};
const first = (root: Document | Element, tag: string) => {
  const node = root.getElementsByTagName(tag)[0];
  if (!node) throw new Error(`The IDML template is missing ${tag}.`);
  return node;
};
const pt = (px: number) => Number((px * 0.75).toFixed(4));
const colorHex = (value: string) => {
  const values = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  const factor = value.startsWith("color(srgb") ? 255 : 1;
  return `#${values.map((number) => Math.round(number * factor).toString(16).padStart(2, "0")).join("")}`;
};
const fontStyle = (line: ArtworkText) => {
  const weight = Number(line.weight);
  const base = weight >= 700 ? "Bold" : weight >= 550 ? "Semibold" : weight >= 450 ? "Medium" : weight <= 300 ? "Light" : "Regular";
  return line.style === "italic" ? `${base} Italic` : base;
};
function pathPoints(frame: Element, width: number, height: number) {
  const array = first(frame, "PathPointArray");
  const corners = [
    [-width / 2, -height / 2], [-width / 2, height / 2],
    [width / 2, height / 2], [width / 2, -height / 2],
  ];
  [...array.getElementsByTagName("PathPointType")].forEach((point, index) => {
    const coordinate = corners[index].join(" ");
    point.setAttribute("Anchor", coordinate);
    point.setAttribute("LeftDirection", coordinate);
    point.setAttribute("RightDirection", coordinate);
  });
}

/** A page or one facing spread. Frames are placed from measured browser lines. */
export async function exportIdml(
  settings: Settings,
  uploads: UploadedFont[],
  _includePrivate = false,
  _rightsConfirmed = false,
): Promise<Blob> {
  if (surfaceOf(settings).mode !== "print") throw new Error("IDML is available for Print pages and spreads.");
  const geometry = surfaceGeometry(settings);
  const artwork = await captureArtwork(settings, uploads);
  const templateResponse = await fetch(`${import.meta.env.BASE_URL}idml-template.idml`);
  if (!templateResponse.ok) throw new Error("Could not load the IDML document template.");
  const files = unzipSync(new Uint8Array(await templateResponse.arrayBuffer()));
  const design = parse(files["designmap.xml"]);
  const spread = parse(files["Spreads/Spread_ucf.xml"]);
  const styles = parse(files["Resources/Styles.xml"]);
  const graphic = parse(files["Resources/Graphic.xml"]);
  const prefs = parse(files["Resources/Preferences.xml"]);
  const master = parse(files["MasterSpreads/MasterSpread_ud6.xml"]);
  const pageW = pt(geometry.pageWidth), pageH = pt(geometry.height!);
  const documentPreference = first(prefs, "DocumentPreference");
  documentPreference.setAttribute("PageWidth", String(pageW));
  documentPreference.setAttribute("PageHeight", String(pageH));
  documentPreference.setAttribute("PagesPerDocument", "1");
  documentPreference.setAttribute("FacingPages", geometry.pageCount === 2 ? "true" : "false");
  documentPreference.setAttribute("AllowPageShuffle", "true");
  documentPreference.setAttribute("PreserveLayoutWhenShuffling", "true");
  const spreadNode = first(spread, "Spread");
  spreadNode.setAttribute("PageCount", String(geometry.pageCount));
  spreadNode.setAttribute("AllowPageShuffle", "true");
  spreadNode.setAttribute("BindingLocation", geometry.pageCount === 2 ? "1" : "0");
  const page = first(spreadNode, "Page");
  page.setAttribute("GeometricBounds", `0 0 ${pageH} ${pageW}`);
  page.setAttribute("ItemTransform", `1 0 0 1 ${geometry.pageCount === 2 ? -pageW : 0} ${-pageH / 2}`);
  first(page, "MarginPreference").setAttribute("ColumnsPositions", `0 ${pageW - 72}`);
  if (geometry.pageCount === 2) {
    page.setAttribute("Name", "2");
    const right = page.cloneNode(true) as Element;
    right.setAttribute("Self", "cfpage2");
    right.setAttribute("Name", "3");
    right.setAttribute("ItemTransform", `1 0 0 1 0 ${-pageH / 2}`);
    page.after(right);
  }
  for (const [index, masterPage] of [...master.getElementsByTagName("Page")].entries()) {
    masterPage.setAttribute("GeometricBounds", `0 0 ${pageH} ${pageW}`);
    masterPage.setAttribute("ItemTransform", `1 0 0 1 ${index === 0 ? -pageW : 0} ${-pageH / 2}`);
  }
  const swatches = Object.entries(settings.palette).filter(([name]) => name !== "name") as [string, string][];
  artwork.shapes.forEach((shape, index) => {
    const hex = colorHex(shape.fill);
    if (!swatches.some(([, value]) => value.toLowerCase() === hex))
      swatches.push([`surface-${index + 1}`, hex]);
  });
  const black = [...graphic.getElementsByTagName("Color")].find((color) => color.getAttribute("Self") === "Color/Black")!;
  for (const [name, hex] of swatches) {
    const item = black.cloneNode(true) as Element;
    item.setAttribute("Self", `Color/Counterform-${name}`);
    item.setAttribute("Name", `Counterform ${name}`);
    item.setAttribute("ColorOverride", "Normal");
    item.setAttribute("Space", "RGB");
    item.setAttribute("ColorValue", `${parseInt(hex.slice(1,3),16)} ${parseInt(hex.slice(3,5),16)} ${parseInt(hex.slice(5,7),16)}`);
    item.setAttribute("ColorEditable", "true");
    item.setAttribute("ColorRemovable", "true");
    item.setAttribute("Visible", "true");
    black.after(item);
  }
  const group = first(styles, "RootParagraphStyleGroup");
  const baseStyle = first(group, "ParagraphStyle");
  const frameTemplate = first(spreadNode, "TextFrame");
  frameTemplate.remove();
  const addRectangle = (id: string, x: number, y: number, widthPx: number, heightPx: number, fill: string) => {
    const width = pt(widthPx), height = pt(heightPx);
    const rectangle = spread.createElement("Rectangle");
    for (const [name, value] of Object.entries({
      Self: id, Visible: "true", ItemLayer: "ucc", Locked: "false",
      ContentType: "Unassigned", FillColor: fill, StrokeColor: "Swatch/None",
      AppliedObjectStyle: "ObjectStyle/$ID/[None]",
      ItemTransform: `1 0 0 1 ${pt(x) + width / 2 - (geometry.pageCount === 2 ? pageW : 0)} ${pt(y) + height / 2 - pageH / 2}`,
    })) rectangle.setAttribute(name, value);
    rectangle.append(first(frameTemplate, "Properties").cloneNode(true));
    // Text-frame properties contain the rectangular path geometry used by InDesign.
    for (const child of [...rectangle.children]) if (child.tagName !== "Properties") child.remove();
    for (const child of [...first(rectangle, "Properties").children]) if (child.tagName !== "PathGeometry") child.remove();
    pathPoints(rectangle, width, height);
    spreadNode.append(rectangle);
  };
  addRectangle("cfbackground", 0, 0, artwork.width, artwork.height, "Color/Counterform-background");
  artwork.shapes.forEach((shape, index) => {
    const match = swatches.find(([, hex]) => hex.toLowerCase() === colorHex(shape.fill));
    if (match) addRectangle(`cfshape${index + 1}`, shape.x, shape.y, shape.width, shape.height, `Color/Counterform-${match[0]}`);
  });
  const storyTemplate = parse(files["Stories/Story_ue5.xml"]);
  const storyIds: string[] = [];
  const styleIds = new Map<string, string>();
  const aliases = new Map(Object.values(settings.roles).map((role) => [
    `cf-${role.fontId}`, fontName(role.fontId, uploads, settings.fontDependencies),
  ]));
  const styleFor = (line: ArtworkText) => {
    const key = [line.role,line.family,line.size,line.leading,line.tracking,line.weight,line.style,colorHex(line.color)].join("|");
    let id = styleIds.get(key);
    if (id) return id;
    id = `ParagraphStyle/Counterform-${styleIds.size + 1}`;
    styleIds.set(key, id);
    const style = baseStyle.cloneNode(true) as Element;
    style.setAttribute("Self", id);
    style.setAttribute("Name", `Counterform ${line.role} ${styleIds.size}`);
    style.setAttribute("PointSize", String(pt(line.size)));
    style.setAttribute("Leading", String(pt(line.leading)));
    style.setAttribute("Tracking", String(Math.round(line.tracking / line.size * 1000)));
    style.setAttribute("FillColor", `Color/Counterform-${swatches.find(([,hex]) => hex.toLowerCase() === colorHex(line.color))?.[0] ?? "ink"}`);
    style.setAttribute("FontStyle", fontStyle(line));
    style.setAttribute("KeepAllLinesTogether", "false");
    style.setAttribute("KeepFirstLines", "1");
    style.setAttribute("KeepLastLines", "1");
    style.setAttribute("NoBreak", "false");
    style.setAttribute("Hyphenation", "false");
    style.setAttribute("Capitalization", line.variantCaps.includes("small-caps") ? "SmallCaps" : "Normal");
    const properties = first(style, "Properties");
    const appliedFont = first(properties, "AppliedFont");
    appliedFont.textContent = aliases.get(line.family) ?? line.family;
    const leading = first(properties, "Leading");
    leading.setAttribute("type", "unit");
    leading.textContent = String(pt(line.leading));
    group.append(style);
    return id;
  };
  for (const [index, line] of artwork.texts.entries()) {
    const storyId = `cfstory${index + 1}`;
    const frameId = `cfframe${index + 1}`;
    const styleId = styleFor(line);
    storyIds.push(storyId);
    const story = storyTemplate.cloneNode(true) as Document;
    first(story, "Story").setAttribute("Self", storyId);
    const paragraph = first(story, "ParagraphStyleRange");
    paragraph.setAttribute("AppliedParagraphStyle", styleId);
    first(paragraph, "Content").textContent = line.text;
    files[`Stories/Story_${storyId}.xml`] = strToU8(serialize(story));
    const frame = frameTemplate.cloneNode(true) as Element;
    frame.setAttribute("Self", frameId);
    frame.setAttribute("ParentStory", storyId);
    const x = pt(line.x), y = pt(line.top);
    const width = Math.max(18, Math.min(pageW * geometry.pageCount - x, pt(line.width) * 1.4 + 20));
    const height = Math.max(20, pt(line.height) * 3 + 12);
    frame.setAttribute("ItemTransform", `1 0 0 1 ${x + width / 2 - (geometry.pageCount === 2 ? pageW : 0)} ${y + height / 2 - pageH / 2}`);
    pathPoints(frame, width, height);
    const framePref = first(frame, "TextFramePreference");
    framePref.setAttribute("TextColumnFixedWidth", String(width));
    framePref.setAttribute("AutoSizingType", "HeightOnly");
    framePref.setAttribute("AutoSizingReferencePoint", "TopLeftPoint");
    spreadNode.append(frame);
  }
  const documentRoot = first(design, "Document");
  documentRoot.setAttribute("Name", settings.name);
  documentRoot.setAttribute("StoryList", storyIds.join(" "));
  const section = first(design, "Section");
  section.setAttribute("Length", String(geometry.pageCount));
  section.setAttribute("AlternateLayoutLength", String(geometry.pageCount));
  section.setAttribute("ContinueNumbering", geometry.pageCount === 2 ? "false" : "true");
  if (geometry.pageCount === 2) section.setAttribute("PageNumberStart", "2");
  const originalStoryLink = [...design.getElementsByTagNameNS(packageNamespace, "Story")][0];
  for (const [index, id] of storyIds.entries()) {
    const link = design.createElementNS(packageNamespace, "idPkg:Story");
    link.setAttribute("src", `Stories/Story_${id}.xml`);
    if (index === 0 && originalStoryLink) originalStoryLink.replaceWith(link);
    else documentRoot.append(link);
  }
  delete files["Stories/Story_ue5.xml"];
  files["designmap.xml"] = strToU8(serialize(design));
  files["Spreads/Spread_ucf.xml"] = strToU8(serialize(spread));
  files["Resources/Styles.xml"] = strToU8(serialize(styles));
  files["Resources/Graphic.xml"] = strToU8(serialize(graphic));
  files["Resources/Preferences.xml"] = strToU8(serialize(prefs));
  files["MasterSpreads/MasterSpread_ud6.xml"] = strToU8(serialize(master));
  // IDML packages require an uncompressed mimetype first in the ZIP.
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [files.mimetype, { level: 0 }],
  };
  for (const [path, bytes] of Object.entries(files)) if (path !== "mimetype") entries[path] = bytes;
  return new Blob([zipSync(entries, { level: 6 })], { type: "application/vnd.adobe.indesign-idml-package" });
}
