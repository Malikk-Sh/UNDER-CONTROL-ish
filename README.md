# UNDER CONTROL-ish

Mobile-first local prototype for **«Всё под контролем!»**, a physics-based 2D
co-op game concept. The current slice is a solo contract called **«Горячая
доставка»** and is intentionally structured so authoritative multiplayer can be
added later.

## Requirements

- Node.js 24 LTS
- npm 11+

## Development

```bash
npm ci
npm run dev
```

Keyboard controls: `A/D` move, `Space` jump, `E` interact, `F` throw, and `S`
slide. On touch devices, use the joystick and three action buttons.

## Verification

```bash
npm run verify
npx playwright install chromium
npm run test:e2e
```

## Render deployment

Create a new Render Blueprint from this repository. Render reads the root
`render.yaml`, builds the static PWA, and serves `apps/client/dist`. Automatic
deploys are disabled; start deployments manually from the Render dashboard.
