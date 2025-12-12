const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgContent = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="docGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A90E2;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#357ABD;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="checkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#5CB85C;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4CAF50;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="60" fill="#F8F9FA" stroke="#E1E8ED" stroke-width="2"/>
  <g id="document">
    <rect x="32" y="24" width="56" height="72" rx="4" fill="url(#docGradient)" stroke="#2C5F8D" stroke-width="2"/>
    <path d="M 76 24 L 88 24 L 88 36 Z" fill="#357ABD" stroke="#2C5F8D" stroke-width="1.5"/>
    <path d="M 88 24 L 88 36 L 76 36 Z" fill="#2C5F8D" opacity="0.3"/>
    <line x1="40" y1="40" x2="70" y2="40" stroke="#FFFFFF" stroke-width="2.5" opacity="0.8"/>
    <line x1="40" y1="48" x2="75" y2="48" stroke="#FFFFFF" stroke-width="2.5" opacity="0.8"/>
    <line x1="40" y1="56" x2="65" y2="56" stroke="#FFFFFF" stroke-width="2.5" opacity="0.8"/>
    <line x1="40" y1="68" x2="72" y2="68" stroke="#FFFFFF" stroke-width="2.5" opacity="0.6"/>
    <line x1="40" y1="76" x2="68" y2="76" stroke="#FFFFFF" stroke-width="2.5" opacity="0.6"/>
    <line x1="40" y1="84" x2="74" y2="84" stroke="#FFFFFF" stroke-width="2.5" opacity="0.6"/>
  </g>
  <g id="checkmark">
    <circle cx="90" cy="90" r="22" fill="url(#checkGradient)" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="90" cy="90" r="22" fill="none" stroke="#3D8B40" stroke-width="1.5"/>
    <path d="M 78 90 L 86 98 L 102 78" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <circle cx="44" cy="64" r="2" fill="#5CB85C" opacity="0.7"/>
  <circle cx="44" cy="72" r="2" fill="#5CB85C" opacity="0.7"/>
  <circle cx="44" cy="80" r="2" fill="#5CB85C" opacity="0.7"/>
</svg>`;

async function generateIcons() {
    console.log('🎨 Generating PNG icons from SVG...\n');

    const sizes = [
        { size: 128, filename: 'icon.png', description: 'Extension icon (128x128)' },
        { size: 256, filename: 'icon-256.png', description: 'High resolution (256x256)' },
        { size: 512, filename: 'icon-512.png', description: 'Extra high resolution (512x512)' }
    ];

    for (const { size, filename, description } of sizes) {
        try {
            const outputPath = path.join(__dirname, filename);

            await sharp(Buffer.from(svgContent))
                .resize(size, size)
                .png()
                .toFile(outputPath);

            console.log(`✅ Generated ${description}: ${filename}`);
        } catch (error) {
            console.error(`❌ Failed to generate ${filename}:`, error.message);
        }
    }

    console.log('\n🎉 Icon generation complete!');
    console.log('\nGenerated files:');
    console.log('  - icon.png (required for VSCode extension)');
    console.log('  - icon-256.png (optional high resolution)');
    console.log('  - icon-512.png (optional extra high resolution)');
}

generateIcons().catch(console.error);
