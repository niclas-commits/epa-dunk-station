# EPA-Dunk Station - Projektstruktur

## ✅ AKTUELLA FILER (används i produktion)

### Backend/Server
- **`server.js`** - Huvudserver (Express, API, DB, S3-upload)
- **`serial-bridge.js`** - WebSocket-brygga för Arduino-kommunikation
- **`package.json`** - Dependencies och scripts
- **`package-lock.json`** - Låsta versionsnummer

### Frontend/Public
- **`public/index.html`** - Huvud-HTML-fil (dashboard)
- **`public/script.js`** - Huvud-JavaScript (gauge-kontroll, AI-generering, WebSocket)
- **`public/style.css`** - Styling för dashboard

### Arduino
- **`arduino/epa_dunk_controller.ino`** - Arduino MKR Zero sketch (4 encoders + 3 knappar)

### Mappar
- **`public/images/`** - Dashboard-bilder (bakgrund, nålar, lampor, knappar)
- **`public/audio/`** - Ljudfiler (t.ex. ignition.wav)

**Notera:** Genererade MP3-filer sparas direkt i AWS S3 (inte lokalt). På Railway används ingen lokal lagring.

---

## 📋 Projektöversikt

### Huvudfunktionalitet
1. **Webbserver** (`server.js`) - Kör på port 3000 (på Railway)
   - API: `/api/generate-song` (POST)
   - Statiska filer från `public/`
   - PostgreSQL-databas för likhetssökning
   - AWS S3-upload för genererade låtar (endast S3, ingen lokal lagring)

2. **Serial Bridge** (`serial-bridge.js`) - Kör på port 3001
   - Läser från Arduino Serial
   - Skickar till webbsidan via WebSocket

3. **Frontend** (`public/index.html` + `script.js`)
   - 4 visare (tempo, typ, energi, trummor)
   - 2 knappar (bassPlus, dist)
   - 1 tändningsnyckel (ignition)
   - QR-kod för delning
   - WebSocket-anslutning för Arduino

4. **Arduino** (`arduino/epa_dunk_controller.ino`)
   - 4 encoders → styr visarna
   - 3 knappar → styr bass/dist/ignition

### Kommandon
```bash
# Starta webbserver
npm start

# Starta Arduino-brygga (i separat terminal)
npm run bridge
```

---

## 🔍 Rekommendationer

1. **`.gitignore`** har skapats och inkluderar nödvändiga ignoreringar för systemfiler och genererade filer.
