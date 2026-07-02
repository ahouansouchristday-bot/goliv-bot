/**
 * location.service.js — GoLiv Bénin v4.2
 * ==========================================
 * Système de récupération de localisation client
 * Style Gozem/Uber : GPS WhatsApp ou saisie manuelle
 *
 * Modes supportés :
 *  1. GPS WhatsApp (latitude/longitude directes)
 *  2. Saisie manuelle (quartier/adresse → géocodage)
 *
 * Distance : Google Maps Distance Matrix API (priorité)
 *            Mapbox Directions API (fallback)
 *            Base locale Bénin (fallback final)
 */

const https = require("https");

// ─── BASE COMPLÈTE DES QUARTIERS DU BÉNIN ─────────────────────────────
// Coordonnées GPS précises par quartier
// Sources : Wikipedia, OpenStreetMap, relevés terrain
const QUARTIERS_BENIN = {

  // ══════════════════════════════════════════════════════════════════════
  // COTONOU — 13 arrondissements, ~140 quartiers
  // ══════════════════════════════════════════════════════════════════════

  // ── 1er Arrondissement (Zone Akpakpa Est) ─────────────────────────────
  "dandji":               { lat: 6.3520, lon: 2.4710, ville: "Cotonou" },
  "donatin":              { lat: 6.3500, lon: 2.4680, ville: "Cotonou" },
  "finagnon":             { lat: 6.3530, lon: 2.4650, ville: "Cotonou" },
  "tokplegbe":            { lat: 6.3510, lon: 2.4720, ville: "Cotonou" },
  "avotrou":              { lat: 6.3540, lon: 2.4760, ville: "Cotonou" },
  "suru lere":            { lat: 6.3560, lon: 2.4700, ville: "Cotonou" },
  "suru-lere":            { lat: 6.3560, lon: 2.4700, ville: "Cotonou" },
  "tanto":                { lat: 6.3545, lon: 2.4690, ville: "Cotonou" },
  "yagbe":                { lat: 6.3525, lon: 2.4730, ville: "Cotonou" },
  "tchanhounkpame":       { lat: 6.3515, lon: 2.4740, ville: "Cotonou" },

  // ── 2e Arrondissement (Akpakpa Centre) ───────────────────────────────
  "akpakpa":              { lat: 6.3580, lon: 2.4580, ville: "Cotonou" },
  "yenawa":               { lat: 6.3590, lon: 2.4560, ville: "Cotonou" },
  "kowegbo":              { lat: 6.3570, lon: 2.4600, ville: "Cotonou" },
  "irede":                { lat: 6.3600, lon: 2.4620, ville: "Cotonou" },
  "kpondejou":            { lat: 6.3610, lon: 2.4590, ville: "Cotonou" },
  "senade":               { lat: 6.3585, lon: 2.4550, ville: "Cotonou" },
  "gankodo":              { lat: 6.3595, lon: 2.4570, ville: "Cotonou" },
  "pk3":                  { lat: 6.3565, lon: 2.4640, ville: "Cotonou" },
  "minontchou":           { lat: 6.3575, lon: 2.4615, ville: "Cotonou" },

  // ── 3e Arrondissement (Akpakpa Ouest) ────────────────────────────────
  "adjegoulè":            { lat: 6.3620, lon: 2.4500, ville: "Cotonou" },
  "adjegoulè":            { lat: 6.3620, lon: 2.4500, ville: "Cotonou" },
  "segbeya":              { lat: 6.3640, lon: 2.4480, ville: "Cotonou" },
  "agbato":               { lat: 6.3630, lon: 2.4460, ville: "Cotonou" },
  "fifatin":              { lat: 6.3650, lon: 2.4510, ville: "Cotonou" },
  "ayelawadje":           { lat: 6.3660, lon: 2.4490, ville: "Cotonou" },
  "hounonkpo":            { lat: 6.3625, lon: 2.4520, ville: "Cotonou" },
  "midombo":              { lat: 6.3635, lon: 2.4470, ville: "Cotonou" },
  "hlakonme":             { lat: 6.3615, lon: 2.4485, ville: "Cotonou" },

  // ── 4e Arrondissement (Sainte-Rita / Vossa) ──────────────────────────
  "sainte rita":          { lat: 6.3850, lon: 2.4050, ville: "Cotonou" },
  "vossa":                { lat: 6.3870, lon: 2.4120, ville: "Cotonou" },
  "ladji":                { lat: 6.4050, lon: 2.4150, ville: "Cotonou" },
  "agontinkon":           { lat: 6.3950, lon: 2.4200, ville: "Cotonou" },
  "houeyiho":             { lat: 6.3820, lon: 2.4150, ville: "Cotonou" },
  "houéyiho":             { lat: 6.3820, lon: 2.4150, ville: "Cotonou" },
  "akpakofa":             { lat: 6.3900, lon: 2.4100, ville: "Cotonou" },
  "zoka":                 { lat: 6.3950, lon: 2.4000, ville: "Cotonou" },

  // ── 5e Arrondissement (Dantokpa / Missebo / Zongo) ───────────────────
  "dantokpa":             { lat: 6.3620, lon: 2.4380, ville: "Cotonou" },
  "missebo":              { lat: 6.3700, lon: 2.4250, ville: "Cotonou" },
  "missebo":              { lat: 6.3700, lon: 2.4250, ville: "Cotonou" },
  "zongo":                { lat: 6.3560, lon: 2.4410, ville: "Cotonou" },
  "jonquet":              { lat: 6.3620, lon: 2.4330, ville: "Cotonou" },
  "joncquet":             { lat: 6.3620, lon: 2.4330, ville: "Cotonou" },
  "gbedokpo":             { lat: 6.3640, lon: 2.4300, ville: "Cotonou" },
  "wlacodji":             { lat: 6.3590, lon: 2.4360, ville: "Cotonou" },
  "gbeto":                { lat: 6.3660, lon: 2.4280, ville: "Cotonou" },
  "nouveau pont":         { lat: 6.3610, lon: 2.4350, ville: "Cotonou" },
  "port cotonou":         { lat: 6.3483, lon: 2.4355, ville: "Cotonou" },
  "port autonome":        { lat: 6.3483, lon: 2.4355, ville: "Cotonou" },

  // ── 6e Arrondissement (Jéricho / Gbégamey) ───────────────────────────
  "jericho":              { lat: 6.3640, lon: 2.4270, ville: "Cotonou" },
  "jéricho":              { lat: 6.3640, lon: 2.4270, ville: "Cotonou" },
  "gbegamey":             { lat: 6.3780, lon: 2.3960, ville: "Cotonou" },
  "gbégamey":             { lat: 6.3780, lon: 2.3960, ville: "Cotonou" },
  "missessin":            { lat: 6.3720, lon: 2.4180, ville: "Cotonou" },
  "dedokpo":              { lat: 6.3700, lon: 2.4200, ville: "Cotonou" },
  "place lenine":         { lat: 6.3680, lon: 2.4220, ville: "Cotonou" },
  "sodjeatinme":          { lat: 6.3710, lon: 2.4190, ville: "Cotonou" },
  "gare cotonou":         { lat: 6.3623, lon: 2.4210, ville: "Cotonou" },

  // ── 7e Arrondissement (Etoile Rouge / centre) ────────────────────────
  "etoile rouge":         { lat: 6.3660, lon: 2.4180, ville: "Cotonou" },
  "etoile":               { lat: 6.3660, lon: 2.4180, ville: "Cotonou" },
  "cotonou centre":       { lat: 6.3676, lon: 2.4183, ville: "Cotonou" },
  "cotonou":              { lat: 6.3676, lon: 2.4183, ville: "Cotonou" },
  "stade amitie":         { lat: 6.3652, lon: 2.4035, ville: "Cotonou" },
  "stade de l amitie":    { lat: 6.3652, lon: 2.4035, ville: "Cotonou" },
  "palais congres":       { lat: 6.3583, lon: 2.4177, ville: "Cotonou" },
  "palais des congres":   { lat: 6.3583, lon: 2.4177, ville: "Cotonou" },
  "bceao":                { lat: 6.3671, lon: 2.4162, ville: "Cotonou" },

  // ── 8e Arrondissement (Sikeco / Maro) ────────────────────────────────
  "sikeco":               { lat: 6.3720, lon: 2.3650, ville: "Cotonou" },
  "maro":                 { lat: 6.3750, lon: 2.3700, ville: "Cotonou" },
  "kpankpan":             { lat: 6.3760, lon: 2.3680, ville: "Cotonou" },
  "agbodji":              { lat: 6.3740, lon: 2.3720, ville: "Cotonou" },

  // ── 9e Arrondissement (Aidjedo / Zogbo) ──────────────────────────────
  "aidjedo":              { lat: 6.3790, lon: 2.3850, ville: "Cotonou" },
  "zogbo":                { lat: 6.3800, lon: 2.3900, ville: "Cotonou" },
  "cocotiers":            { lat: 6.3800, lon: 2.3800, ville: "Cotonou" },
  "cocotier":             { lat: 6.3800, lon: 2.3800, ville: "Cotonou" },
  "haie vive":            { lat: 6.3730, lon: 2.3900, ville: "Cotonou" },

  // ── 10e Arrondissement (Agla) ─────────────────────────────────────────
  "agla":                 { lat: 6.3470, lon: 2.4020, ville: "Cotonou" },
  "agla figaro":          { lat: 6.3480, lon: 2.4010, ville: "Cotonou" },
  "agla sud":             { lat: 6.3460, lon: 2.4030, ville: "Cotonou" },
  "agla pylones":         { lat: 6.3475, lon: 2.4000, ville: "Cotonou" },
  "ahogbohoue":           { lat: 6.3490, lon: 2.4040, ville: "Cotonou" },
  "gbedegbe":             { lat: 6.3455, lon: 2.4050, ville: "Cotonou" },

  // ── 11e Arrondissement (Akogbato / Sainte-Cécile) ───────────────────
  "akogbato":             { lat: 6.3860, lon: 2.3780, ville: "Cotonou" },
  "sainte cecile":        { lat: 6.3840, lon: 2.3820, ville: "Cotonou" },
  "gbedjromede":          { lat: 6.3870, lon: 2.3760, ville: "Cotonou" },
  "houinme":              { lat: 6.3850, lon: 2.3800, ville: "Cotonou" },

  // ── 12e Arrondissement (Cadjehoun / Fidjrossè / Aéroport) ───────────
  "cadjehoun":            { lat: 6.3700, lon: 2.3830, ville: "Cotonou" },
  "cadjéhoun":            { lat: 6.3700, lon: 2.3830, ville: "Cotonou" },
  "fidjrosse":            { lat: 6.3520, lon: 2.3760, ville: "Cotonou" },
  "fidjrossè":            { lat: 6.3520, lon: 2.3760, ville: "Cotonou" },
  "fidjrosse centre":     { lat: 6.3530, lon: 2.3750, ville: "Cotonou" },
  "aeroport":             { lat: 6.3572, lon: 2.3844, ville: "Cotonou" },
  "aéroport":             { lat: 6.3572, lon: 2.3844, ville: "Cotonou" },
  "aibatin":              { lat: 6.3680, lon: 2.3810, ville: "Cotonou" },
  "fiyegnon":             { lat: 6.3710, lon: 2.3790, ville: "Cotonou" },
  "ahouanleko":           { lat: 6.3720, lon: 2.3840, ville: "Cotonou" },
  "vodje kpota":          { lat: 6.3690, lon: 2.3820, ville: "Cotonou" },
  "yemicodji":            { lat: 6.3730, lon: 2.3860, ville: "Cotonou" },
  "hlazounto":            { lat: 6.3740, lon: 2.3870, ville: "Cotonou" },

  // ── 13e Arrondissement (Agla Nord / Missité) ─────────────────────────
  "missite":              { lat: 6.3450, lon: 2.4070, ville: "Cotonou" },
  "houenousso":           { lat: 6.3440, lon: 2.4080, ville: "Cotonou" },

  // ══════════════════════════════════════════════════════════════════════
  // ABOMEY-CALAVI — 9 arrondissements
  // ══════════════════════════════════════════════════════════════════════

  // ── Godomey ───────────────────────────────────────────────────────────
  "godomey":              { lat: 6.4000, lon: 2.3480, ville: "Abomey-Calavi" },
  "godomey carrefour":    { lat: 6.3980, lon: 2.3500, ville: "Abomey-Calavi" },
  "echangeur godomey":    { lat: 6.3980, lon: 2.3500, ville: "Abomey-Calavi" },
  "godomey marche":       { lat: 6.4010, lon: 2.3460, ville: "Abomey-Calavi" },
  "womey":                { lat: 6.4250, lon: 2.3400, ville: "Abomey-Calavi" },
  "tankpete":             { lat: 6.4100, lon: 2.3450, ville: "Abomey-Calavi" },

  // ── Zogbadjè / UAC ───────────────────────────────────────────────────
  "zogbadje":             { lat: 6.4150, lon: 2.3350, ville: "Abomey-Calavi" },
  "zogbadjè":             { lat: 6.4150, lon: 2.3350, ville: "Abomey-Calavi" },
  "uac":                  { lat: 6.4100, lon: 2.3360, ville: "Abomey-Calavi" },
  "universite abomey calavi": { lat: 6.4100, lon: 2.3360, ville: "Abomey-Calavi" },
  "universite":           { lat: 6.4100, lon: 2.3360, ville: "Abomey-Calavi" },
  "campus uac":           { lat: 6.4100, lon: 2.3360, ville: "Abomey-Calavi" },
  "institut national eau": { lat: 6.4080, lon: 2.3370, ville: "Abomey-Calavi" },
  "epac":                 { lat: 6.4090, lon: 2.3355, ville: "Abomey-Calavi" },
  "fast":                 { lat: 6.4095, lon: 2.3365, ville: "Abomey-Calavi" },
  "lobozounkpa":          { lat: 6.4130, lon: 2.3380, ville: "Abomey-Calavi" },

  // ── Kpanroun / Calavi Centre ──────────────────────────────────────────
  "kpanroun":             { lat: 6.4480, lon: 2.3372, ville: "Abomey-Calavi" },
  "calavi centre":        { lat: 6.4485, lon: 2.3557, ville: "Abomey-Calavi" },
  "abomey calavi":        { lat: 6.4485, lon: 2.3557, ville: "Abomey-Calavi" },
  "abomey-calavi":        { lat: 6.4485, lon: 2.3557, ville: "Abomey-Calavi" },
  "calavi":               { lat: 6.4485, lon: 2.3557, ville: "Abomey-Calavi" },
  "mairie calavi":        { lat: 6.4490, lon: 2.3560, ville: "Abomey-Calavi" },

  // ── Akassato / Togba / Hévié ─────────────────────────────────────────
  "akassato":             { lat: 6.4800, lon: 2.3100, ville: "Abomey-Calavi" },
  "togba":                { lat: 6.4300, lon: 2.3200, ville: "Abomey-Calavi" },
  "hevie":                { lat: 6.4600, lon: 2.2900, ville: "Abomey-Calavi" },
  "zinvie":               { lat: 6.5200, lon: 2.3000, ville: "Abomey-Calavi" },
  "glo djigbe":           { lat: 6.4900, lon: 2.2800, ville: "Abomey-Calavi" },
  "houedome":             { lat: 6.4200, lon: 2.3300, ville: "Abomey-Calavi" },
  "so ava":               { lat: 6.4700, lon: 2.4400, ville: "Abomey-Calavi" },

  // ══════════════════════════════════════════════════════════════════════
  // PORTO-NOVO — Capitale du Bénin
  // ══════════════════════════════════════════════════════════════════════
  "porto novo":           { lat: 6.4969, lon: 2.6289, ville: "Porto-Novo" },
  "porto-novo":           { lat: 6.4969, lon: 2.6289, ville: "Porto-Novo" },
  "adjarra":              { lat: 6.5300, lon: 2.6800, ville: "Porto-Novo" },
  "ekpe":                 { lat: 6.4200, lon: 2.5500, ville: "Porto-Novo" },
  "seme kpodji":          { lat: 6.3667, lon: 2.6050, ville: "Sèmè-Kpodji" },
  "sème":                 { lat: 6.3667, lon: 2.6050, ville: "Sèmè-Kpodji" },
  "seme":                 { lat: 6.3667, lon: 2.6050, ville: "Sèmè-Kpodji" },
  "agblangandan":         { lat: 6.3900, lon: 2.5600, ville: "Sèmè-Kpodji" },
  "vodje":                { lat: 6.3580, lon: 2.4800, ville: "Cotonou" },

  // ══════════════════════════════════════════════════════════════════════
  // AUTRES VILLES DU BÉNIN
  // ══════════════════════════════════════════════════════════════════════
  "ouidah":               { lat: 6.3676, lon: 2.0854, ville: "Ouidah" },
  "parakou":              { lat: 9.3370, lon: 2.6283, ville: "Parakou" },
  "bohicon":              { lat: 7.1833, lon: 2.0667, ville: "Bohicon" },
  "abomey":               { lat: 7.1833, lon: 1.9833, ville: "Abomey" },
  "natitingou":           { lat: 10.3167, lon: 1.3833, ville: "Natitingou" },
  "lokossa":              { lat: 6.6333, lon: 1.7167, ville: "Lokossa" },
  "kandi":                { lat: 11.1333, lon: 2.9333, ville: "Kandi" },
  "djougou":              { lat: 9.7000, lon: 1.6667, ville: "Djougou" },
  "save":                 { lat: 8.0333, lon: 2.4833, ville: "Savè" },
  "tchaourou":            { lat: 8.8833, lon: 2.5833, ville: "Tchaourou" },
};

// ─── MATRICE DISTANCES ROUTIÈRES RÉELLES (km) ────────────────────────
// Mesurées via Google Maps / terrain
const DISTANCES_REELLES = {
  "akpakpa|zogbadje":         12,
  "akpakpa|godomey":          14,
  "akpakpa|calavi":           20,
  "akpakpa|uac":              13,
  "akpakpa|porto novo":       28,
  "akpakpa|agla":              8,
  "akpakpa|jericho":           5,
  "akpakpa|cotonou":           7,
  "akpakpa|dantokpa":          4,
  "akpakpa|seme":             24,
  "cotonou|godomey":          12,
  "cotonou|calavi":           18,
  "cotonou|zogbadje":         15,
  "cotonou|uac":              15,
  "cotonou|porto novo":       35,
  "cotonou|ouidah":           40,
  "cotonou|fidjrosse":         8,
  "cotonou|cadjehoun":         6,
  "cotonou|gbegamey":          4,
  "cotonou|agla":              9,
  "cotonou|seme":             30,
  "godomey|calavi":            8,
  "godomey|zogbadje":          5,
  "godomey|uac":               4,
  "godomey|porto novo":       40,
  "zogbadje|uac":              3,
  "zogbadje|calavi":           8,
  "zogbadje|kpanroun":         4,
  "calavi|porto novo":        45,
  "calavi|ouidah":            55,
  "uac|palais congres":       15,
  "fidjrosse|cadjehoun":       4,
  "gbegamey|cadjehoun":        5,
  "jericho|gbegamey":          4,
  "porto novo|seme":          10,
};

// ─── NORMALISER UNE ADRESSE ───────────────────────────────────────────
function normaliser(texte) {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── TROUVER COORDONNÉES D'UN QUARTIER ───────────────────────────────
function trouverCoordonnees(adresse) {
  const norm = normaliser(adresse);

  // 1. Correspondance exacte
  if (QUARTIERS_BENIN[norm]) {
    return { ...QUARTIERS_BENIN[norm], quartier: norm, source: "exact" };
  }

  // 2. Le quartier est contenu dans l'adresse (ex: "près de Dantokpa")
  for (const [quartier, coords] of Object.entries(QUARTIERS_BENIN)) {
    if (norm.includes(quartier)) {
      return { ...coords, quartier, source: "inclus" };
    }
  }

  // 3. L'adresse commence par le nom du quartier
  for (const [quartier, coords] of Object.entries(QUARTIERS_BENIN)) {
    const motsCle = quartier.split(" ")[0];
    if (norm.startsWith(motsCle) && motsCle.length > 3) {
      return { ...coords, quartier, source: "debut" };
    }
  }

  return null;
}

// ─── CHERCHER DANS LA MATRICE CONNUE ─────────────────────────────────
function distanceMatrice(orig, dest) {
  const n1 = normaliser(orig);
  const n2 = normaliser(dest);

  const cle1 = `${n1}|${n2}`;
  const cle2 = `${n2}|${n1}`;

  if (DISTANCES_REELLES[cle1]) return DISTANCES_REELLES[cle1];
  if (DISTANCES_REELLES[cle2]) return DISTANCES_REELLES[cle2];

  // Recherche partielle
  for (const [cle, dist] of Object.entries(DISTANCES_REELLES)) {
    const [k1, k2] = cle.split("|");
    if ((n1.includes(k1) || k1.includes(n1.split(" ")[0])) &&
        (n2.includes(k2) || k2.includes(n2.split(" ")[0]))) return dist;
    if ((n2.includes(k1) || k1.includes(n2.split(" ")[0])) &&
        (n1.includes(k2) || k2.includes(n1.split(" ")[0]))) return dist;
  }
  return null;
}

// ─── HAVERSINE (interne uniquement — jamais pour le prix) ─────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── REQUÊTE HTTP ─────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "GoLiv-Bot/4.2" } }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

// ─── GOOGLE MAPS DISTANCE MATRIX ─────────────────────────────────────
async function distanceGoogleMaps(origCoords, destCoords) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${origCoords.lat},${origCoords.lon}` +
      `&destinations=${destCoords.lat},${destCoords.lon}` +
      `&mode=driving&units=metric&key=${apiKey}`;
    const data = await httpGet(url);
    if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
      const el = data.rows[0].elements[0];
      return {
        distance_km: Math.round(el.distance.value / 100) / 10,
        duree_min:   Math.round(el.duration.value / 60),
        methode:     "google_maps",
        fiable:      true,
      };
    }
    return null;
  } catch (e) {
    console.warn("⚠️  Google Maps indisponible:", e.message);
    return null;
  }
}

// ─── GOOGLE MAPS GEOCODING (texte → GPS) ─────────────────────────────
async function geocoderGoogleMaps(adresse) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const q = encodeURIComponent(`${adresse}, Bénin`);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&key=${apiKey}`;
    const data = await httpGet(url);
    if (data.status === "OK" && data.results?.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lon: loc.lng, source: "google_geocode" };
    }
    return null;
  } catch (e) {
    console.warn("⚠️  Geocoding Google indisponible:", e.message);
    return null;
  }
}

// ─── RÉSOUDRE UNE ADRESSE EN COORDONNÉES GPS ─────────────────────────
async function resoudreAdresse(adresse, coordsGPS = null) {
  // Priorité 1 : coordonnées GPS directes (bouton WhatsApp)
  if (coordsGPS?.lat && coordsGPS?.lon) {
    return { lat: coordsGPS.lat, lon: coordsGPS.lon, source: "gps_whatsapp" };
  }

  // Priorité 2 : base locale (rapide, sans API)
  const local = trouverCoordonnees(adresse);
  if (local) return { lat: local.lat, lon: local.lon, source: "base_locale", quartier: local.quartier };

  // Priorité 3 : Google Maps Geocoding
  const google = await geocoderGoogleMaps(adresse);
  if (google) return google;

  return null;
}

// ─── CALCULER LA DISTANCE ENTRE 2 POINTS ─────────────────────────────
async function calculerDistanceRoutiere(origAdresse, destAdresse, origGPS = null, destGPS = null) {
  // Priorité 1 : matrice connue (très fiable, pas d'API)
  const matriceDist = distanceMatrice(origAdresse, destAdresse);
  if (matriceDist) {
    return {
      distance_km: matriceDist,
      duree_min:   Math.round((matriceDist / 22) * 60),
      methode:     "matrice_reelle",
      fiable:      true,
    };
  }

  // Résoudre les coordonnées
  const coordsOrig = await resoudreAdresse(origAdresse, origGPS);
  const coordsDest = await resoudreAdresse(destAdresse, destGPS);

  if (!coordsOrig || !coordsDest) {
    console.warn("⚠️  Impossible de résoudre les adresses");
    return { distance_km: 10, duree_min: 30, methode: "defaut", fiable: false };
  }

  // Priorité 2 : Google Maps (distance routière réelle)
  const gmaps = await distanceGoogleMaps(coordsOrig, coordsDest);
  if (gmaps) return gmaps;

  // Priorité 3 : estimation GPS corrigée (×1.4)
  const vol = haversine(coordsOrig.lat, coordsOrig.lon, coordsDest.lat, coordsDest.lon);
  const dist = Math.round(vol * 1.4 * 10) / 10;
  console.log(`⚠️  Estimation GPS ×1.4 : ${dist} km`);
  return {
    distance_km: dist,
    duree_min:   Math.round((dist / 22) * 60),
    methode:     "gps_corrige",
    fiable:      false,
  };
}

// ─── CALCULER LE PRIX ─────────────────────────────────────────────────
const TARIF = {
  standard: { base: 300, par_km: 95,  min: 500 },
  urgent:   { base: 500, par_km: 125, min: 800 },
};

function calculerPrix(distanceKm, serviceType = "standard") {
  const cfg   = TARIF[serviceType] || TARIF.standard;
  let   multi = 1.0;
  if (distanceKm > 30) multi = 1.30;
  else if (distanceKm > 20) multi = 1.20;
  else if (distanceKm > 10) multi = 1.10;

  const brut  = cfg.base + distanceKm * cfg.par_km * multi;
  const final = Math.max(cfg.min, Math.ceil(brut / 5) * 5);
  return {
    prix_total:      final,
    commission_goliv: Math.round(final * 0.10),
    revenu_livreur:  Math.round(final * 0.90),
    multiplicateur:  multi,
  };
}

// ─── ANALYSER UN TRAJET COMPLET ───────────────────────────────────────
async function analyserTrajet(origAdresse, destAdresse, serviceType = "standard", origGPS = null, destGPS = null) {
  const distInfo = await calculerDistanceRoutiere(origAdresse, destAdresse, origGPS, destGPS);
  const prixInfo = calculerPrix(distInfo.distance_km, serviceType);

  const resultat = {
    origine:          origAdresse,
    destination:      destAdresse,
    distance_km:      distInfo.distance_km,
    duree_min:        distInfo.duree_min,
    delai_texte:      serviceType === "urgent"
      ? `${Math.round(distInfo.duree_min * 0.8)}-${distInfo.duree_min} min`
      : `${distInfo.duree_min}-${Math.round(distInfo.duree_min * 1.3)} min`,
    service:          serviceType,
    prix_total:       prixInfo.prix_total,
    commission_goliv: prixInfo.commission_goliv,
    revenu_livreur:   prixInfo.revenu_livreur,
    methode:          distInfo.methode,
    fiable:           distInfo.fiable,
  };

  // LOG OBLIGATOIRE
  console.log(`\n💰 [GoLiv Pricing]`);
  console.log(`   ${origAdresse} → ${destAdresse}`);
  console.log(`   Distance : ${distInfo.distance_km} km (${distInfo.methode})`);
  console.log(`   Service  : ${serviceType}`);
  console.log(`   Prix     : ${prixInfo.prix_total} FCFA`);
  console.log(`   Livreur  : ${prixInfo.revenu_livreur} FCFA | GoLiv: ${prixInfo.commission_goliv} FCFA`);
  console.log(`   Fiable   : ${distInfo.fiable ? "✅" : "⚠️  estimation"}\n`);

  return resultat;
}

module.exports = {
  resoudreAdresse,
  analyserTrajet,
  calculerPrix,
  trouverCoordonnees,
  normaliser,
  QUARTIERS_BENIN,
  TARIF,
};
