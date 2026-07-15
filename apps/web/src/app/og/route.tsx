import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

const BG = 'linear-gradient(135deg, #0B0D18 0%, #1a1d2e 40%, #252840 100%)';
const ACCENT = 'linear-gradient(90deg, #5c7cfa, #ff922b)';

export async function GET(request: Request) {
  const { searchParams, hostname } = new URL(request.url);
  const emoji = searchParams.get('emoji');
  const title = searchParams.get('title');
  const head = searchParams.get('head');
  const def = searchParams.get('def');
  const pron = searchParams.get('pron');
  const isEmojiMode = !!emoji;
  const isEntryMode = !!head;

  // Load Nunito ExtraBold font
  const fontPath = join(process.cwd(), 'public', 'fonts', 'nunito-extrabold.woff');
  const fontBuf = readFileSync(fontPath);
  const nunitoFont = fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength);

  // Load logo only for default (branding) mode
  let logoUrl = '';
  if (!isEmojiMode && !isEntryMode) {
    const logoPath = join(process.cwd(), 'public', 'img', 'logo.png');
    const logoBuf = readFileSync(logoPath);
    logoUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
  }

  return new ImageResponse(
    (
      <div style={{
        height: '100%', width: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundImage: BG, fontFamily: 'system-ui, sans-serif',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Gradient orbs */}
        <div style={{ position: 'absolute', top: -180, right: -120, width: 700, height: 700, borderRadius: '50%', background: 'rgba(92,124,250,0.08)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: -220, left: -140, width: 800, height: 800, borderRadius: '50%', background: 'rgba(255,146,43,0.06)', filter: 'blur(100px)' }} />
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: ACCENT }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isEmojiMode || isEntryMode ? 32 : 48, zIndex: 1, padding: '0 60px' }}>
          {isEntryMode ? (
            <>
              {/* Head word — large, prominent */}
              <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2, textAlign: 'center', maxWidth: 1000, fontFamily: 'Nunito' }}>
                {head}
              </div>
              {pron && (
                <div style={{ fontSize: 40, fontWeight: 400, color: '#91a7ff', textAlign: 'center', maxWidth: 900 }}>
                  {pron}
                </div>
              )}
              {def && (
                <div style={{ fontSize: 32, fontWeight: 400, color: '#bac8ff', textAlign: 'center', maxWidth: 950, lineHeight: 1.5 }}>
                  {def}
                </div>
              )}
              {/* Language Player badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #5c7cfa, #748ffc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 700 }}>LP</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#748ffc' }}>Language Player</div>
              </div>
            </>
          ) : isEmojiMode ? (
            <>
              <div style={{ fontSize: 180, lineHeight: 1, filter: 'drop-shadow(0 8px 24px rgba(92,124,250,0.15))' }}>
                {emoji}
              </div>
              {title && (
                <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2, textAlign: 'center', maxWidth: 900, fontFamily: 'Nunito' }}>
                  {title}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Logo + wordmark row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, width: '100%' }}>
                <img src={logoUrl} alt="Language Player" width={186} height={186}
                  style={{ width: 186, height: 186, borderRadius: '50%', boxShadow: '0 12px 48px rgba(92,124,250,0.25)' }} />
                <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.1, fontFamily: 'Nunito' }}>
                  Language Player
                </div>
              </div>
            </>
          )}
        </div>

        {(isEmojiMode || isEntryMode) && (
          <div style={{ position: 'absolute', bottom: 28, fontSize: 24, color: '#748ffc', fontWeight: 500, letterSpacing: '0.05em' }}>
            {isEntryMode ? hostname : title ? `${title} \u2014 ${hostname}` : hostname}
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: 'Nunito', data: nunitoFont, style: 'normal', weight: 800 }] },
  );
}
