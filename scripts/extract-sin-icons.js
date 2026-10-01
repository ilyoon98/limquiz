// Extract the seven flat symbols from the original 2048px resistance atlas.
// Usage: node scripts/extract-sin-icons.js path/to/BattleUI_SkillInfoResisIcon.png
// The beige backing is keyed out, including its antialiased edge pixels.
const sharp = require('sharp');
const path = require('node:path');

const symbols = [
  ['wrath', 1, 0, [137, 49, 38]],
  ['lust', 6, 0, [178, 98, 46]],
  ['sloth', 3, 1, [227, 136, 0]],
  ['gluttony', 0, 2, [96, 130, 41]],
  ['gloom', 5, 2, [49, 101, 112]],
  ['pride', 2, 3, [24, 81, 134]],
  ['envy', 7, 3, [126, 78, 148]],
];

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the original BattleUI_SkillInfoResisIcon.png path.');
  const metadata = await sharp(source).metadata();
  if (metadata.width !== 2048 || metadata.height !== 2048) {
    throw new Error('Expected the original 2048 x 2048 atlas, not a resized preview.');
  }
  const background = [236, 202, 162];
  for (const [name, column, row, color] of symbols) {
    const pixels = await sharp(source)
      .extract({ left: column * 256, top: row * 256, width: 256, height: 256 })
      .ensureAlpha().raw().toBuffer();
    const direction = color.map((value, channel) => value - background[channel]);
    const norm = direction.reduce((sum, value) => sum + value * value, 0);
    for (let i = 0; i < pixels.length; i += 4) {
      // Recover coverage from the foreground/background color mixture. This
      // removes the beige fringe without cutting holes into the colored symbol.
      const coverage = Math.max(0, Math.min(1, direction.reduce((sum, value, c) =>
        sum + (pixels[i + c] - background[c]) * value, 0) / norm));
      const alpha = Math.round(pixels[i + 3] * coverage);
      if (coverage < 0.98) {
        for (let c = 0; c < 3; c++) pixels[i + c] = color[c];
      }
      pixels[i + 3] = alpha;
    }
    const output = path.join(__dirname, '..', 'images', 'sins', `${name}.webp`);
    await sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } })
      .trim({ background: '#00000000', threshold: 1 })
      .resize(112, 112, { fit: 'contain', background: '#00000000' })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' })
      .webp({ lossless: true }).toFile(output);
    console.log(`Extracted ${name}: transparent 128 x 128 WebP`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
