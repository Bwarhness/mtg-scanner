# MTG Card Scanner Backend

FastAPI service that identifies Magic: The Gathering cards from photos using vision AI (OpenRouter/Gemini) and looks up prices on Scryfall.

## API Endpoints

- `GET /health` - Health check, returns `{"status": "ok"}`
- `POST /scan` - Upload a card image (multipart form, field: `image`), returns detected cards with prices

### POST /scan Response

```json
{
  "cards": [
    {
      "name": "Counterspell",
      "price": 1.50,
      "foil": false,
      "set": "Dominaria Remastered",
      "fallback": false,
      "box": [120, 50, 480, 350],
      "type_line": "Instant",
      "colors": ["U"],
      "color_identity": ["U"],
      "cmc": 2.0,
      "keywords": [],
      "oracle_text": "Counter target spell."
    }
  ],
  "total": 1.50,
  "not_found": []
}
```

## Local Development

```bash
cp .env.example .env
# Edit .env with your OpenRouter API key
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Deployment on Unraid (192.168.1.200)

1. Copy the `backend/` folder to the Unraid server:
   ```bash
   scp -r backend/ root@192.168.1.200:/mnt/user/appdata/mtg-scanner/
   ```

2. SSH into the server:
   ```bash
   ssh root@192.168.1.200
   cd /mnt/user/appdata/mtg-scanner
   ```

3. Create your `.env` file:
   ```bash
   cp .env.example .env
   nano .env  # add your OPENROUTER_API_KEY
   ```

4. Build and start:
   ```bash
   docker compose up -d --build
   ```

5. Verify it's running:
   ```bash
   curl http://192.168.1.200:8000/health
   # {"status":"ok"}
   ```

## Docker Compose

```bash
docker compose up -d --build   # start
docker compose logs -f          # view logs
docker compose down             # stop
```
