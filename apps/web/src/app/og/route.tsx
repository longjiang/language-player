import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { hostname } = new URL(request.url);

  return new ImageResponse(
    (
      <div style={{
        height: '100%', width: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundImage: 'linear-gradient(135deg, #0B0D18 0%, #1a1d2e 40%, #252840 100%)',
        fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden',
      }}>
        {/* Gradient orbs */}
        <div style={{ position: 'absolute', top: -120, right: -80, width: 500, height: 500, borderRadius: '50%', background: 'rgba(92,124,250,0.08)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: -160, left: -100, width: 600, height: 600, borderRadius: '50%', background: 'rgba(255,146,43,0.06)', filter: 'blur(80px)' }} />
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #5c7cfa, #ff922b)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, zIndex: 1, padding: '0 80px' }}>
          {/* Logo + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: 'linear-gradient(135deg, #5c7cfa, #748ffc)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, fontWeight: 700, color: 'white',
              boxShadow: '0 8px 32px rgba(92,124,250,0.3)',
            }}>LP</div>
            <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.1 }}>
              Language Player
            </div>
          </div>

          <div style={{ fontSize: 28, fontWeight: 400, color: '#91a7ff', textAlign: 'center', maxWidth: 750, lineHeight: 1.4 }}>
            Learn 60+ languages through authentic videos with interactive dual subtitles
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            {['🎬 600K+ Videos', '📖 Built-in Dictionary', '🌍 207 Languages'].map(f => (
              <div key={f} style={{ fontSize: 18, fontWeight: 500, color: '#dbe4ff', background: 'rgba(92,124,250,0.12)', borderRadius: 20, padding: '8px 20px', border: '1px solid rgba(92,124,250,0.2)' }}>
                {f}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 32, fontSize: 20, color: '#748ffc', fontWeight: 400, letterSpacing: '0.05em' }}>
          {hostname}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
