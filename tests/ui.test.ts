import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { companions, createSprite, createIcon, createMeadow, createMiniMeadow } from '../public/pixel-art.js';
import { readPreference, savePreference } from '../public/meadow.js';

// A tiny deterministic SVG DOM stub, not a pretend browser. These tests check
// the asset contract; actual rendering and keyboard behavior are checked separately.
class SVGNode {
    tagName: string;
    attributes: Record<string, string> = {};
    children: SVGNode[] = [];
    constructor(tag: string) { this.tagName = tag; }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(child: SVGNode) { this.children.push(child); }
}
function draw(fn: () => SVGSVGElement): SVGNode {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: (_ns: string, tag: string) => new SVGNode(tag) } });
    try { return fn() as unknown as SVGNode; }
    finally { if (original) Object.defineProperty(globalThis, 'document', original); else Reflect.deleteProperty(globalThis, 'document'); }
}
function nodes(root: SVGNode): SVGNode[] { return [root, ...root.children.flatMap(nodes)]; }
const file = (name: string) => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('six unique, named companions include every requested species', () => {
    assert.equal(companions.length, 6);
    assert.equal(new Set(companions.map(c => c.id)).size, 6);
    for (const animal of ['cat', 'dog', 'bird', 'turtle']) assert(companions.some(c => c.id === animal));
    assert(companions.every(c => c.name && c.description));
    assert(Object.isFrozen(companions));
});
test('all eight animals render bounded, self-contained decorative SVG', () => {
    for (const kind of [...companions.map(c => c.id), 'frog', 'duck']) {
        const svg = draw(() => createSprite(kind));
        assert.equal(svg.attributes['data-animal'], kind);
        assert.equal(svg.attributes['aria-hidden'], 'true');
        assert.equal(svg.attributes.focusable, 'false');
        assert.equal(svg.attributes['shape-rendering'], 'crispEdges');
        assert.equal(svg.attributes.viewBox, '0 0 28 28');
        assert(nodes(svg).length < 80);
        for (const n of nodes(svg)) {
            assert(['svg', 'g', 'rect', 'path'].includes(n.tagName));
            assert(!Object.keys(n.attributes).some(key => key.startsWith('on') || ['href', 'style'].includes(key)));
        }
    }
});
test('unknown and inherited animal keys safely fall back to the cat', () => {
    for (const key of ['missing', '__proto__', 'constructor', 'toString']) assert.equal(draw(() => createSprite(key)).attributes['data-animal'], 'cat');
});
test('pixel icons have no remote resource references or interactive descendants', () => {
    for (const name of ['paw','plus','arrow','northeast','search','globe','memory','flower','sun','moon','pause','play','menu','close','home','check','heart','__proto__']) {
        const svg = draw(() => createIcon(name));
        assert.equal(svg.attributes['aria-hidden'], 'true');
        assert(nodes(svg).every(n => !n.attributes.href));
        assert.equal(svg.children[0]?.tagName, 'path');
        assert(!svg.children[0]?.attributes.d?.includes('[object Object]'));
    }
});
test('both meadow scenes have finite geometry and a modest DOM node budget', () => {
    for (const render of [createMeadow, createMiniMeadow]) {
        const svg = draw(render);
        const descendants = nodes(svg);
        assert(descendants.length < 650);
        assert.equal(svg.attributes['aria-hidden'], 'true');
        for (const n of descendants) for (const [key, value] of Object.entries(n.attributes)) {
            assert(!/NaN|undefined|Infinity/.test(value));
            if (['x','y','width','height'].includes(key)) assert(Number.isFinite(Number(value)));
            if (['width','height'].includes(key)) assert(Number(value) > 0);
        }
    }
});
test('essential chat, evidence, stop, memory, and timezone hooks are retained exactly once', async () => {
    const html = await file('index.html');
    for (const id of ['composer','input','send','stop','messages','activity','activity-text','activity-count','timezone','threads','new-chat','clear-memory','evidence-dialog','evidence-content','close-dialog','notice','mode-label']) {
        assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
    }
});
test('the interface requests only local scripts, stylesheet and favicon', async () => {
    const html = await file('index.html');
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) assert(match[1]?.startsWith('/'));
    assert(!/https?:\/\//.test(await file('pixel-art.js')) || (await file('pixel-art.js')).includes('http://www.w3.org/2000/svg'));
    assert(!/fetch\s*\(|XMLHttpRequest|WebSocket/.test(await file('meadow.js')));
});
test('animation controls cover reduced motion, user pause, and background-tab pause', async () => {
    const css = await file('style.css');
    assert(css.includes('@media (prefers-reduced-motion: reduce)'));
    assert(css.includes('body[data-motion="off"]'));
    assert(css.includes('body[data-page-hidden="true"]'));
    const behavior = await file('meadow.js');
    assert(behavior.includes("reducedMotion.addEventListener('change'"));
    assert(behavior.includes("document.addEventListener('visibilitychange'"));
});
test('browser preference errors degrade gracefully without a DOM or storage API', () => {
    assert.equal(readPreference('tn_buddy'), null);
    assert.equal(readPreference('tn_theme'), null);
    assert.doesNotThrow(() => savePreference('tn_buddy', 'cat'));
    assert.doesNotThrow(() => savePreference('tn_theme', 'dark'));
    assert.doesNotThrow(() => savePreference('tn_buddy', null));
});
test('theme controls support dark mode and system preferences', async () => {
    const css = await file('style.css');
    assert(css.includes(':root[data-theme="dark"]'));
    assert(css.includes('body[data-theme="dark"]'));
    const html = await file('index.html');
    assert(html.includes('id="theme-toggle"'));
    const behavior = await file('meadow.js');
    assert(behavior.includes("matchMedia('(prefers-color-scheme: dark)')"));
});
test('conversation payloads remain text-rendered and presentation adds no external tools', async () => {
    const app = await file('app.js');
    assert(!/\.innerHTML\s*=|insertAdjacentHTML|eval\s*\(/.test(app));
    assert(app.includes('node.textContent = text'));
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
    assert.equal(Object.keys(packageJson.dependencies || {}).length, 0);
});
