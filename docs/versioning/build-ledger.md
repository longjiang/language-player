# Build Number Ledger

Consumed store build numbers for Language Player 3 (`ca.zerotohero.go`).

SPEC-076: every upload to any track of either store consumes a number —
even if the build is later rejected, archived, or rolled back. iOS
(`ios.buildNumber`) and Android (`android.versionCode`) share one number
per product release; never reuse or decrease a number.

| N | Platform / track | Version | Date | Status |
|---|---|---|---|---|
| 1 | Android — Internal/Closed testing (LP3) | 3.0.0 | 2026-08-13 | consumed — never reuse |
| 1 | iOS — App Store (LP3) | 3.0.0 | 2026-08-13 | live |
| 2 | Android — Production (LP3) | 3.0.0 | 2026-08-13 | live |
| 3 | Android — Internal testing | 3.1.0 | 2026-08-14 | consumed |
| 3 | iOS — App Store | 3.1.0 | 2026-08-14 | consumed |
