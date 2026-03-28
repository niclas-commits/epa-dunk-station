/************************************************************
 *  EPA-DUNK SERVER — DB-FIRST, SIMILARITY SEARCH, NO CACHE
 ************************************************************/

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { randomUUID } = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Pool } = require("pg");

// ==========================================================
//  EXPRESS
// ==========================================================
const app = express();
const PORT = process.env.PORT || 3000;
const ARDUINO_RELAY_TOKEN = process.env.ARDUINO_RELAY_TOKEN || "";

// ==========================================================
//  STATIC FILE DIRS
// ==========================================================
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Serve static files (except index.html which we'll handle specially)
app.use(express.static(PUBLIC_DIR, { index: false }));

// ==========================================================
//  ARDUINO RELAY STATE (for locked-down networks)
// ==========================================================
const arduinoRelayState = {
  gauges: { tempo: 50, typ: 50, energi: 50, trummor: 50 },
  buttons: { bassPlus: false, dist: false, ignition: false },
  updatedAt: null,
  seq: 0
};

function clampGauge(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

app.post("/api/arduino-relay", (req, res) => {
  if (!ARDUINO_RELAY_TOKEN) {
    return res.status(503).json({ ok: false, error: "Relay token not configured" });
  }

  const token = req.get("x-arduino-relay-token");
  if (token !== ARDUINO_RELAY_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const payload = req.body?.state ?? req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "Missing relay state payload" });
  }

  const gauges = payload.gauges || {};
  const buttons = payload.buttons || {};

  arduinoRelayState.gauges.tempo = clampGauge(gauges.tempo ?? arduinoRelayState.gauges.tempo);
  arduinoRelayState.gauges.typ = clampGauge(gauges.typ ?? arduinoRelayState.gauges.typ);
  arduinoRelayState.gauges.energi = clampGauge(gauges.energi ?? arduinoRelayState.gauges.energi);
  arduinoRelayState.gauges.trummor = clampGauge(gauges.trummor ?? arduinoRelayState.gauges.trummor);

  arduinoRelayState.buttons.bassPlus = !!buttons.bassPlus;
  arduinoRelayState.buttons.dist = !!buttons.dist;
  arduinoRelayState.buttons.ignition = !!buttons.ignition;
  arduinoRelayState.updatedAt = new Date().toISOString();
  arduinoRelayState.seq += 1;

  res.json({ ok: true, seq: arduinoRelayState.seq });
});

app.get("/api/arduino-state", (req, res) => {
  res.json({
    ok: true,
    state: arduinoRelayState
  });
});

// Serve index.html with injected Arduino WebSocket URL
app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error loading page');
    }
    // Inject Arduino WebSocket URL if configured
    const arduinoWsUrl = process.env.ARDUINO_WS_URL;
    if (arduinoWsUrl) {
      data = data.replace('<html lang="sv">', `<html lang="sv" data-arduino-ws-url="${arduinoWsUrl}">`);
    }
    res.send(data);
  });
});

// ==========================================================
//  DB-SETUP
// ==========================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test connection
pool.query("SELECT NOW()", (err, result) => {
    if (err) console.error("❌ DB fel:", err);
    else console.log("📡 DB ansluten:", result.rows[0].now);
});

async function ensureDB() {
    // 1. Skapa tabellen om den inte finns
    const createSql = `
        CREATE TABLE IF NOT EXISTS songs (
            id SERIAL PRIMARY KEY,
            tempo INT,

            typ_value INT,
            energi_value INT,
            trummor_value INT,
            bass_plus BOOLEAN,
            dist BOOLEAN,

            typ TEXT,
            energi TEXT,
            trummor TEXT,
            bass TEXT,
            lead TEXT,

            audio_url TEXT,
            public_url TEXT,

            created_at TIMESTAMP DEFAULT NOW()
        );
    `;
    await pool.query(createSql);
    console.log("🗄️ Tabell skapad (eller fanns redan)");

    // --- DEBUG 1: vilken databas och användare? ---
    const info = await pool.query(`
        SELECT current_database() AS db,
               current_user      AS "user",
               inet_server_addr()::text AS host,
               inet_server_port()       AS port
    `);
    console.log("🔍 DB INFO:", info.rows[0]);

    // --- DEBUG 2: vilka tabeller finns? ---
    const tables = await pool.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
    `);
    console.log("📋 TABLES:", tables.rows);

    // 2. Lägg till saknade kolumner om de inte finns
    async function addColumnIfMissing(column, type) {
        try {
            await pool.query(`ALTER TABLE songs ADD COLUMN IF NOT EXISTS ${column} ${type};`);
            console.log(`🆕 Kolumn OK: ${column}`);
        } catch (err) {
            console.error(`❌ Fel vid kolumn ${column}:`, err);
        }
    }

    await addColumnIfMissing("typ_value", "INT");
    await addColumnIfMissing("energi_value", "INT");
    await addColumnIfMissing("trummor_value", "INT");
    await addColumnIfMissing("bass_plus", "BOOLEAN");
    await addColumnIfMissing("dist", "BOOLEAN");

    await addColumnIfMissing("typ", "TEXT");
    await addColumnIfMissing("energi", "TEXT");
    await addColumnIfMissing("trummor", "TEXT");
    await addColumnIfMissing("bass", "TEXT");
    await addColumnIfMissing("lead", "TEXT");

    await addColumnIfMissing("audio_url", "TEXT");
    await addColumnIfMissing("public_url", "TEXT");

    console.log("✅ Alla kolumner verifierade");
}
ensureDB();

// ==========================================================
//  PROMPT-MOTOR
// ==========================================================

// TYP
function describeType(v) {
    if (v < 33) return "retro 90s eurodance with lo-fi drum machines, plastic synths and naive hooks";
    if (v < 66) return "modern EDM dance-pop hybrid with clean bright synths";
    return "hyper-modern Scandinavian EPA-dunk with brutal aggressive sound";
}

// ENERGI
function describeEnergy(v) {
    if (v < 33) return "low-energy smooth groove with mellow dynamics";
    if (v < 66) return "medium-high intensity with punchy rhythmic movement";
    return "extreme aggressive EPA-style energy with clipped peaks";
}

// TRUMMOR
function describeDrums(v, e) {
    if (v < 33) return "soft eurodance drum machine: gentle kick and bright hats";
    if (v < 66) return "tight modern EDM drums: punchy kick and crisp hats";
    let s = "hardstyle-influenced EPA drums with distorted kick";
    if (e > 66) s += ", even more aggressive due to extreme energy";
    return s;
}

// BASS
function describeBass(e, t, bassPlus, dist) {
    let base =
        e < 33 ? "soft warm sub-bass with minimal distortion" :
        e < 66 ? "punchy EDM bass with moderate saturation" :
                 "extreme EPA-dunk bass with blown-out distortion";

    if (t < 33) base += ", retro analog texture";
    if (t > 66) base += ", modern hyper-digital tone";

    if (bassPlus) base += ", deep sub-boost";
    if (dist) base += ", extra heavy distortion";

    return base;
}

// LEAD
function describeLead(e, t, dist) {
    let s =
        e < 33 ? "soft mellow eurodance-style lead" :
        e < 66 ? "bright EDM saw lead with rhythmic motion" :
                 "intense screaming EPA lead dominating the mix";

    if (t < 33) s += ", retro square/saw character";
    if (t > 66) s += ", polished modern digital tone";

    if (dist) s += ", with extra biting distortion";

    return s;
}

// PROMPT BUILDER
function buildStablePrompt(payload) {
    const tempo = Number(payload.tempo);
    // Accept both _value and plain keys for backward compatibility
    const typ = payload.typ_value ?? payload.typ;
    const energi = payload.energi_value ?? payload.energi;
    const trummor = payload.trummor_value ?? payload.trummor;
    const bassPlus = payload.bassPlus;
    const dist = payload.dist;

    const typTxt     = describeType(typ);
    const energiTxt  = describeEnergy(energi);
    const trummorTxt = describeDrums(trummor, energi);
    const bassTxt    = describeBass(energi, typ, bassPlus, dist);
    const leadTxt    = describeLead(energi, typ, dist);

    const prompt = `
Create a 30-second instrumental EPA-dunk inspired track.

Tempo: ${tempo} BPM.

Style character:
${typTxt}

Energy profile:
${energiTxt}

Drums:
${trummorTxt}

Bass:
${bassTxt}

Lead synths:
${leadTxt}

Rules:
- Low values = retro eurodance
- Mid values = modern EDM
- High values = brutal EPA-dunk

The track MUST reflect the descriptions accurately.
No vocals.
Loop-friendly arrangement.
    `.trim();

    // Debug log for prompt builder
    console.log("[PromptBuilder] Input:", { tempo, typ, energi, trummor, bassPlus, dist });
    console.log("[PromptBuilder] Output:\n" + prompt);
    return prompt;
}

// ==========================================================
//  S3
// ==========================================================
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function uploadToS3(buffer, filename) {
    await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: "audio/mpeg"
    }));
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
}

// ==========================================================
//  STABLE AUDIO
// ==========================================================
async function generateSongWithStableAudio(payload) {
    const bpm = Math.max(60, Math.min(220, Number(payload.tempo)));

    const promptText = buildStablePrompt({
        ...payload,
        tempo: bpm
    });

    console.log("🔥 Prompt skickas till SA:\n", promptText);

    const formData = new FormData();
    formData.append("prompt", promptText);
    formData.append("output_format", "mp3");
    formData.append("duration", "30");
    formData.append("model", "stable-audio-2.5");

    const resp = await axios.post(
        "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio",
        formData,
        {
            responseType: "arraybuffer",
            headers: {
                Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
                Accept: "audio/*",
                ...formData.getHeaders(),
            },
            timeout: 180000,
        }
    );

    if (resp.status !== 200) {
        throw new Error("Stable Audio error " + resp.status);
    }

    const filename = `epa_${Date.now()}_${randomUUID().slice(0, 8)}.mp3`;
    const buffer = Buffer.from(resp.data);

    // Upload to AWS S3 only (no local storage on Railway)
    const publicUrl = await uploadToS3(buffer, filename);

    return {
        relUrl: publicUrl,  // Use S3 URL as relUrl too
        publicUrl
    };
}

// ==========================================================
//  DB: FIND SIMILAR
// ==========================================================
async function findSimilarSong(payload) {
    const tempoMin  = payload.tempo - 5;
    const tempoMax  = payload.tempo + 5;

    const typMin    = payload.typ_value - 10;
    const typMax    = payload.typ_value + 10;

    const energiMin = payload.energi_value - 10;
    const energiMax = payload.energi_value + 10;

    const trumMin   = payload.trummor_value - 10;
    const trumMax   = payload.trummor_value + 10;

    console.log("🔎 Söker efter liknande låt med:", {
        tempo: payload.tempo,
        typ_value: payload.typ_value,
        energi_value: payload.energi_value,
        trummor_value: payload.trummor_value,
        bass_plus: payload.bassPlus,
        dist: payload.dist
    });

    const q = `
        SELECT *
        FROM songs
        WHERE tempo BETWEEN $1 AND $2
        AND typ_value BETWEEN $3 AND $4
        AND energi_value BETWEEN $5 AND $6
        AND trummor_value BETWEEN $7 AND $8
        AND bass_plus = $9
        AND dist = $10
        ORDER BY created_at DESC
        LIMIT 1;
    `;

    const result = await pool.query(q, [
        tempoMin, tempoMax,
        typMin, typMax,
        energiMin, energiMax,
        trumMin, trumMax,
        payload.bassPlus,
        payload.dist
    ]);

    return result.rows[0] || null;
}

/**
 * When Stable Audio fails (credits, outage, etc.), reuse any stored track so the visitor still hears music.
 */
async function findFallbackSongFromDb(payload) {
    const r1 = await pool.query(
        `SELECT *
         FROM songs
         WHERE bass_plus = $1 AND dist = $2
         AND (
           (audio_url IS NOT NULL AND audio_url <> '')
           OR (public_url IS NOT NULL AND public_url <> '')
         )
         ORDER BY created_at DESC
         LIMIT 1`,
        [payload.bassPlus, payload.dist]
    );
    if (r1.rows[0]) return r1.rows[0];

    const r2 = await pool.query(
        `SELECT *
         FROM songs
         WHERE (audio_url IS NOT NULL AND audio_url <> '')
            OR (public_url IS NOT NULL AND public_url <> '')
         ORDER BY created_at DESC
         LIMIT 1`
    );
    return r2.rows[0] || null;
}

function rowToAudioResponse(row) {
    const audioUrl = row.audio_url || row.public_url || null;
    const publicUrl = row.public_url || audioUrl;
    return { audioUrl, publicUrl };
}


// ==========================================================
//  DB: SAVE NEW SONG
// ==========================================================
async function saveSongToDB(payload, audioUrl, publicUrl) {
    const typTxt     = describeType(payload.typ_value);
    const energiTxt  = describeEnergy(payload.energi_value);
    const trummorTxt = describeDrums(payload.trummor_value, payload.energi_value);
    const bassTxt    = describeBass(payload.energi_value, payload.typ, payload.bassPlus, payload.dist);
    const leadTxt    = describeLead(payload.energi_value, payload.typ, payload.dist);

    const q = `
        INSERT INTO songs (
            tempo, typ_value, energi_value, trummor_value,
            bass_plus, dist,
            typ, energi, trummor, bass, lead,
            audio_url, public_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `;

    await pool.query(q, [
        payload.tempo,
        payload.typ_value,
        payload.energi_value,
        payload.trummor_value,
        payload.bassPlus,
        payload.dist,
        typTxt,
        energiTxt,
        trummorTxt,
        bassTxt,
        leadTxt,
        audioUrl,
        publicUrl
    ]);
}

// ==========================================================
//  API: GENERATE SONG
// ==========================================================
app.post("/api/generate-song", async (req, res) => {
    try {
        // 🆕 Fixar den verkliga payloaden
        const payload = req.body.payload ?? req.body;

        //const payload = req.body;


        // Normalisera — viktigt: använd payload från rätt nivå
        payload.tempo = Math.round(Number(payload.tempo));
        payload.typ_value = Math.round(Number(payload.typ_value));
        payload.energi_value = Math.round(Number(payload.energi_value));
        payload.trummor_value = Math.round(Number(payload.trummor_value));
        payload.bassPlus = !!payload.bassPlus;
        payload.dist = !!payload.dist;

console.log("🔥 PAYLOAD (fixad):", payload);

        console.log("🔥 PAYLOAD (fixad):", payload);

        // Sök i DB
        const similar = await findSimilarSong(payload);

        if (similar) {
            console.log("🎯 Liknande låt hittad → återanvänd", {
                id: similar.id,
                audio_url: similar.audio_url,
                public_url: similar.public_url
            });

            // Normalize response: prefer stored local `audio_url`, fallback to `public_url`.
            // Some older DB rows might have stored the S3 link in `audio_url` or vice versa.
            const audioUrl = similar.audio_url || similar.public_url || null;

            if (!audioUrl) {
                console.warn("⚠️ Hittad rad saknar ljud-URL — skickar fel till klienten");
                return res.status(500).json({ success: false, error: "Found DB row without audio URL" });
            }

            return res.json({
                success: true,
                audioUrl,
                publicUrl: similar.public_url || audioUrl
            });
        }

        let relUrl;
        let publicUrl;
        try {
            const out = await generateSongWithStableAudio(payload);
            relUrl = out.relUrl;
            publicUrl = out.publicUrl;
            await saveSongToDB(payload, relUrl, publicUrl);
        } catch (saErr) {
            console.warn("⚠️ Stable Audio misslyckades (t.ex. slut på krediter) — försöker fallback:", saErr.message);

            const fallbackRow = await findFallbackSongFromDb(payload);
            if (fallbackRow) {
                const urls = rowToAudioResponse(fallbackRow);
                if (urls.audioUrl) {
                    console.log("✅ Fallback: återanvänder sparad låt från databasen (id=" + fallbackRow.id + ")");
                    return res.json({
                        success: true,
                        audioUrl: urls.audioUrl,
                        publicUrl: urls.publicUrl
                    });
                }
            }

            const staticAudio = process.env.FALLBACK_AUDIO_URL;
            if (staticAudio) {
                const staticPublic = process.env.FALLBACK_PUBLIC_URL || staticAudio;
                console.log("✅ Fallback: statisk låt från FALLBACK_AUDIO_URL");
                return res.json({
                    success: true,
                    audioUrl: staticAudio,
                    publicUrl: staticPublic
                });
            }

            throw saErr;
        }

        res.json({ success: true, audioUrl: relUrl, publicUrl });

    } catch (err) {
        console.error("❌ /api/generate-song ERROR:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ==========================================================
//  START SERVER
// ==========================================================
app.listen(PORT, () => {
    console.log(`🚀 EPA-dunk server running at http://localhost:${PORT}`);
});
