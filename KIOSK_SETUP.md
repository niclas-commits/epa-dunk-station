# Kiosk Setup Guide - Ubuntu NUC

Komplett guide för att köra EPA-Dunk Station i kioskmiljö på Ubuntu NUC med automatisk start och fullscreen webbläsare.

## Förutsättningar

- Ubuntu Desktop 20.04 eller senare
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

## Steg 3: Skapa epa-användare

### 3.1. Skapa användaren "epa" (om den inte redan finns)

```bash
# Skapa användare om den inte finns
if ! id "epa" &>/dev/null; then
  sudo useradd -m -s /bin/bash epa
  echo "✅ Användare 'epa' skapad"
else
  echo "ℹ️  Användare 'epa' finns redan"
fi

# Lägg till epa i dialout-gruppen (för USB-serial access)
sudo usermod -a -G dialout epa
```

**OBS:** Logga ut och in igen som "epa" för att ändringarna ska gälla, eller använd `newgrp dialout`.

### 3.2. Klona repository

**Om repository är publikt:**
```bash
sudo mkdir -p /opt/epa-dunk-station
sudo chown epa:epa /opt/epa-dunk-station
cd /opt/epa-dunk-station
sudo -u epa git clone https://github.com/niclas-commits/epa-dunk-station.git .
```

**Om repository är privat eller kloning misslyckas:**

**Alternativ 1: Använd SSH (om du har SSH-nycklar konfigurerade)**
```bash
sudo mkdir -p /opt/epa-dunk-station
sudo chown epa:epa /opt/epa-dunk-station
cd /opt/epa-dunk-station
sudo -u epa git clone git@github.com:niclas-commits/epa-dunk-station.git .
```

**Alternativ 2: Använd Personal Access Token**
```bash
# Skapa en Personal Access Token på GitHub: Settings → Developer settings → Personal access tokens
# Ge den "repo" permissions
sudo mkdir -p /opt/epa-dunk-station
sudo chown epa:epa /opt/epa-dunk-station
cd /opt/epa-dunk-station
sudo -u epa git clone https://DIN_TOKEN@github.com/niclas-commits/epa-dunk-station.git .
```

**Alternativ 3: Ladda ner som ZIP**
```bash
# Skapa mappen först
sudo mkdir -p /opt/epa-dunk-station
sudo chown epa:epa /opt/epa-dunk-station

# Ladda ner och packa upp
cd /tmp
wget https://github.com/niclas-commits/epa-dunk-station/archive/refs/heads/main.zip
unzip main.zip

# Kontrollera att mappen finns
ls -la epa-dunk-station-main

# Flytta allt innehåll (använd cp istället om mv inte fungerar)
sudo cp -r epa-dunk-station-main/* /opt/epa-dunk-station/
sudo cp -r epa-dunk-station-main/.[!.]* /opt/epa-dunk-station/ 2>/dev/null || true

# Sätt rätt ägare
sudo chown -R epa:epa /opt/epa-dunk-station

# Rensa upp
rm -rf main.zip epa-dunk-station-main

# Verifiera att filerna är på plats
ls -la /opt/epa-dunk-station/
```

### 3.3. Installera dependencies

```bash
# Logga in som epa eller använd sudo -u epa
sudo -u epa npm install
```

**OBS:** Om du är inloggad som epa, kör bara `npm install`.

### 3.4. Skapa miljövariabler (valfritt)

```bash
sudo -u epa nano /opt/epa-dunk-station/.env
```

Lägg till endast om Arduino-porten inte hittas automatiskt:

```env
# Arduino port (endast om porten inte hittas automatiskt)
ARDUINO_PORT=/dev/ttyACM0  # eller /dev/ttyUSB0, kolla med: ls /dev/tty*
```

**OBS:** Alla andra miljövariabler (DATABASE_URL, AWS, STABILITY_API_KEY) konfigureras på Railway, inte lokalt.

---

## Steg 4: Konfigurera Serial Bridge

**OBS:** Användaren "epa" är redan tillagd i dialout-gruppen i steg 3.1.

### 4.2. Testa Arduino-anslutning

```bash
ls /dev/tty* | grep -E "(ACM|USB)"
```

Du bör se något som `/dev/ttyACM0` eller `/dev/ttyUSB0` när Arduino är ansluten.

### 4.3. Testa serial bridge

```bash
cd /opt/epa-dunk-station
sudo -u epa npm run bridge
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
# I en terminal, starta serial bridge (som användare epa)
cd /opt/epa-dunk-station
sudo -u epa npm run bridge

# I en annan terminal, starta ngrok (som användare epa)
sudo -u epa ngrok http 3001
```

Du bör se en URL som `https://abc123.ngrok.io` - kopiera denna!

### 5.4. Konfigurera ngrok för auto-start

Skapa ngrok config-fil:

```bash
sudo -u epa mkdir -p /home/epa/.config/ngrok
sudo -u epa nano /home/epa/.config/ngrok/ngrok.yml
```

**För ngrok v3 (rekommenderat):**
```yaml
version: 3
agent:
  authtoken: DIN_AUTHTOKEN_HÄR
endpoints:
  epa-bridge:
    addr: 3001
    proto: http
    bind_tls: true
```

**Eller för äldre ngrok v2 (om v3 inte fungerar):**
```yaml
version: 2
authtoken: DIN_AUTHTOKEN_HÄR
tunnels:
  epa-bridge:
    addr: 3001
    proto: http
    bind_tls: true
```

**OBS:** 
- Ersätt `DIN_AUTHTOKEN_HÄR` med din faktiska authtoken
- ngrok v3 använder `agent:` och `endpoints:` istället för `tunnels:`
- Om du får fel med v3-formatet, prova v2-formatet ovan

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

**OBS:** På Ubuntu Desktop 22.04+ kan paketet heta `chromium` istället för `chromium-browser`. Om kommandot ovan inte fungerar, prova:

```bash
sudo apt install -y chromium
```

Om du använder `chromium` istället för `chromium-browser`, uppdatera `start-kiosk.sh` och ändra `chromium-browser` till `chromium`.

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

**OBS:** Sökvägen `/home/epa/.config/ngrok/ngrok.yml` är korrekt för användaren "epa".

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

**OBS:** Användaren "epa" ska redan vara skapad från steg 3.1.

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

Om du vill att systemet ska logga in automatiskt vid boot:

### 8.1. Konfigurera GDM (Ubuntu Desktop)

```bash
sudo nano /etc/gdm3/custom.conf
```

Avkommentera (ta bort `#`) eller lägg till:

```ini
[daemon]
AutomaticLogin=epa
AutomaticLoginEnable=true
```

**OBS:** Användaren "epa" ska redan vara skapad från steg 3.1.

### 8.2. Verifiera auto-login

Efter reboot bör systemet logga in automatiskt utan lösenord.

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

**Först, kontrollera att ngrok körs:**
```bash
# Kontrollera om ngrok service körs
sudo systemctl status ngrok.service

# Om den inte körs, starta den
sudo systemctl start ngrok.service

# Kolla ngrok process
ps aux | grep ngrok

# Kontrollera att ngrok lyssnar på port 4040
netstat -tuln | grep 4040
# Eller
ss -tuln | grep 4040
```

**Om ngrok körs, hämta URL:**
```bash
# Kolla ngrok status (vänta några sekunder om ngrok precis startat)
sleep 3
curl http://localhost:4040/api/tunnels | jq '.tunnels[0].public_url'

# Om jq inte är installerat, använd detta istället:
curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io' | head -1

# Eller använd scriptet
/opt/epa-dunk-station/get-ngrok-url.sh
cat /tmp/ngrok-ws-url.txt
```

**Om du fortfarande får "Couldn't connect to server":**
```bash
# 1. Kontrollera ngrok logs
sudo journalctl -u ngrok.service -n 50

# 2. Testa att starta ngrok manuellt för att se felmeddelanden
sudo -u epa ngrok start --all --config /home/epa/.config/ngrok/ngrok.yml

# 3. Kontrollera att config-filen finns och är korrekt
cat /home/epa/.config/ngrok/ngrok.yml

# 4. Kontrollera att serial bridge körs (ngrok behöver den)
sudo systemctl status epa-bridge.service
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
sudo -u epa npm run bridge
```

### Webbläsare öppnas inte

```bash
# Kolla att X11/display fungerar (ska visa :0 eller :1)
echo $DISPLAY

# Om tom, sätt display manuellt
export DISPLAY=:0

# Testa att starta Chromium manuellt (ersätt med din Railway URL)
chromium-browser --kiosk https://din-app.up.railway.app
```

**OBS:** På Ubuntu Desktop är DISPLAY vanligtvis `:0` automatiskt.

### WebSocket-anslutning misslyckas

- Kontrollera att serial bridge körs: `systemctl status epa-bridge.service`
- Kontrollera att ngrok körs: `systemctl status ngrok.service`
- Kontrollera att `ARDUINO_WS_URL` är korrekt satt på Railway (ska vara `wss://din-ngrok-url.ngrok.io`)
- Kontrollera port 3001: `netstat -tuln | grep 3001`
- Kolla logs: `journalctl -u epa-bridge.service -n 50` och `journalctl -u ngrok.service -n 50`

### "Couldn't connect to server" när du försöker hämta ngrok URL

Om `curl http://localhost:4040/api/tunnels` ger "Couldn't connect to server":

```bash
# 1. Kontrollera om ngrok service körs
sudo systemctl status ngrok.service

# 2. Om den inte körs, starta den
sudo systemctl start ngrok.service

# 3. Vänta några sekunder för att ngrok ska starta
sleep 5

# 4. Kontrollera ngrok logs för fel
sudo journalctl -u ngrok.service -n 50

# 5. Kontrollera att ngrok process körs
ps aux | grep ngrok

# 6. Testa att starta ngrok manuellt för att se felmeddelanden
sudo -u epa ngrok start --all --config /home/epa/.config/ngrok/ngrok.yml

# 7. Kontrollera att config-filen finns och är korrekt
cat /home/epa/.config/ngrok/ngrok.yml

# 8. Validera ngrok config (för v3)
sudo -u epa ngrok config check

# 8. Kontrollera att serial bridge körs (ngrok behöver den)
sudo systemctl status epa-bridge.service
```

**Vanliga problem:**
- Ngrok service har inte startat → `sudo systemctl start ngrok.service`
- Ngrok config-fil saknas eller är felaktig → kontrollera `/home/epa/.config/ngrok/ngrok.yml`
- Serial bridge körs inte → ngrok kan inte ansluta till port 3001
- Ngrok authtoken är ogiltig → kontrollera token på ngrok dashboard

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
