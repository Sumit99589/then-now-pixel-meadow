/**
 * Original, hand-drawn pixel art. Integer-coordinate SVG geometry only:
 * no remote images, font assets, canvas loop, dependency, or user-supplied markup.
 * Decorative art is hidden from assistive technology; controls carry their own labels.
 */
const NS = 'http://www.w3.org/2000/svg';
const ink = '#51405f';
export const companions = Object.freeze([
  { id: 'cat', name: 'Pip', species: 'cat', description: 'Professional sunbeam finder. Very curious company.' },
  { id: 'dog', name: 'Scout', species: 'dog', description: 'An enthusiastic explorer. Every question is a good question.' },
  { id: 'bird', name: 'Wren', species: 'bird', description: 'Small wings, big curiosity. Always up for a new perspective.' },
  { id: 'turtle', name: 'Moss', species: 'turtle', description: 'A gentle reminder that thoughtful is better than hasty.' },
  { id: 'bunny', name: 'Clover', species: 'rabbit', description: 'A soft little optimist with a nose for interesting questions.' },
  { id: 'fox', name: 'Fern', species: 'fox', description: 'Bright-eyed company for the wonderfully unexpected.' },
]);
function node(tag, attributes = {}, parent) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  parent?.append(element);
  return element;
}
function rect(parent, x, y, width, height, fill, attributes = {}) {
  return node('rect', { x, y, width, height, fill, ...attributes }, parent);
}
function path(parent, d, fill, attributes = {}) { return node('path', { d, fill, ...attributes }, parent); }
function group(parent, attributes = {}) { return node('g', attributes, parent); }
function eyes(parent, x1, x2, y, color = ink) {
  const g = group(parent, { class: 'sprite-eyes' });
  rect(g, x1, y, 2, 3, color); rect(g, x2, y, 2, 3, color);
  rect(g, x1, y, 1, 1, '#fffdf2'); rect(g, x2, y, 1, 1, '#fffdf2');
}
function cat(g) {
  path(g, 'M19 19h3v-6h-2v-3h4v2h1v9h-3v2h-5z', ink);
  path(g, 'M20 20h3v-7h-2v-2h2v2h1v7h-2v2h-3z', '#e6a06c');
  path(g, 'M7 14h12v3h1v6h-2v2H6v-2H5v-5h2z', ink);
  rect(g, 7, 16, 11, 7, '#efa769'); rect(g, 9, 18, 6, 5, '#ffdf9b');
  path(g, 'M3 3h5v2h8V3h5v12h-2v3H5v-2H3z', ink);
  path(g, 'M4 4h3v3h10V4h3v10h-2v3H6v-2H4z', '#ffbd7c');
  rect(g, 5, 5, 2, 3, '#ef8d8b'); rect(g, 17, 5, 2, 3, '#ef8d8b');
  rect(g, 9, 7, 2, 2, '#d68a59'); rect(g, 13, 7, 2, 2, '#d68a59');
  rect(g, 5, 13, 4, 3, '#ffe3bb'); rect(g, 15, 13, 4, 3, '#ffe3bb');
  eyes(g, 7, 15, 10); rect(g, 11, 13, 3, 1, '#b96872'); rect(g, 12, 14, 1, 1, ink);
  rect(g, 2, 12, 3, 1, '#a36b65'); rect(g, 20, 12, 3, 1, '#a36b65');
  rect(g, 7, 23, 3, 1, '#fff0d0'); rect(g, 15, 23, 3, 1, '#fff0d0');
  rect(g, 7, 17, 11, 1, '#b68cd0'); rect(g, 12, 18, 2, 2, '#ffe194');
}
function dog(g) {
  path(g, 'M20 15h3v-2h2v6h-4v3h-3v-6z', ink); rect(g, 21, 16, 3, 2, '#d98b55');
  path(g, 'M6 13h13v3h2v8h-5v-2h-6v2H5v-9z', ink);
  rect(g, 7, 15, 12, 7, '#dfa06a'); rect(g, 10, 15, 6, 7, '#fff4d7');
  rect(g, 6, 22, 3, 1, '#fff4d7'); rect(g, 17, 22, 3, 1, '#fff4d7');
  path(g, 'M2 3h5v2h11V3h5v12h-3v3H5v-3H2z', ink);
  path(g, 'M3 4h3v3h13V4h3v10h-3v3H6v-3H3z', '#f2b277');
  rect(g, 4, 5, 2, 5, '#be7866'); rect(g, 19, 5, 2, 5, '#be7866');
  rect(g, 11, 6, 3, 6, '#fff4d7'); rect(g, 7, 12, 11, 4, '#fff4d7');
  eyes(g, 7, 16, 10); rect(g, 11, 12, 3, 2, ink); rect(g, 12, 15, 2, 2, '#ec8e9f');
  rect(g, 7, 18, 12, 1, '#6caaa1'); rect(g, 12, 19, 2, 2, '#ffe194');
}
function bird(g) {
  path(g, 'M6 8h3V5h9v2h3v4h3v3h-4v6h-3v2H7v-3H4v-2H2v-4h4z', ink);
  path(g, 'M7 8h3V6h7v2h3v4h2v1h-3v6h-3v2H8v-3H5v-3H3v-1h4z', '#82bad0');
  path(g, 'M9 13h8v6h-2v2h-5v-2H8v-4z', '#ffe4b1');
  path(g, 'M5 12h6v2h2v3H7v-2H5z', '#5595bb');
  const e = group(g, { class: 'sprite-eyes' }); rect(e, 15, 9, 2, 3, ink); rect(e, 15, 9, 1, 1, '#ffffff');
  rect(g, 20, 11, 4, 2, '#e6a154'); rect(g, 17, 13, 2, 2, '#ee9d9d');
  rect(g, 9, 22, 2, 2, '#ab7862'); rect(g, 15, 22, 2, 2, '#ab7862');
  rect(g, 11, 4, 2, 2, ink); rect(g, 13, 3, 2, 3, ink);
}
function turtle(g) {
  path(g, 'M4 13V9h3V7h8v2h3v5h5v2h2v5h-2v2h-6v-2h-3v3h-3v-2H7v2H4v-3H1v-4h3z', ink);
  path(g, 'M5 13v-3h3V8h6v2h3v9H4v-4z', '#6f9982');
  rect(g, 8, 9, 6, 4, '#b2d190'); rect(g, 5, 14, 4, 4, '#94ba85');
  rect(g, 10, 14, 6, 4, '#b4ce83'); rect(g, 3, 18, 15, 2, '#c6d899');
  path(g, 'M18 15h4v2h2v3h-2v2h-4v-2h-2v-3h2z', '#b5cf93');
  rect(g, 5, 21, 2, 2, '#9cbf8a'); rect(g, 12, 21, 2, 2, '#9cbf8a');
  rect(g, 20, 17, 2, 2, ink); rect(g, 21, 20, 2, 1, '#e2a29c'); rect(g, 1, 18, 3, 1, '#b3c68c');
}
function bunny(g) {
  path(g, 'M6 1h4v7h4V1h4v9h3v8h-3v2h2v4H5v-3H4v-8h2z', ink);
  rect(g, 7, 2, 2, 8, '#fcf0e2'); rect(g, 15, 2, 2, 8, '#fcf0e2');
  rect(g, 8, 3, 1, 5, '#e9b5c6'); rect(g, 16, 3, 1, 5, '#e9b5c6');
  path(g, 'M7 9h10v2h3v6h-3v3h2v3H6v-3H5v-6h2z', '#fff5df');
  rect(g, 6, 21, 13, 2, '#e8d5d5'); eyes(g, 8, 16, 12);
  rect(g, 12, 15, 2, 1, '#b78397'); rect(g, 7, 16, 2, 1, '#efb4c1'); rect(g, 18, 16, 2, 1, '#efb4c1');
  rect(g, 10, 19, 4, 3, '#fff9ed'); rect(g, 18, 19, 3, 3, '#fff9ed');
}
function fox(g) {
  path(g, 'M19 17h2v-5h3v9h-2v3h-9v-3h4z', ink);
  path(g, 'M20 18h2v-5h1v8h-3v2h-5v-1h3z', '#d8885e'); rect(g, 22, 13, 1, 5, '#fff2d0');
  path(g, 'M6 14h11v2h2v8H6v-2H4v-5h2z', ink); rect(g, 6, 16, 11, 7, '#dd9463');
  rect(g, 9, 17, 5, 6, '#fff1d0');
  path(g, 'M3 2h4v3h3v2h5V5h3V2h4v12h-3v3h-3v2H9v-2H6v-3H3z', ink);
  path(g, 'M4 3h2v3h4v2h5V6h4V3h2v10h-3v3h-3v2h-5v-2H7v-3H4z', '#f0a36a');
  rect(g, 5, 4, 1, 5, '#9f6c7f'); rect(g, 19, 4, 1, 5, '#9f6c7f');
  path(g, 'M5 12h4v2h3v2h2v-2h3v-2h3v1h-2v3h-3v2h-5v-2H7v-3H5z', '#fff0d3');
  eyes(g, 7, 16, 10); rect(g, 11, 14, 3, 2, ink);
}
function frog(g) {
  path(g, 'M4 9h6v2h5V9h6v5h2v7h-3v3H5v-2H2v-7h2z', ink);
  rect(g, 5, 10, 4, 5, '#b6d591'); rect(g, 16, 10, 4, 5, '#b6d591');
  rect(g, 4, 15, 18, 6, '#98bf81'); rect(g, 6, 21, 13, 2, '#98bf81');
  eyes(g, 6, 17, 11); rect(g, 9, 18, 7, 1, ink); rect(g, 5, 17, 3, 1, '#e8a5a2'); rect(g, 18, 17, 3, 1, '#e8a5a2');
  rect(g, 8, 20, 9, 2, '#d7e4b0');
}
function duck(g) {
  path(g, 'M12 5h8v2h2v5h3v3h-6v6h-3v2H5v-2H2v-8h3v3h7z', ink);
  path(g, 'M13 6h6v2h2v4h3v2h-6v6h-3v2H6v-2H3v-5h1v2h9z', '#f5d578');
  rect(g, 6, 17, 6, 3, '#e4b85e'); rect(g, 21, 12, 4, 2, '#e29869');
  rect(g, 17, 9, 2, 2, ink); rect(g, 18, 12, 2, 1, '#eba48b');
  rect(g, 7, 23, 3, 1, '#c88364'); rect(g, 13, 23, 3, 1, '#c88364');
}
const drawings = { cat, dog, bird, turtle, bunny, fox, frog, duck };
function animal(parent, kind, x = 0, y = 0, scale = 1, motion = '') {
  const anchor = group(parent, { transform: `translate(${x} ${y}) scale(${scale})` });
  const animated = group(anchor, { class: motion ? `animal-motion ${motion}` : 'animal-drawing' });
  (Object.hasOwn(drawings, kind) ? drawings[kind] : cat)(animated);
  return anchor;
}
export function createSprite(kind = 'cat', className = '') {
  const svg = node('svg', { viewBox: '0 0 28 28', class: `pixel-sprite ${className}`, 'data-animal': Object.hasOwn(drawings, kind) ? kind : 'cat', 'aria-hidden': 'true', focusable: 'false', 'shape-rendering': 'crispEdges' });
  animal(svg, kind, 1, 1);
  return svg;
}
function cloud(parent, x, y, scale = 1, variant = '') {
  const p = group(parent, { transform: `translate(${x} ${y}) scale(${scale})` });
  const g = group(p, { class: `cloud ${variant}` });
  path(g, 'M0 10h5V5h8V0h13v4h8v5h7v9H0z', '#fffdf4');
  rect(g, 5, 18, 31, 2, '#d7e4ef');
}
function flower(parent, x, y, color = '#ef9bac', scale = 1) {
  const g = group(parent, { transform: `translate(${x} ${y}) scale(${scale})` });
  rect(g, 3, 5, 1, 6, '#5f967f'); rect(g, 1, 8, 2, 1, '#6ca184');
  rect(g, 2, 0, 3, 7, color); rect(g, 0, 2, 7, 3, color); rect(g, 2, 2, 3, 3, '#fff0aa');
}
function tree(parent, x, y, scale = 1, type = 'green') {
  const g = group(parent, { transform: `translate(${x} ${y}) scale(${scale})` });
  const colors = type === 'pink' ? ['#b485a9', '#dbaac0', '#efc3cd'] : ['#729f8e', '#9bbd97', '#c4d5a7'];
  path(g, 'M20 20h8v45h6v3H14v-3h6z', '#947b75'); rect(g, 23, 25, 3, 40, '#b59680');
  path(g, 'M8 11h7V4h18v7h7v9h5v20h-6v6H6v-6H0V22h8z', colors[0]);
  path(g, 'M10 11h7V5h14v8h8v9h5v13h-6v6H8v-5H1V23h9z', colors[1]);
  path(g, 'M11 12h7V6h12v8h6v7h-7v-3H15v5H5v-3h6z', colors[2]);
  rect(g, 10, 30, 3, 3, '#ffe3ae'); rect(g, 31, 26, 3, 3, '#ffe3ae'); rect(g, 22, 37, 3, 3, '#ffe3ae');
}
function butterfly(parent, x, y, color = '#c19cc9') {
  const anchor = group(parent, { transform: `translate(${x} ${y})` });
  const g = group(anchor, { class: 'butterfly' });
  rect(g, 0, 0, 3, 4, color); rect(g, 4, 0, 3, 4, color); rect(g, 1, 4, 2, 2, color); rect(g, 4, 4, 2, 2, color); rect(g, 3, 2, 1, 4, '#79617c');
}
export function createMeadow() {
  const svg = node('svg', { viewBox: '0 0 480 160', preserveAspectRatio: 'xMidYMax slice', class: 'meadow-illustration', 'aria-hidden': 'true', focusable: 'false', 'shape-rendering': 'crispEdges' });
  rect(svg, 0, 0, 480, 160, '#e7f2f4');
  // Sky, stepped sunlight, and drifting cloud layers.
  const sun = group(svg, { class: 'sun-rays' });
  rect(sun, 405, 12, 2, 5, '#eccb82'); rect(sun, 405, 47, 2, 5, '#eccb82');
  rect(sun, 384, 31, 5, 2, '#eccb82'); rect(sun, 424, 31, 5, 2, '#eccb82');
  rect(sun, 390, 18, 3, 3, '#eccb82'); rect(sun, 419, 44, 3, 3, '#eccb82');
  path(svg, 'M398 21h17v4h5v14h-5v5h-17v-5h-5V25h5z', '#f5d785');
  rect(svg, 399, 29, 2, 3, '#a48667'); rect(svg, 411, 29, 2, 3, '#a48667'); rect(svg, 404, 35, 5, 1, '#a48667');
  cloud(svg, 258, 18, .72); cloud(svg, 347, 9, .8, 'cloud-slow'); cloud(svg, 433, 57, .6);
  // A stepped rainbow, rather than a smoothed vector arc.
  const rainbow = ['#e5a6b5', '#edbc8f', '#edda9e', '#b1cda4', '#a4bfd8'];
  for (let i = 0; i < rainbow.length; i++) {
    const left = 292 + i*3, right = 373 - i*3, top = 33 + i*3;
    path(svg, `M${left} 91V${top+24}h6v-10h9v-8h12v-6H${right-27}v6h12v8h9v10h6V91z`, rainbow[i]);
  }
  path(svg, 'M307 91V72h6v-10h9v-8h21v8h9v10h6v19z', '#e7f2f4');
  path(svg, 'M200 119v-7h18v-8h28v-7h41v8h22v9h34v-10h22V94h31v8h24v10h30v8h30v40H200z', '#cedcce');
  path(svg, 'M0 136h37v-6h40v3h42v-6h47v6h49v-12h27v-7h24v-7h39v8h28v7h48v-5h30v-8h35v8h34v9h31v34H0z', '#b1d3ab');
  path(svg, 'M0 145h39v-5h38v4h43v-6h38v4h45v-9h43v-7h44v7h37v-5h40v6h30v-9h38v6h45v29H0z', '#a1cd9b');
  // Pond, stepping stones, picnic blanket, and trees.
  path(svg, 'M344 139h15v-4h48v4h17v5h12v9h-11v5h-75v-4h-17v-9h11z', '#83b6bf');
  path(svg, 'M349 140h13v-3h43v4h16v5h11v5h-18v4h-61v-4h-15v-5h11z', '#b2d9d9');
  rect(svg, 361, 144, 17, 1, '#e2f0df', { class: 'water-glimmer' }); rect(svg, 398, 150, 12, 1, '#e2f0df', { class: 'water-glimmer delayed' });
  path(svg, 'M403 144h11v3h-3v2h-10v-2h2z', '#7baa94'); flower(svg, 407, 138, '#e7aec7', .6);
  tree(svg, 431, 51, 1.15, 'pink'); tree(svg, 255, 68, .7);
  path(svg, 'M265 160v-6h8v-6h12v-6h17v-5h20v-4h20v5h-19v5h-19v6h-16v6h-12v5z', '#edddb3');
  rect(svg, 303, 135, 35, 12, '#e6aab2');
  for (let x = 304; x < 338; x += 8) rect(svg, x, 135, 3, 12, '#f5d7c7');
  rect(svg, 303, 138, 35, 2, '#f5d7c7'); rect(svg, 303, 144, 35, 2, '#f5d7c7');
  animal(svg, 'cat', 310, 100, 1.35, 'idle-cat'); animal(svg, 'dog', 272, 119, 1, 'idle-dog');
  animal(svg, 'turtle', 374, 122, 1, 'idle-turtle'); animal(svg, 'bunny', 444, 115, .9, 'idle-bunny');
  animal(svg, 'bird', 348, 75, .8, 'idle-bird');
  // Bird's tiny letterbox: the visual metaphor for kept conversations.
  rect(svg, 355, 107, 3, 27, '#a68a79'); rect(svg, 348, 100, 20, 13, '#927b9b');
  rect(svg, 349, 101, 17, 10, '#c8afcb'); rect(svg, 352, 104, 10, 2, '#7a657f'); rect(svg, 368, 96, 2, 9, '#b2868b'); rect(svg, 369, 96, 6, 4, '#e4a395');
  animal(svg, 'frog', 421, 137, .6, 'idle-frog');
  const flowers = [[15,145,'#eea3b0'],[62,139,'#fff0b0'],[119,146,'#bdacd4'],[173,141,'#f3b796'],[236,138,'#e99bac'],[251,149,'#fff0b0'],[292,151,'#c0a8d3'],[344,150,'#f6df95'],[459,146,'#f6df95']];
  for (const [x,y,c] of flowers) flower(svg, x, y, c, .75);
  for (const [x,y] of [[25,154],[86,150],[138,154],[211,148],[260,142],[331,153],[440,155],[470,134]]) {
    rect(svg,x,y,1,3,'#79a782'); rect(svg,x+2,y-1,1,4,'#79a782'); rect(svg,x+4,y,1,3,'#79a782');
  }
  butterfly(svg, 239, 91); butterfly(svg, 426, 91, '#e4ae77');
  return svg;
}
export function createMiniMeadow() {
  const svg = node('svg', { viewBox: '0 0 180 58', class: 'mini-meadow', 'aria-hidden': 'true', focusable: 'false', 'shape-rendering': 'crispEdges' });
  rect(svg, 0, 0, 180, 58, '#e5dcf0'); cloud(svg, 11, 9, .6); cloud(svg, 122, 4, .7, 'cloud-slow');
  path(svg, 'M0 45h19v-6h31v3h28v-4h39v6h35v-7h28v21H0z', '#bdc9b2');
  rect(svg, 55, 47, 64, 6, '#d7acc1');
  animal(svg, 'cat', 66, 23, 1, 'idle-cat'); animal(svg, 'bird', 97, 31, .7, 'idle-bird');
  flower(svg, 25, 43, '#e7a6b1', .8); flower(svg, 143, 42, '#fff0b0', .8);
  return svg;
}
export function createIcon(name, className = '') {
  const svg = node('svg', { viewBox: '0 0 20 20', class: `pixel-icon ${className}`, 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor', 'shape-rendering': 'crispEdges' });
  const shapes = {
    paw: 'M4 3h3v4H4zM9 2h3v4H9zM14 4h3v4h-3zM1 8h3v4H1zM7 9h6v2h2v5h-2v1H6v-1H4v-4h3z',
    plus: 'M9 3h2v6h6v2h-6v6H9v-6H3V9h6z',
    arrow: 'M9 3h2v2h2v2h2v2h-3V7h-1v10H9V7H8v2H5V7h2V5h2z',
    northeast: 'M6 4h10v10h-2V8h-2v2h-2v2H8v2H6v2H4v-2h2v-2h2v-2h2V8h2V6H6z',
    search: 'M5 2h7v2h2v7h-2v2H5v-2H3V4h2zm1 2v1H5v5h1v1h5v-1h1V5h-1V4zm7 9h2v2h2v2h-3v-2h-1z',
    globe: 'M6 2h8v2h2v2h2v8h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2zm1 2v2H5v2H4v4h2v2h2v2h4v-3H9v-3H6V7h3V4zm6 1v4h3V7h-2V5z',
    memory: 'M4 2h11v2h2v13H3V3h1zm1 2v11h10V5h-2V4zm2 2h6v2H7zm0 4h6v2H7z',
    flower: 'M7 1h6v4h5v6h-5v4H7v-4H2V5h5zm1 5v4h4V6zm1 10h2v3H9z',
    sun: 'M9 0h2v3H9zM9 17h2v3H9zM0 9h3v2H0zM17 9h3v2h-3zM3 2h2v3H3zM15 15h2v3h-2zM15 2h2v3h-2zM3 15h2v3H3zM7 5h6v2h2v6h-2v2H7v-2H5V7h2z',
    pause: 'M5 3h4v14H5zM12 3h4v14h-4z',
    play: 'M5 2h2v2h3v2h3v2h3v4h-3v2h-3v2H7v2H5z',
    menu: 'M3 4h14v2H3zm0 5h14v2H3zm0 5h14v2H3z',
    close: 'M4 3h2v2h2v2h4V5h2V3h2v3h-2v2h-2v4h2v2h2v3h-2v-2h-2v-2H8v2H6v2H4v-3h2v-2h2V8H6V6H4z',
    home: 'M8 2h4v2h2v2h2v2h2v3h-3v7h-4v-5H9v5H5v-7H2V8h2V6h2V4h2z',
    check: 'M2 9h3v3h3v-2h2V8h2V6h2V4h3v4h-2v2h-2v2h-2v2H9v3H6v-2H4v-2H2z',
    heart: 'M3 3h5v2h4V3h5v2h2v6h-2v2h-2v2h-2v2H7v-2H5v-2H3v-2H1V5h2z',
  };
  path(svg, Object.hasOwn(shapes, name) ? shapes[name] : shapes.flower, 'currentColor');
  return svg;
}
