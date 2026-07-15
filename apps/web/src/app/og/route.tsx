import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  // Build absolute URL for the logo (works in both dev and production)
  const { origin, hostname } = new URL(request.url);
  const logoUrl = `${origin}/img/logo.png`;

  // Load Inter font
  const [interBold, interRegular] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2',
    ).then((res) => res.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2',
    ).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage:
            'linear-gradient(135deg, #0B0D18 0%, #1a1d2e 40%, #252840 100%)',
          fontFamily: 'Inter',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -80,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'rgba(92,124,250,0.08)',
            filter: 'blur(60px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -160,
            left: -100,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'rgba(255,146,43,0.06)',
            filter: 'blur(80px)',
          }}
        />

        {/* Accent line at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #5c7cfa, #ff922b)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
            zIndex: 1,
            padding: '0 80px',
          }}
        >
          {/* Logo + wordmark row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
            }}
          >
            {/* Circular logo */}
            <img
              src={logoUrl}
              alt="Language Player"
              width={96}
              height={96}
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                boxShadow: '0 8px 32px rgba(92,124,250,0.25)',
              }}
            />
            {/* Wordmark */}
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#ffffff',
                lineHeight: 1.1,
              }}
            >
              Language Player
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: '#91a7ff',
              textAlign: 'center',
              maxWidth: 750,
              lineHeight: 1.4,
            }}
          >
            Learn 60+ languages through authentic videos with interactive dual subtitles
          </div>

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: 12,
            }}
          >
            {['🎬 600K+ Videos', '📖 Built-in Dictionary', '🌍 207 Languages'].map(
              (feature) => (
                <div
                  key={feature}
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: '#dbe4ff',
                    background: 'rgba(92,124,250,0.12)',
                    borderRadius: 20,
                    padding: '8px 20px',
                    border: '1px solid rgba(92,124,250,0.2)',
                  }}
                >
                  {feature}
                </div>
              ),
            )}
          </div>
        </div>

        {/* URL at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            fontSize: 20,
            color: '#748ffc',
            fontWeight: 400,
            letterSpacing: '0.05em',
          }}
        >
          {hostname}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: await interBold,
          style: 'normal',
          weight: 700,
        },
        {
          name: 'Inter',
          data: await interRegular,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  );
}
