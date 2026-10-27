import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lint } from '@google/design.md/linter';
import { readFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { defaultSettings } from '../src/model';
import { exportPackage, importPackage, makeUpload, withFontDependencies } from '../src/package';

const file = (bytes: Uint8Array, name = 'experiment.zip') => new File([bytes.slice().buffer], name);
const json = (value: unknown) => strToU8(JSON.stringify(value));
let privateFile: File;
beforeEach(async () => {
  privateFile = file(new Uint8Array(await readFile('public/fonts/manrope/normal.ttf')), 'My Private Font.ttf');
  vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(new Uint8Array(await readFile('public/' + path.replace(/^\.\//, '').replace(/^\//, ''))))));
});
afterEach(() => vi.unstubAllGlobals());

describe('portable settings and font packages', () => {
  it('round trips settings exactly, bundles selected family styles and licences, and shares renderer CSS', async () => {
    const settings = defaultSettings();
    settings.roles.body.style = 'italic';
    settings.content.title = '<script>alert("x")</script>\nÅ, ä & ö';
    const bytes = await exportPackage(settings, [], false);
    const unpacked = unzipSync(bytes);
    const imported = await importPackage(file(bytes));
    expect(imported).toEqual({ settings, uploads: [] });
    expect(unpacked['fonts/source-serif-4/italic.ttf']).toBeDefined();
    expect(unpacked['fonts/source-serif-4/OFL.txt']).toBeDefined();
    expect(unpacked['fonts/manrope/normal.ttf']).toBeUndefined();
    const html = strFromU8(unpacked['specimen.html']);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    const css = strFromU8(unpacked['tokens.css']);
    expect(css).toContain('fonts/source-serif-4/italic.ttf');
    expect(css).not.toMatch(/blob:|https?:/);
    const design = strFromU8(unpacked['DESIGN.md']);
    expect(design).toContain('version: alpha');
    expect(design).toContain('fontFamily: "Source Serif 4"');
    expect(design).toContain('italic');
    expect(design).toContain('Literary warmth');
    expect(design).toContain('ink on paper');
    expect(design).toContain('muted on panel');
    expect(design).toContain('600px or less');
    expect(design).toContain('do not snap text');
    const report = lint(design);
    expect(report.summary.errors, JSON.stringify(report.findings)).toBe(0);
  });
  it('excludes private bytes by default while preserving dependency names and IDs', async () => {
    const upload = await makeUpload(privateFile);
    const settings = defaultSettings();
    settings.roles.display.fontId = upload.id;
    const bytes = await exportPackage(settings, [upload], false);
    const files = unzipSync(bytes);
    const metadata = JSON.parse(strFromU8(files['fonts.json']));
    expect(metadata.fonts.find((f: { id: string }) => f.id === upload.id)).toMatchObject({ name: upload.name, included: false });
    expect(Object.keys(files).some(name => name.startsWith('fonts/private/'))).toBe(false);
    expect(strFromU8(files['specimen.html'])).toContain(upload.name);
    expect(await importPackage(file(bytes))).toEqual({ settings: withFontDependencies(settings, [upload]), uploads: [] });
  });
  it('preserves missing human names and descriptors through plain JSON and a second ZIP export', async () => {
    const upload = await makeUpload(privateFile, '200 800', 'italic');
    const settings = defaultSettings();
    settings.roles.display.fontId = upload.id;
    const first = await importPackage(file(await exportPackage(settings, [upload], false)));
    const fromJson = await importPackage(file(json(first.settings), 'settings.json'));
    const secondBytes = await exportPackage(fromJson.settings, [], false);
    const files = unzipSync(secondBytes);
    const second = await importPackage(file(secondBytes));
    expect(second.settings.fontDependencies?.[upload.id]).toEqual({ name: upload.name, fileName: upload.fileName, weight: '200 800', style: 'italic' });
    expect(second.uploads).toEqual([]);
    expect(strFromU8(files['DESIGN.md'])).toContain(`fontFamily: "${upload.name}"`);
    expect(strFromU8(files['specimen.html'])).toContain(upload.name);
    expect(Object.keys(files).some(name => name.startsWith('fonts/private/'))).toBe(false);
    const invalid = { ...second.settings, fontDependencies: { [upload.id]: { name: 'Bad', weight: '400; color:red' } } };
    await expect(importPackage(file(json(invalid), 'settings.json'))).rejects.toThrow('supported Counterform');
  });
  it('round trips explicitly included private bytes and descriptors using a stable hash ID', async () => {
    const upload = await makeUpload(privateFile, '200 800', 'italic');
    const duplicate = await makeUpload(file(new Uint8Array(upload.bytes), 'renamed.ttf'));
    expect(duplicate.id).toBe(upload.id);
    const settings = defaultSettings();
    settings.roles.display.fontId = upload.id;
    settings.roles.body.fontId = upload.id;
    await expect(exportPackage(settings, [upload], true)).rejects.toThrow('Confirm that your licence');
    const bytes = await exportPackage(settings, [upload], true, true);
    const imported = await importPackage(file(bytes));
    expect(imported.settings).toEqual(withFontDependencies(settings, [upload]));
    expect(imported.uploads).toHaveLength(1);
    expect(imported.uploads[0]).toEqual(upload);
  });
  it('imports plain settings while rejecting malformed schemas and unsupported versions', async () => {
    const settings = defaultSettings();
    expect(await importPackage(file(json(settings), 'settings.json'))).toEqual({ settings, uploads: [] });
    await expect(importPackage(file(json({ ...settings, schemaVersion: 2 }), 'settings.json'))).rejects.toThrow('supported Counterform');
    await expect(importPackage(file(json({ ...settings, roles: {} }), 'settings.json'))).rejects.toThrow('supported Counterform');
  });
  it('rejects corrupt hashes and unsafe font descriptors before returning any uploads', async () => {
    const upload = await makeUpload(privateFile);
    const settings = defaultSettings();
    settings.roles.display.fontId = upload.id;
    const bytes = await exportPackage(settings, [upload], true, true);
    const files = unzipSync(bytes);
    const metadata = JSON.parse(strFromU8(files['fonts.json']));
    const record = metadata.fonts.find((f: { id: string }) => f.id === upload.id);
    files[record.path][20] ^= 1;
    await expect(importPackage(file(zipSync(files)))).rejects.toThrow('checksum');
    record.weight = '400; color:red';
    files['fonts.json'] = json(metadata);
    await expect(importPackage(file(zipSync(files)))).rejects.toThrow('descriptors');
  });
  it('rejects traversal paths, overexpanded ZIPs and oversized plain JSON', async () => {
    const settings = defaultSettings();
    await expect(importPackage(file(zipSync({ 'settings.json': json(settings), '../outside': strToU8('x') })))).rejects.toThrow('safe import limits');
    await expect(importPackage(file(zipSync({ 'settings.json': json(settings), 'large.bin': new Uint8Array(21 * 1024 * 1024) })))).rejects.toThrow('safe import limits');
    await expect(importPackage(file(new Uint8Array(1024 * 1024 + 1), 'settings.json'))).rejects.toThrow('1 MB');
  });
  it('rejects renamed non-font files and invalid upload descriptors', async () => {
    await expect(makeUpload(file(strToU8('this is definitely not a font'), 'bad.ttf'))).rejects.toThrow('supported font');
    await expect(makeUpload(privateFile, '900 200')).rejects.toThrow('weight');
  });
});

describe('advanced layout portability', () => {
  it('round trips the complete editable layout and exports its placements and language', async () => {
    const { applyRecipe } = await import('../src/layout');
    const settings = applyRecipe(defaultSettings(), 'asymmetric-editorial');
    settings.layout!.typesetting.language = 'sv';
    settings.layout!.margins.left = 91;
    settings.layout!.blocks[1].label = 'Rubrik & rytm';
    settings.layout!.blocks[1].placement.wide = { column: 2, span: 9, row: 2, rowSpan: 1, align: 'end' };
    const bytes = await exportPackage(settings, [], false);
    expect((await importPackage(file(bytes))).settings).toEqual(settings);
    const files = unzipSync(bytes);
    const css = strFromU8(files['tokens.css']);
    expect(css).toContain('grid-column:2/span 9');
    const html = strFromU8(files['specimen.html']);
    expect(html).toContain('<html lang="sv">');
    expect(html).toContain('data-zone="Rubrik &amp; rytm"');
    const design = strFromU8(files['DESIGN.md']);
    expect(design).toContain('Rubrik & rytm');
    expect(design).toContain('91px');
    expect(design).not.toContain('main span is');
    expect(lint(design).summary.errors).toBe(0);
  });
  it('keeps dollar patterns in block labels literal in the exported DESIGN.md', async () => {
    const { applyRecipe } = await import('../src/layout');
    const settings = applyRecipe(defaultSettings(), 'asymmetric-editorial');
    settings.layout!.blocks[1].label = "Cost $& and $' together";
    const files = unzipSync(await exportPackage(settings, [], false));
    const design = strFromU8(files['DESIGN.md']);
    expect(design).toContain("Cost $& and $' together");
    expect(design.match(/^## Layout$/gm)).toHaveLength(1);
    expect(lint(design).summary.errors).toBe(0);
  });
  it('rejects malformed advanced data while preserving the legacy settings contract', async () => {
    const { applyRecipe } = await import('../src/layout');
    const legacy = defaultSettings();
    expect((await importPackage(file(json(legacy), 'old.json'))).settings).toEqual(legacy);
    const changed = applyRecipe(legacy, 'book-page');
    changed.layout!.columns.tracks[0].weight = -1;
    await expect(importPackage(file(json(changed), 'bad.json'))).rejects.toThrow();
    expect(legacy.layout).toBeUndefined();
  });
});
