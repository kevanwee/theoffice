// Analyze scene image pixel colors to calibrate collision detection
const fs = require('fs');
const PNG = require('../node_modules/pngjs/lib/png.js').PNG;
const base = 'webview-ui/public/assets/themes/pokemon/tilesets/leob-oras';
const scenes = ['1 - Littleroot.png', '3 - Route 102.png', '2 - Oldale.png'];

for (const name of scenes) {
  const buf = fs.readFileSync(base + '/' + name);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;

  const buckets = {};
  for (let i = 0; i < 2000; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const idx = (y * width + x) * 4;
    const r = data[idx],
      g = data[idx + 1],
      b = data[idx + 2],
      a = data[idx + 3];
    if (a < 128) continue;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    const greenDom = g > r + 15 && g > b + 15;
    const blueDom = b > r + 30 && b > g + 15;
    const key = greenDom ? 'green' : blueDom ? 'blue' : lum < 70 ? 'dark' : 'neutral';
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({ r, g, b, lum: Math.round(lum), sat: Math.round(sat * 100) });
  }

  console.log('\n=== ' + name + ' ' + width + 'x' + height + ' ===');
  for (const [key, arr] of Object.entries(buckets)) {
    const sample = arr
      .slice(0, 6)
      .map((s) => '(' + s.r + ',' + s.g + ',' + s.b + ' L' + s.lum + ' S' + s.sat + ')')
      .join('  ');
    console.log(key.padEnd(10) + arr.length + 'px  e.g.: ' + sample);
  }
}
