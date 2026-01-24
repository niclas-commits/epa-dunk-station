# Kiosk Setup Guide - Ubuntu NUC

Komplett guide för att köra EPA-Dunk Station i kioskmiljö på Ubuntu NUC med automatisk start och fullscreen webbläsare.

## Förutsättningar

- Ubuntu 20.04 eller senare
- NUC med i5 processor
- Arduino MKR Zero ansluten via USB
- Internetanslutning (för Railway deployment)

---

## Steg 1: Grundläggande Ubuntu Setup

### 1.1. Uppdatera systemet

```bash
sudo apt update
sudo apt upgrade -y
```

### 1.2. Installera nödvändiga verktyg

```bash
sudo apt install -y curl git build-essential jq
```

**jq** behövs för att parsa JSON från ngrok API.

---

## Steg 2: Installera Node.js

### 2.1. Installera Node.js 20.x (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2.2. Verifiera installation

```bash
node --version
npm --version
```

Du bör se Node.js version 20.x eller senare.

---

## Steg 3: Installera Projektet

### 3.1. Klona repository

```bash
cd /home
sudo mkdir -p /opt/epa-dunk-station
sudo chown $USER:$USER /opt/epa-dunk-station
cd /opt/epa-dunk-station
git clone https://github.com/niclas-commits/epa-dunk-station.git .
```

### 3.2. Installera dependencies

```bash
npm install
```

### 3.3. Skapa miljövariabler (valfritt)

```bash
nano .env
```

Lägg till endast om Arduino-porten inte hittas automatiskt:

```env
# Arduino port (endast om porten inte hittas automatiskt)
ARDUINO_PORT=/dev/ttyACM0  # eller /dev/ttyUSB0, kolla med: ls /dev/tty*
```

**OBS:** Alla andra miljövariabler (DATABASE_URL, AWS, STABILITY_API_KEY) konfigureras på Railway, inte lokalt.

---

## Steg 4: Konfigurera Serial Bridge

### 4.1. Lägg till användare i dialout-gruppen (för USB-serial access)

```bash
sudo usermod -a -G dialout $USER
```

Logga ut och in igen för att ändringarna ska gälla.

### 4.2. Testa Arduino-anslutning

```bash
ls /dev/tty* | grep -E "(ACM|USB)"
```

Du bör se något som `/dev/ttyACM0` eller `/dev/ttyUSB0` när Arduino är ansluten.

### 4.3. Testa serial bridge

```bash
npm run bridge
```

Du bör se: `✅ Serial port opened` och `🔌 Connecting to Arduino at /dev/ttyACM0`

---

## Steg 5: Installera och Konfigurera ngrok (för Railway deployment)

**Varför behövs ngrok?**
Om du kör servern på Railway men serial bridge lokalt på NUC:en, behöver du exponera serial bridge (port 3001) via en tunnel så att Railway-frontend kan ansluta till den.

### 5.1. Installera ngrok

```bash
# Ladda ner ngrok
cd /tmp
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz

# Extrahera
tar -xzf ngrok-v3-stable-linux-amd64.tgz

# Flytta till /usr/local/bin
sudo mv ngrok /usr/local/bin/
sudo chmod +x /usr/local/bin/ngrok

# Verifiera installation
ngrok version
```

### 5.2. Skapa ngrok-konto och hämta authtoken

1. Gå till https://dashboard.ngrok.com/signup
2. Skapa ett gratis konto
3. Kopiera din authtoken från dashboard
4. Konfigurera ngrok:

```bash
ngrok config add-authtoken DIN_AUTHTOKEN_HÄR
```

### 5.3. Testa ngrok manuellt

```bash
# I en terminal, starta serial bridge
cd /opt/epa-dunk-station
npm run bridge

# I en annan terminal, starta ngrok
ngrok http 3001
```

Du bör se en URL som `https://abc123.ngrok.io` - kopiera denna!

### 5.4. Konfigurera ngrok för auto-start

Skapa ngrok config-fil:

```bash
mkdir -p ~/.config/ngrok
nano ~/.config/ngrok/ngrok.yml
```

Lägg till:

```yaml
version: "2"
authtoken: DIN_AUTHTOKEN_HÄR
tunnels:
  epa-bridge:
    addr: 3001
    proto: http
    bind_tls: true
```

**OBS:** Ersätt `DIN_AUTHTOKEN_HÄR` med din faktiska authtoken.

### 5.5. Skapa script för att hämta ngrok URL

Eftersom ngrok-URL:en ändras vid varje start, behöver vi ett script som hämtar den och uppdaterar Railway:

```bash
nano /opt/epa-dunk-station/get-ngrok-url.sh
```

Lägg till:

```bash
#!/bin/bash

# Vänta på att ngrok är igång
sleep 5

# Hämta ngrok URL via API
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io' | head -1)

if [ -z "$NGROK_URL" ]; then
  echo "❌ Kunde inte hämta ngrok URL"
  exit 1
fi

# Konvertera http:// till wss:// för WebSocket
WS_URL=$(echo "$NGROK_URL" | sed 's|https://|wss://|')

echo "🔗 Ngrok URL: $NGROK_URL"
echo "🔌 WebSocket URL: $WS_URL"

# Spara till fil (kan användas för att uppdatera Railway automatiskt)
echo "$WS_URL" > /tmp/ngrok-ws-url.txt

# Alternativ: Uppdatera Railway automatiskt via API (kräver Railway API token)
# RAILWAY_TOKEN="din_railway_token"
# RAILWAY_PROJECT_ID="ditt_project_id"
# curl -X PATCH "https://api.railway.app/v1/variables/$VARIABLE_ID" \
#   -H "Authorization: Bearer $RAILWAY_TOKEN" \
#   -H "Content-Type: application/json" \
#   -d "{\"value\":\"$WS_URL\"}"
```

Gör scriptet körbart:

```bash
chmod +x /opt/epa-dunk-station/get-ngrok-url.sh
```

---

## Steg 6: Installera och Konfigurera Webbläsare (Kiosk Mode)

### 6.1. Installera Chromium

```bash
sudo apt install -y chromium-browser
```

### 6.2. Skapa kiosk startup script

```bash
sudo nano /opt/epa-dunk-station/start-kiosk.sh
```

Lägg till:

```bash
#!/bin/bash

# Vänta på att systemet är klart
sleep 5

# Disable screen saver
xset s off
xset -dpms
xset s noblank

# Starta Chromium i kiosk-läge
CHROMIUM_FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-features=TranslateUI --autoplay-policy=no-user-gesture-required"

# Använd din Railway URL (ändra till din faktiska URL)
KIOSK_URL="https://din-app.up.railway.app"

chromium-browser $CHROMIUM_FLAGS "$KIOSK_URL" &
```

Gör scriptet körbart:

```bash
sudo chmod +x /opt/epa-dunk-station/start-kiosk.sh
```

---

## Steg 7: Auto-start Konfiguration

### 7.1. Skapa systemd service för ngrok

```bash
sudo nano /etc/systemd/system/ngrok.service
```

Lägg till:

```ini
[Unit]
Description=Ngrok Tunnel for EPA Serial Bridge
After=network.target epa-bridge.service
Requires=epa-bridge.service

[Service]
Type=simple
User=epa
ExecStart=/usr/local/bin/ngrok start --all --config /home/epa/.config/ngrok/ngrok.yml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**OBS:** Ändra `/home/epa/.config/ngrok/ngrok.yml` till rätt sökväg för din användare.

### 7.2. Skapa systemd service för serial bridge

```bash
sudo nano /etc/systemd/system/epa-bridge.service
```

Lägg till:

```ini
[Unit]
Description=EPA Dunk Station Serial Bridge
After=network.target

[Service]
Type=simple
User=epa
WorkingDirectory=/opt/epa-dunk-station
Environment="NODE_ENV=production"
EnvironmentFile=/opt/epa-dunk-station/.env
ExecStart=/usr/bin/npm run bridge
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**OBS:** Ändra `User=epa` till ditt användarnamn, eller skapa en dedikerad användare:

```bash
sudo useradd -m -s /bin/bash epa
sudo chown -R epa:epa /opt/epa-dunk-station
```

### 7.3. Skapa systemd service för kiosk webbläsare

```bash
sudo nano /etc/systemd/system/epa-kiosk.service
```

Lägg till:

```ini
[Unit]
Description=EPA Dunk Station Kiosk Browser
After=graphical.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=epa
Environment="DISPLAY=:0"
ExecStart=/opt/epa-dunk-station/start-kiosk.sh
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
```

### 7.4. Aktivera services

```bash
sudo systemctl daemon-reload
sudo systemctl enable epa-bridge.service
sudo systemctl enable ngrok.service
sudo systemctl enable epa-kiosk.service
```

**Ordning:** Serial bridge startar först, sedan ngrok, sedan kiosk webbläsare.

---

## Steg 8: Konfigurera Auto-login (valfritt)

Om du vill att systemet ska logga in automatiskt:

### 8.1. För Ubuntu Desktop

```bash
sudo nano /etc/gdm3/custom.conf
```

Avkommentera (ta bort `#`):

```ini
[daemon]
AutomaticLogin=epa
AutomaticLoginEnable=true
```

### 8.2. För Ubuntu Server med X11

Om du använder lightdm:

```bash
sudo nano /etc/lightdm/lightdm.conf
```

Lägg till:

```ini
[Seat:*]
autologin-user=epa
autologin-user-timeout=0
```

---

## Steg 9: Disable Screen Saver och Power Management

### 9.1. Installera x11-xserver-utils (för screen saver-kontroll)

```bash
sudo apt install -y x11-xserver-utils
```

**OBS:** Screen saver-disabling är redan inkluderat i `start-kiosk.sh`.

### 9.2. Disable sleep/hibernate

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

---

---

## Steg 10: Konfigurera Railway med ngrok URL

När ngrok startar, behöver du uppdatera Railway med ngrok WebSocket URL:en.

### 10.1. Hämta ngrok URL

Efter att ngrok har startat:

```bash
# Kolla ngrok status
curl http://localhost:4040/api/tunnels | jq '.tunnels[0].public_url'

# Eller använd scriptet
/opt/epa-dunk-station/get-ngrok-url.sh
cat /tmp/ngrok-ws-url.txt
```

Du får en URL som `https://abc123.ngrok.io` - konvertera till WebSocket: `wss://abc123.ngrok.io`

### 10.2. Uppdatera Railway

1. Gå till Railway → ditt projekt → Variables
2. Lägg till eller uppdatera:
   - **Variabel:** `ARDUINO_WS_URL`
   - **Värde:** `wss://din-ngrok-url.ngrok.io`

**OBS:** Om ngrok-URL:en ändras (vid restart), måste du uppdatera Railway manuellt. För automatisk uppdatering, se avsnittet om Railway API nedan.

### 10.3. Automatisk uppdatering (valfritt)

För att automatiskt uppdatera Railway när ngrok startar, skapa ett script:

```bash
nano /opt/epa-dunk-station/update-railway-url.sh
```

Lägg till (ersätt med dina värden):

```bash
#!/bin/bash

# Vänta på ngrok
sleep 10

# Hämta ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io' | head -1)
WS_URL=$(echo "$NGROK_URL" | sed 's|https://|wss://|')

# Uppdatera Railway via API (kräver Railway API token)
RAILWAY_TOKEN="din_railway_api_token"
RAILWAY_PROJECT_ID="ditt_project_id"
VARIABLE_ID="variable_id_för_ARDUINO_WS_URL"

curl -X PATCH "https://api.railway.app/v1/variables/$VARIABLE_ID" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"value\":\"$WS_URL\"}"

echo "✅ Railway uppdaterad med: $WS_URL"
```

**För att hitta VARIABLE_ID:**
```bash
curl -H "Authorization: Bearer $RAILWAY_TOKEN" \
  "https://api.railway.app/v1/projects/$RAILWAY_PROJECT_ID/variables" | jq
```

---

## Steg 11: Testa Installationen

### 11.1. Testa services manuellt

```bash
# Testa serial bridge
sudo systemctl start epa-bridge.service
sudo systemctl status epa-bridge.service

# Testa ngrok
sudo systemctl start ngrok.service
sudo systemctl status ngrok.service

# Kolla ngrok URL
curl http://localhost:4040/api/tunnels | jq

# Testa kiosk
sudo systemctl start epa-kiosk.service
sudo systemctl status epa-kiosk.service
```

### 11.2. Kolla logs

```bash
# Serial bridge logs
journalctl -u epa-bridge.service -f

# Ngrok logs
journalctl -u ngrok.service -f

# Kiosk logs
journalctl -u epa-kiosk.service -f
```

### 11.3. Reboot och testa

```bash
sudo reboot
```

Efter reboot bör:
- Systemet logga in automatiskt
- Serial bridge starta
- Ngrok starta och exponera port 3001
- Chromium öppna i fullscreen kiosk-läge
- Webbsidan laddas automatiskt från Railway
- Arduino ansluta via ngrok-tunnel

---

## Felsökning

### Serial bridge startar inte

```bash
# Kolla att Arduino är ansluten
ls /dev/tty* | grep -E "(ACM|USB)"

# Kolla att användaren är i dialout-gruppen
groups

# Testa manuellt
cd /opt/epa-dunk-station
npm run bridge
```

### Webbläsare öppnas inte

```bash
# Kolla att X11/display fungerar
echo $DISPLAY

# Testa att starta Chromium manuellt (ersätt med din Railway URL)
chromium-browser --kiosk https://din-app.up.railway.app
```

### WebSocket-anslutning misslyckas

- Kontrollera att serial bridge körs: `systemctl status epa-bridge.service`
- Kontrollera att ngrok körs: `systemctl status ngrok.service`
- Kontrollera ngrok URL: `curl http://localhost:4040/api/tunnels | jq`
- Kontrollera att `ARDUINO_WS_URL` är korrekt satt på Railway (ska vara `wss://din-ngrok-url.ngrok.io`)
- Kontrollera port 3001: `netstat -tuln | grep 3001`
- Kolla logs: `journalctl -u epa-bridge.service -n 50` och `journalctl -u ngrok.service -n 50`

### Arduino hittas inte

```bash
# Lista alla serial ports
ls -la /dev/tty*

# Kolla Arduino port
dmesg | grep -i tty

# Sätt ARDUINO_PORT i .env om porten inte hittas automatiskt
```

---

## Ytterligare Optimeringar

### Disable Ubuntu Updates (för stabil kiosk)

```bash
sudo systemctl disable apt-daily.service
sudo systemctl disable apt-daily-upgrade.service
```

### Auto-restart vid krasch

Services är redan konfigurerade med `Restart=always`, men du kan också lägga till i `start-kiosk.sh`:

```bash
# Watchdog - restart om webbläsaren stängs
while true; do
  if ! pgrep -x chromium-browser > /dev/null; then
    chromium-browser $CHROMIUM_FLAGS "$KIOSK_URL" &
  fi
  sleep 5
done
```

### Remote Access (SSH)

För att kunna underhålla systemet:

```bash
sudo apt install -y openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh
```

---

## Backup och Restore

### Skapa backup av konfiguration

```bash
sudo tar -czf epa-dunk-backup-$(date +%Y%m%d).tar.gz \
  /opt/epa-dunk-station \
  /etc/systemd/system/epa-*.service \
  /opt/epa-dunk-station/start-kiosk.sh
```

### Restore

```bash
sudo tar -xzf epa-dunk-backup-YYYYMMDD.tar.gz -C /
sudo systemctl daemon-reload
sudo systemctl restart epa-bridge.service epa-kiosk.service
```

---

## Uppdateringar

### Uppdatera projektet

```bash
cd /opt/epa-dunk-station
git pull origin main
npm install
sudo systemctl restart epa-bridge.service
sudo systemctl restart ngrok.service
```

**OBS:** Efter ngrok restart, kontrollera ny URL och uppdatera Railway om den ändrats.

---

## Support

För problem, kolla:
- Serial bridge logs: `journalctl -u epa-bridge.service -f`
- Kiosk logs: `journalctl -u epa-kiosk.service -f`
- System logs: `journalctl -xe`
