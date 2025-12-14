const fs = require('fs');
const path = require('path');
const sharp = require('./extension/node_modules/sharp');

// Read SVG content from icon.svg file
const svgPath = path.join(__dirname, 'extension', 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

async function generateIcons() {
    console.log('🎨 Generating PNG icons from SVG...\n');

    const sizes = [
        { size: 128, filename: 'icon.png', description: 'Extension icon (128x128)' },
        { size: 256, filename: 'icon-256.png', description: 'High resolution (256x256)' },
        { size: 512, filename: 'icon-512.png', description: 'Extra high resolution (512x512)' }
    ];

    for (const { size, filename, description } of sizes) {
        try {
            const outputPath = path.join(__dirname, 'extension', filename);

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
