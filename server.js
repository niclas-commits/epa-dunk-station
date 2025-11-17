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

// ==========================================================
//  STATIC FILE DIRS
// ==========================================================
const PUBLIC_DIR = path.join(__dirname, "public");
const TRACKS_DIR = path.join(PUBLIC_DIR, "tracks");

if (!fs.existsSync(TRACKS_DIR)) {
    fs.mkdirSync(TRACKS_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

    const typTxt     = describeType(payload.typ);
    const energiTxt  = describeEnergy(payload.energi);
    const trummorTxt = describeDrums(payload.trummor, payload.energi);
    const bassTxt    = describeBass(payload.energi, payload.typ, payload.bassPlus, payload.dist);
    const leadTxt    = describeLead(payload.energi, payload.typ, payload.dist);

    return `
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

    fs.writeFileSync(path.join(TRACKS_DIR, filename), buffer);

    const publicUrl = await uploadToS3(buffer, filename);

    return {
        relUrl: `/tracks/${filename}`,
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
            console.log("🎯 Liknande låt hittad → återanvänd");
            return res.json({
                success: true,
                audioUrl: similar.audio_url,
                publicUrl: similar.public_url
            });
        }

        const promptText = buildStablePrompt(payload);
        const bass = describeBass(
            payload.energi,
            payload.typ,
            payload.bassPlus,
            payload.dist
        );

        const { relUrl, publicUrl } = await generateSongWithStableAudio(payload);

        await saveSongToDB(payload, relUrl, publicUrl, bass);

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
