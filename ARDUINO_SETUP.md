# Arduino Setup för Railway Deployment

## Problem
Railway kör i molnet och kan inte komma åt USB-serial ports direkt. Arduino är fysiskt ansluten lokalt, så serial bridge måste köras lokalt.

## Lösning: Tunnel

Du behöver exponera din lokala serial bridge via en tunnel så att Railway-frontend kan nå den.

### Steg 1: Starta Serial Bridge lokalt

```bash
npm run bridge
```

Serial bridge körs nu på `localhost:3001`.

### Steg 2: Skapa tunnel (välj ett alternativ)

#### Alternativ A: ngrok (enklast)

1. Installera ngrok: https://ngrok.com/download
2. Kör:
   ```bash
   ngrok http 3001
   ```
3. Kopiera HTTPS-URL:en (t.ex. `https://abc123.ngrok.io`)
4. Lägg till miljövariabel på Railway:
   - Variabel: `ARDUINO_WS_URL`
   - Värde: `wss://abc123.ngrok.io` (använd `wss://` för HTTPS)

#### Alternativ B: Cloudflare Tunnel (gratis, mer permanent)

1. Installera `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
2. Kör:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
3. Kopiera HTTPS-URL:en
4. Lägg till miljövariabel på Railway: `ARDUINO_WS_URL=wss://[tunnel-url]`

#### Alternativ C: localtunnel (npm)

```bash
npx localtunnel --port 3001
```

### Steg 3: Konfigurera Railway

1. Gå till Railway → ditt projekt → Variables
2. Lägg till:
   - **Variabel:** `ARDUINO_WS_URL`
   - **Värde:** `wss://din-tunnel-url.ngrok.io` (eller din tunnel-URL)

### Steg 4: Testa

1. Starta serial bridge lokalt: `npm run bridge`
2. Starta tunnel (ngrok/cloudflared/etc)
3. Öppna din Railway-URL i webbläsaren
4. Arduino bör nu anslutas automatiskt!

## Viktigt

⚠️ **Tunneln måste köras hela tiden** när du vill använda Arduino. Om tunneln stängs, försvinner anslutningen.

💡 **Tips:** För produktion, överväg att köra tunneln som en service (systemd på Linux, launchd på macOS) så att den startar automatiskt.

## Felsökning

### "WebSocket connection failed"
- Kontrollera att serial bridge körs lokalt
- Kontrollera att tunneln är aktiv
- Kontrollera att `ARDUINO_WS_URL` är korrekt satt på Railway
- Använd `wss://` (inte `ws://`) för HTTPS-tunnlar

### "Arduino not found"
- Kontrollera att Arduino är ansluten via USB
- Kontrollera att serial bridge hittar Arduino (kolla logs)
- Sätt `ARDUINO_PORT` miljövariabel om porten inte hittas automatiskt
