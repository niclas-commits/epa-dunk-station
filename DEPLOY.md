# Deployment Guide - Railway

## Steg 1: Förberedelser

### 1.1. Pusha koden till Git
```bash
git add .
git commit -m "Förbered för Railway deployment"
git push origin main
```

### 1.2. Logga in på Railway
1. Gå till [railway.app](https://railway.app)
2. Logga in med GitHub/GitLab/Bitbucket
3. Klicka på **"New Project"**

## Steg 2: Skapa projekt på Railway

### 2.1. Välj repository
- Välj **"Deploy from GitHub repo"** (eller GitLab/Bitbucket)
- Välj ditt repository: `epa-dunk-station_aktuell`
- Railway kommer automatiskt att detektera att det är ett Node.js-projekt

### 2.2. Railway skapar automatiskt
- ✅ Detekterar `package.json`
- ✅ Kör `npm install`
- ✅ Kör `npm start` (från package.json)
- ✅ Exponerar port 3000 (eller PORT från miljövariabel)

## Steg 3: Konfigurera miljövariabler

Gå till ditt projekt på Railway → **Variables** och lägg till:

### Databas (PostgreSQL)
```
DATABASE_URL=postgresql://user:password@host:port/database
```
**Tips:** Railway kan skapa en PostgreSQL-databas åt dig:
1. Klicka på **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway skapar automatiskt `DATABASE_URL` miljövariabeln

### AWS S3
```
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=din_access_key
AWS_SECRET_ACCESS_KEY=din_secret_key
AWS_S3_BUCKET=ditt_bucket_namn
```

### Stable Audio API
```
STABILITY_API_KEY=din_stability_api_key
```

### Port (valfritt - Railway sätter detta automatiskt)
```
PORT=3000
```

## Steg 4: Verifiera deployment

### 4.1. Kolla logs
- Gå till **"Deployments"** → Välj senaste deployment → **"View Logs"**
- Du bör se: `🚀 EPA-dunk server running at http://localhost:3000`
- Du bör se: `📡 DB ansluten: [timestamp]`

### 4.2. Öppna din app
- Railway ger dig en URL (t.ex. `epa-dunk-station-production.up.railway.app`)
- Klicka på **"Settings"** → **"Generate Domain"** för en egen domän
- Öppna URL:en i webbläsaren

## Steg 5: Testa applikationen

1. Öppna din Railway-URL
2. Testa att generera en låt
3. Kontrollera att filer sparas i AWS S3
4. Kontrollera att databasen fungerar (likhetssökning)

## Felsökning

### Problem: "Cannot find module"
- **Lösning:** Kontrollera att alla dependencies finns i `package.json`
- Railway kör `npm install` automatiskt

### Problem: "Database connection failed"
- **Lösning:** Kontrollera att `DATABASE_URL` är korrekt
- Kontrollera att PostgreSQL-databasen är aktiv på Railway

### Problem: "AWS S3 upload failed"
- **Lösning:** Kontrollera AWS credentials
- Kontrollera att S3 bucket finns och har rätt permissions

### Problem: "Port already in use"
- **Lösning:** Railway sätter `PORT` automatiskt - använd `process.env.PORT` (vilket du redan gör)

## Viktiga noteringar

⚠️ **Serial Bridge (`serial-bridge.js`) körs INTE på Railway**
- Den behöver fysisk åtkomst till Arduino
- För att använda Arduino med Railway, se `ARDUINO_SETUP.md`
- Du behöver köra serial bridge lokalt och exponera den via en tunnel (ngrok/cloudflared)

✅ **Alla MP3-filer sparas i AWS S3**
- Inga lokala filer sparas på Railway
- Bättre för Railway's begränsade diskutrymme

## Automatisk deployment

Railway deployar automatiskt när du pushar till `main` branch:
```bash
git push origin main
```

Railway kommer automatiskt att:
1. Detektera ändringar
2. Bygga projektet
3. Deploya nya versionen
4. Uppdatera URL:en

## Custom Domain (valfritt)

1. Gå till **Settings** → **Domains**
2. Klicka **"Custom Domain"**
3. Lägg till din domän (t.ex. `epa-dunk.se`)
4. Följ instruktionerna för DNS-inställningar
