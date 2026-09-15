/*
 * generate-icons.js — Generate PWA icons using Node Canvas
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT_DIR = path.join(__dirname, 'icons');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function drawSpideyIcon(ctx, size) {
  const center = size / 2;
  const radius = size * 0.42;

  // Background - dark glassmorphism base
  const bgGradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.7);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.5, '#0f0f1a');
  bgGradient.addColorStop(1, '#050508');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, size, size);

  // Subtle grid pattern
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = size / 8;
  for (let x = 0; x <= size; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Outer glow ring
  const glowGradient = ctx.createRadialGradient(center, center, radius * 0.6, center, center, radius * 1.1);
  glowGradient.addColorStop(0, 'rgba(6, 182, 212, 0)');
  glowGradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.08)');
  glowGradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(center, center, radius * 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Main circle - cyan accent ring
  const ringGradient = ctx.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
  ringGradient.addColorStop(0, '#06b6d4');
  ringGradient.addColorStop(0.5, '#0891b2');
  ringGradient.addColorStop(1, '#0e7490');
  ctx.strokeStyle = ringGradient;
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner highlight on ring
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = size * 0.015;
  ctx.beginPath();
  ctx.arc(center, center, radius * 1.02, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  // Central play triangle
  const triangleSize = radius * 0.55;
  const triangleGradient = ctx.createLinearGradient(
    center - triangleSize, center - triangleSize,
    center + triangleSize, center + triangleSize
  );
  triangleGradient.addColorStop(0, '#06b6d4');
  triangleGradient.addColorStop(1, '#22d3ee');

  ctx.fillStyle = triangleGradient;
  ctx.beginPath();
  ctx.moveTo(center - triangleSize * 0.5, center - triangleSize * 0.65);
  ctx.lineTo(center - triangleSize * 0.5, center + triangleSize * 0.65);
  ctx.lineTo(center + triangleSize * 0.7, center);
  ctx.closePath();
  ctx.fill();

  // Triangle highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(center - triangleSize * 0.5, center - triangleSize * 0.65);
  ctx.lineTo(center - triangleSize * 0.5, center + triangleSize * 0.65);
  ctx.lineTo(center + triangleSize * 0.15, center);
  ctx.closePath();
  ctx.fill();

  // Subtle "sound wave" arcs on the right
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
  ctx.lineWidth = size * 0.02;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const arcRadius = radius * (0.75 + i * 0.18);
    ctx.beginPath();
    ctx.arc(center, center, arcRadius, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  }

  // Small "spider" accent - 4 tiny dots in corners
  ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
  const dotSize = size * 0.025;
  const dotOffset = size * 0.35;
  const dots = [
    [center - dotOffset, center - dotOffset],
    [center + dotOffset, center - dotOffset],
    [center - dotOffset, center + dotOffset],
    [center + dotOffset, center + dotOffset]
  ];
  dots.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
    ctx.fill();
  });

  // Maskable safe zone indicator (not drawn, but ensures center content fits in 40% radius)
  // The play triangle fits well within the 40% safe zone
}

async function generateIcons() {
  ensureDir(OUT_DIR);

  // Check if canvas is available
  try {
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');
    drawSpideyIcon(ctx, 512);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUT_DIR, 'icon-512.png'), buffer);
    console.log('✓ Canvas works, generating all sizes...');
  } catch (e) {
    console.error('Canvas not available:', e.message);
    console.log('Run: npm install canvas');
    process.exit(1);
  }

  for (const size of ICON_SIZES) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawSpideyIcon(ctx, size);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), buffer);
    console.log(`  ✓ icon-${size}.png`);
  }

  // Generate shortcut icons
  const shortcutCanvas = createCanvas(96, 96);
  const shortcutCtx = shortcutCanvas.getContext('2d');
  drawSpideyIcon(shortcutCtx, 96);
  fs.writeFileSync(path.join(OUT_DIR, 'shortcut-import.png'), shortcutCanvas.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT_DIR, 'shortcut-shuffle.png'), shortcutCanvas.toBuffer('image/png'));
  console.log('  ✓ shortcut icons');

  // Generate maskable versions (with padding)
  for (const size of [192, 512]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    // Draw with extra padding for maskable safe zone
    ctx.save();
    ctx.translate(size * 0.1, size * 0.1);
    drawSpideyIcon(ctx, size * 0.8);
    ctx.restore();
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(OUT_DIR, `icon-${size}-maskable.png`), buffer);
    console.log(`  ✓ icon-${size}-maskable.png`);
  }

  console.log('\nAll icons generated in', OUT_DIR);
}

generateIcons().catch(console.error);