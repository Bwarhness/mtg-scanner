# MTG Scanner

A mobile app that identifies Magic: The Gathering cards from a photo of a pile and shows their prices, powered by a Vision LLM.

## What it does

Point your phone camera at a pile of MTG cards in a shop → tap Scan → the app identifies every visible card, looks up current prices on Scryfall, and overlays colored bounding boxes on the photo. A watchlist system lets you define filters (e.g. "Zombies", "Flying creatures", "Cards > $1") and highlights matching cards with alert banners.

## Architecture

```
[Expo mobile app] → POST /scan (full-quality image)
                 → [FastAPI backend on Unraid]
                      → OpenRouter (Gemini 3 Flash Preview) — card detection + bounding boxes
                      → Scryfall API — price + metadata lookup
                 ← JSON { cards, total, not_found }
```

## Repo structure

```
mtg-scanner/
├── backend/          # FastAPI backend (Docker)
│   ├── main.py       # FastAPI app, POST /scan + GET /health
│   ├── scanner.py    # Core logic: LLM detection + Scryfall price lookup
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env          # OPENROUTER_API_KEY (gitignored)
├── mobile/           # Expo React Native app (SDK 54, TypeScript)
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── camera.tsx    # Camera capture + upload
│   │   │   ├── results.tsx   # Scanned results screen
│   │   │   └── watchlist.tsx # Watchlist rule management
│   │   ├── store/scanStore.ts # Zustand state
│   │   └── settings-modal.tsx # Backend URL config
│   ├── components/
│   │   ├── CardOverlay.tsx   # Bounding box overlay with spotlight effect
│   │   └── CardList.tsx      # Price-sorted card list
│   ├── lib/watchlistEngine.ts # Filter matching logic
│   └── types/
│       ├── index.ts           # Card, ScanResult types
│       └── watchlist.ts       # WatchlistRule type
├── .github/workflows/
│   └── deploy-backend.yml    # Tailscale + SSH deploy on merge to main
├── scan.py           # Original v1 scanner (CLI, for reference)
├── scan_v2.py        # Original v2 scanner (CLI, for reference)
├── compare.html      # Web tool to compare v1 vs v2 scan results
├── watchlist.json    # Default watchlist rules
└── PAYMENT_PLAN.md   # Payment/monetisation research
```

## Backend

**URL:** https://mtgscannerbackend.biggestblackest.dk
**Local:** http://192.168.1.200:8001
**Running:** Docker container `mtg-scanner-backend` on Unraid

### Key endpoints
- `GET /health` → `{"status": "ok"}`
- `POST /scan` → multipart `image` field (full quality, no resize) → returns card JSON

### Card detection flow
1. Image sent as base64 to Gemini 3 Flash Preview via OpenRouter
2. Model returns card name + color + type + bounding box `[ymin, xmin, ymax, xmax]` (0–1000 scale)
3. Scryfall fuzzy lookup by name → if similarity ≥ 0.3 accept
4. Fallback: Scryfall search by name words + color + type → if similarity ≥ 0.2 accept (marked `fallback: true`)
5. Dedup by resolved card name (keep highest price), sort by price desc

### Deploying to Unraid
```bash
# Automated: merge to main → GitHub Actions deploys via Tailscale + SSH
# Manual:
scp -r backend/ root@192.168.1.200:/tmp/mtg-backend
ssh root@192.168.1.200 "cd /tmp/mtg-backend && docker build -t mtg-scanner-backend:latest . && docker rm -f mtg-scanner-backend && docker run -d --name mtg-scanner-backend --restart unless-stopped -p 8001:8000 --env-file .env mtg-scanner-backend:latest"
```

Note: Unraid uses `docker` not `docker compose` — use `docker build` + `docker run`.

## Mobile app

**Stack:** Expo SDK 54, expo-router v6, NativeWind v4, Zustand, TypeScript
**Default backend URL:** https://mtgscannerbackend.biggestblackest.dk (changeable in Settings)

### Running locally
```bash
cd mobile
npm install --legacy-peer-deps
npx expo start --host lan   # then open Expo Go on phone, enter exp://<your-LAN-IP>:8081
```

### Building APK
```bash
cd mobile
eas login
eas build --platform android --profile preview
# Downloads APK link when done (~10-15 min)
# "preview" profile = direct-install APK (not Play Store AAB)
```

### Key implementation notes
- **Full quality images** — `takePictureAsync({ quality: 1, base64: false })`, no resize before upload
- **Bounding boxes** — `[ymin, xmin, ymax, xmax]` normalized 0–1000, converted to pixel coords using displayed image dimensions
- **Spotlight effect** — 4 semi-transparent `View` rectangles around the selected card (top/bottom/left/right strips), selected card rendered last in JSX (painters algorithm = on top)
- **Fallback cards** — dashed border style
- **Price color coding** — red ≥ $2.00, yellow ≥ $0.50, green otherwise
- **Watchlist** — stored in AsyncStorage key `"watchlist"`, loaded fresh on each results view, filter logic in `lib/watchlistEngine.ts`

## CI/CD

GitHub Actions workflow at `.github/workflows/deploy-backend.yml`:
- Triggers on push to `main` when `backend/**` files change
- Connects via Tailscale, builds image on GitHub runner (linux/amd64), SCP + SSH deploys to Unraid
- Required secrets: `TAILSCALE_AUTHKEY`, `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `OPENROUTER_API_KEY`

## Cost

~$0.002 per scan (Gemini 3 Flash Preview via OpenRouter):
- Input: ~$0.50/M tokens (image ≈ 3,000–4,000 tokens)
- Output: ~$3.00/M tokens (JSON response ≈ 200–400 tokens)

## Known quirks

- `expo install --fix` fails on this project — use `npm install --legacy-peer-deps` instead
- Expo SDK 55 is incompatible with current Expo Go — project is pinned to SDK 54
- NativeWind `className` is unreliable on some containers — use inline `style` for layout-critical views (flex, height)
- Unraid's Nginx Proxy Manager: port 8000 is taken by Tunarr — backend runs on 8001
