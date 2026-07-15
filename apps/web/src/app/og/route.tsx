import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

export const runtime = 'nodejs';

const W = 1200;
const H = 630;

const BG_TOP = '#0B0D18';
const BG_MID = '#1a1d2e';
const BG_BOT = '#252840';
const ACCENT_START = '#5c7cfa';
const ACCENT_END = '#ff922b';

// ── Helpers ───────────────────────────────────────────────────

function buildBaseSvg(innerSvg: string): string {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="40%" stop-color="${BG_MID}"/>
      <stop offset="100%" stop-color="${BG_BOT}"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ACCENT_START}"/>
      <stop offset="100%" stop-color="${ACCENT_END}"/>
    </linearGradient>
    <radialGradient id="orbBlue" cx="80%" cy="-10%" r="70%">
      <stop offset="0%" stop-color="${ACCENT_START}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${ACCENT_START}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbOrange" cx="0%" cy="110%" r="70%">
      <stop offset="0%" stop-color="${ACCENT_END}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${ACCENT_END}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#orbBlue)"/>
  <rect width="${W}" height="${H}" fill="url(#orbOrange)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="url(#accentGrad)"/>
  ${innerSvg}
</svg>`;
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function fetchThumbnail(videoId: string, w: number, h: number): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return sharp(buf).resize(w, h).png().toBuffer();
  } catch {
    return null;
  }
}

function loadLocalImageAsDataUri(relativePath: string): string {
  const fullPath = join(process.cwd(), 'public', relativePath);
  const buf = readFileSync(fullPath);
  const ext = relativePath.split('.').pop()?.toLowerCase() ?? 'png';
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Mode renderers ────────────────────────────────────────────

async function renderDefault(): Promise<Buffer> {
  const logoUri = loadLocalImageAsDataUri('img/logo.png');
  const centerX = Math.round((W - 900) / 2);
  const centerY = Math.round((H - 186) / 2);
  const svg = buildBaseSvg(`
    <image href="${logoUri}" x="${centerX}" y="${centerY}" width="186" height="186"/>
    <text x="${centerX + 218}" y="${centerY + 120}" font-family="Arial, sans-serif" font-weight="800"
          font-size="96" fill="#ffffff" letter-spacing="-2">Language Player</text>
  `);
  return svgToPng(svg);
}

async function renderEntry(head: string, def?: string, pron?: string): Promise<Buffer> {
  const lines: string[] = [];
  lines.push(`<text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="150" fill="#ffffff" letter-spacing="-2">${escapeXml(head)}</text>`);
  let yOff = 60;
  if (pron) {
    lines.push(`<text x="${W / 2}" y="${H / 2 + yOff}" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.6)">${escapeXml(pron)}</text>`);
    yOff += 50;
  }
  if (def) {
    lines.push(`<text x="${W / 2}" y="${H / 2 + yOff}" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.5)">${escapeXml(def)}</text>`);
  }
  return svgToPng(buildBaseSvg(lines.join('\n')));
}

async function renderEmoji(emoji: string, title?: string): Promise<Buffer> {
  let extra = '';
  if (title) {
    extra = `<text x="${W / 2}" y="${H / 2 + 200}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="36" fill="#ffffff">${escapeXml(title)}</text>`;
  }
  return svgToPng(buildBaseSvg(`
    <text x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="340">${emoji}</text>
    ${extra}
  `));
}

async function renderVideos(videoIds: string[]): Promise<Buffer> {
  // No title text — full-bleed 2×2 thumbnail grid
  const baseSvg = buildBaseSvg('');
  let base = await svgToPng(baseSvg);

  // 2×2 grid — ~8% bigger than before, centred in the 1200×630 canvas
  const colW = 576;
  const colH = 324;
  const gap = 8;
  const gridW = colW * 2 + gap;   // 1160
  const gridH = colH * 2 + gap;   // 656
  const startX = Math.round((W - gridW) / 2);  // 20
  const startY = 6 + Math.round((H - 6 - gridH) / 2); // centred below accent bar (bottom may clip)

  const thumbs = await Promise.all(
    videoIds.slice(0, 4).map(id => fetchThumbnail(id, colW, colH))
  );

  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < 4; i++) {
    if (!thumbs[i]) continue;
    const col = i % 2;
    const row = Math.floor(i / 2);
    composites.push({
      input: thumbs[i]!,
      top: startY + row * (colH + gap),
      left: startX + col * (colW + gap),
    });
  }

  if (composites.length > 0) {
    base = await sharp(base).composite(composites).png().toBuffer();
  }

  // Rounded-rect borders around each thumbnail slot
  const borderSvg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    [0, 1, 2, 3].map(i => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (colW + gap);
      const y = startY + row * (colH + gap);
      return `<rect x="${x}" y="${y}" width="${colW}" height="${colH}" rx="16" ry="16" fill="none" stroke="rgba(92,124,250,0.25)" stroke-width="2"/>`;
    }).join('\n') +
    `</svg>`;
  const borderOverlay = await sharp(Buffer.from(borderSvg)).png().toBuffer();
  return sharp(base).composite([{ input: borderOverlay }]).png().toBuffer();
}

// ── Route handler ─────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get('emoji');
  const title = searchParams.get('title');
  const head = searchParams.get('head');
  const def = searchParams.get('def');
  const pron = searchParams.get('pron');
  const videos = searchParams.get('videos');
  const lang = searchParams.get('lang');

  try {
    let png: Buffer;

    if (head) {
      png = await renderEntry(head, def ?? undefined, pron ?? undefined);
    } else if (emoji) {
      png = await renderEmoji(emoji, title ?? undefined);
    } else if (videos) {
      png = await renderVideos(videos.split(',').slice(0, 4));
    } else {
      png = await renderDefault();
    }

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('OG image generation failed:', error);
    return new Response(
      `OG render error: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    );
  }
}
