// Gera os ícones PNG do PWA a partir de public/favicon.svg
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
const destino = (nome) => fileURLToPath(new URL(`../public/${nome}`, import.meta.url));

await sharp(svg).resize(192, 192).png().toFile(destino('icone-192.png'));
await sharp(svg).resize(512, 512).png().toFile(destino('icone-512.png'));
await sharp(svg).resize(180, 180).png().toFile(destino('apple-touch-icon.png'));

// Ícone "maskable": o Android recorta em círculo/squircle, então o desenho precisa de margem
const interno = await sharp(svg).resize(384, 384).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2f6fed' } })
  .composite([{ input: interno, top: 64, left: 64 }])
  .png()
  .toFile(destino('icone-maskable-512.png'));

console.log('Ícones gerados em public/');
