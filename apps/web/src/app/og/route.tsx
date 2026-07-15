import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

const BG = 'linear-gradient(135deg, #0B0D18 0%, #1a1d2e 40%, #252840 100%)';
const ACCENT = 'linear-gradient(90deg, #5c7cfa, #ff922b)';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get('emoji');
  const title = searchParams.get('title');
  const head = searchParams.get('head');
  const def = searchParams.get('def');
  const pron = searchParams.get('pron');
  const videos = searchParams.get('videos');
  const lang = searchParams.get('lang');
  const isEmojiMode = !!emoji;
  const isEntryMode = !!head;
  const isVideosMode = !!videos;

  // Load Nunito ExtraBold font
  const fontPath = join(process.cwd(), 'public', 'fonts', 'nunito-extrabold.woff');
  const fontBuf = readFileSync(fontPath);
  const nunitoFont = fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength);

  // Load logo only for default (branding) mode
  let logoUrl = '';
  if (!isEmojiMode && !isEntryMode && !isVideosMode) {
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
            <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2, textAlign: 'center', maxWidth: 1000, fontFamily: 'Nunito' }}>
              {head}
            </div>
          ) : isEmojiMode ? (
            <>
              <div style={{ fontSize: 360, lineHeight: 1, filter: 'drop-shadow(0 12px 40px rgba(92,124,250,0.2))' }}>
                {emoji}
              </div>
            </>
          ) : isVideosMode ? (
            <>
              {/* Title */}
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff', textAlign: 'center', maxWidth: 1000, fontFamily: 'Nunito', lineHeight: 1.3 }}>
                Watch these awesome videos{lang ? ` and learn ${lang}` : ''}!
              </div>
              {/* 2x2 video thumbnail grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1].map(row => (
                  <div key={row} style={{ display: 'flex', gap: 8 }}>
                    {videos!.split(',').slice(row * 2, row * 2 + 2).map((vid, i) => (
                      <img
                        key={`${vid}-${i}`}
                        src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
                        alt=""
                        width={280}
                        height={158}
                        style={{
                          width: 280, height: 158, borderRadius: 12,
                          border: '2px solid rgba(92,124,250,0.25)',
                          objectFit: 'cover',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
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
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: 'Nunito', data: nunitoFont, style: 'normal', weight: 800 }] },
  );
}
