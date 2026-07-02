/**
 * geolocator.js — GoLiv Bénin v4.1
 * Géolocalisation fiable sans API externe payante
 *
 * Problème résolu : OpenStreetMap renvoyait des coordonnées erronées
 * pour les quartiers béninois (ex: 338 km pour Akpakpa → Zogbadjè)
 *
 * Solution : base de données locale complète des quartiers de Cotonou
 * + coefficient routier réaliste (×1.4)
 * + Google Maps en option si clé disponible
 */

const https   = require("https");
const Livreur = require("../models/Livreur");

// ─── BASE DE DONNÉES COMPLÈTE DES QUARTIERS DU BÉNIN ─────────────────
// Coordonnées GPS précises pour tous les quartiers fréquents
const QUARTIERS = {
  // ── Cotonou Est ──────────────────────────────────────────────────────
  "akpakpa":              { lat: 6.3540, lon: 2.4590 },
  "akpakpa centre":       { lat: 6.3540, lon: 2.4590 },
  "zogbadje":             { lat: 6.3520, lon: 2.4650 },
  "zogbadjè":             { lat: 6.3520, lon: 2.4650 },
  "agla":                 { lat: 6.3470, lon: 2.4520 },
  "seme":                 { lat: 6.3667, lon: 2.6050 },
  "sèmè":                 { lat: 6.3667, lon: 2.6050 },
  "seme kpodji":          { lat: 6.3667, lon: 2.6050 },
  "porto novo":           { lat: 6.4969, lon: 2.6289 },
  "porto-novo":           { lat: 6.4969, lon: 2.6289 },
  "ekpe":                 { lat: 6.3600, lon: 2.5100 },
  "vodje":                { lat: 6.3580, lon: 2.4800 },
  "vedoko":               { lat: 6.3560, lon: 2.4700 },

  // ── Cotonou Centre ───────────────────────────────────────────────────
  "jericho":              { lat: 6.3640, lon: 2.4270 },
  "jéricho":              { lat: 6.3640, lon: 2.4270 },
  "gbegamey":             { lat: 6.3780, lon: 2.3960 },
  "gbégamey":             { lat: 6.3780, lon: 2.3960 },
  "zongo":                { lat: 6.3560, lon: 2.4410 },
  "jonquet":              { lat: 6.3620, lon: 2.4330 },
  "missebo":              { lat: 6.3700, lon: 2.4250 },
  "dantokpa":             { lat: 6.3620, lon: 2.4380 },
  "stade amitie":         { lat: 6.3652, lon: 2.4035 },
  "stade de l amitie":    { lat: 6.3652, lon: 2.4035 },
  "gare cotonou":         { lat: 6.3623, lon: 2.4210 },
  "palais congres":       { lat: 6.3583, lon: 2.4177 },
  "palais des congres":   { lat: 6.3583, lon: 2.4177 },
  "port cotonou":         { lat: 6.3483, lon: 2.4355 },
  "cotonou":              { lat: 6.3676, lon: 2.4390 },
  "cotonou centre":       { lat: 6.3676, lon: 2.4390 },
  "etoile rouge":         { lat: 6.3660, lon: 2.4180 },
  "etoile":               { lat: 6.3660, lon: 2.4180 },

  // ── Cotonou Ouest ────────────────────────────────────────────────────
  "fidjrosse":            { lat: 6.3520, lon: 2.3760 },
  "fidjrossè":            { lat: 6.3520, lon: 2.3760 },
  "cadjehoun":            { lat: 6.3700, lon: 2.3830 },
  "cadjéhoun":            { lat: 6.3700, lon: 2.3830 },
  "haie vive":            { lat: 6.3730, lon: 2.3900 },
  "aeroport":             { lat: 6.3572, lon: 2.3844 },
  "aéroport":             { lat: 6.3572, lon: 2.3844 },
  "cocotiers":            { lat: 6.3800, lon: 2.3800 },
  "maro":                 { lat: 6.3750, lon: 2.3700 },
  "sikeco":               { lat: 6.3720, lon: 2.3650 },

  // ── Cotonou Nord ────────────────────────────────────────────────────
  "akpakofa":             { lat: 6.3900, lon: 2.4100 },
  "sainte rita":          { lat: 6.3850, lon: 2.4050 },
  "agontinkon":           { lat: 6.3950, lon: 2.4200 },
  "ladji":                { lat: 6.4050, lon: 2.4150 },
  "vossa":                { lat: 6.3920, lon: 2.4300 },
  "houeyiho":             { lat: 6.3820, lon: 2.4150 },
  "houéyiho":             { lat: 6.3820, lon: 2.4150 },
  "zoka":                 { lat: 6.3950, lon: 2.4000 },

  // ── Abomey-Calavi ────────────────────────────────────────────────────
  "calavi":               { lat: 6.4480, lon: 2.3372 },
  "abomey calavi":        { lat: 6.4480, lon: 2.3372 },
  "abomey-calavi":        { lat: 6.4480, lon: 2.3372 },
  "godomey":              { lat: 6.4000, lon: 2.3480 },
  "womey":                { lat: 6.4250, lon: 2.3400 },
  "uac":                  { lat: 6.3980, lon: 2.3400 },
  "universite abomey":    { lat: 6.3980, lon: 2.3400 },
  "institut national":    { lat: 6.3980, lon: 2.3400 },
  "kpanroun":             { lat: 6.4600, lon: 2.3300 },
  "zinvie":               { lat: 6.5200, lon: 2.3000 },
  "akassato":             { lat: 6.4800, lon: 2.3100 },
  "togba":                { lat: 6.4300, lon: 2.3200 },

  // ── Autres villes ────────────────────────────────────────────────────
  "ouidah":               { lat: 6.3676, lon: 2.0854 },
  "parakou":              { lat: 9.3370, lon: 2.6283 },
  "bohicon":              { lat: 7.1833, lon: 2.0667 },
  "natitingou":           { lat: 10.3167, lon: 1.3833 },
  "abomey":               { lat: 7.1833, lon: 1.9833 },
  "lokossa":              { lat: 6.6333, lon: 1.7167 },
  "kandi":                { lat: 11.1333, lon: 2.9333 },
};

// ─── MATRICE DISTANCES ROUTIÈRES CONNUES (km) ────────────────────────
// Distances mesurées sur le terrain ou via Google Maps
const DISTANCES_CONNUES = {
  "akpakpa|zogbadje":       3,
  "akpakpa|agla":           4,
  "akpakpa|jericho":        5,
  "akpakpa|dantokpa":       4,
  "akpakpa|cotonou":        7,
  "akpakpa|fidjrosse":     12,
  "akpakpa|cadjehoun":     11,
  "akpakpa|calavi":        22,
  "akpakpa|godomey":       16,
  "akpakpa|porto novo":    28,
  "cotonou|calavi":        18,
  "cotonou|godomey":       12,
  "cotonou|porto novo":    35,
  "cotonou|ouidah":        40,
  "cotonou|uac":           15,
  "cotonou|fidjrosse":      8,
  "cotonou|cadjehoun":      6,
  "cotonou|gbegamey":       4,
  "cotonou|zongo":          5,
  "calavi|porto novo":     45,
  "godomey|calavi":         8,
  "godomey|cotonou":       12,
  "uac|palais congres":    15,
  "fidjrosse|cadjehoun":    4,
  "gbegamey|cadjehoun":     5,
};

// ─── NORMALISER UNE ADRESSE ───────────────────────────────────────────
function normaliser(adresse) {
  return adresse
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprimer accents
    .replace(/[^a-z0-9\s]/g, " ")    // supprimer caractères spéciaux
    .replace(/\s+/g, " ")
    .trim();
}

// ─── TROUVER LES COORDONNÉES D'UNE ADRESSE ───────────────────────────
function trouverCoordonnees(adresse) {
  const norm = normaliser(adresse);

  // Recherche exacte d'abord
  if (QUARTIERS[norm]) {
    return { ...QUARTIERS[norm], nom: adresse, source: "exact" };
  }

  // Recherche partielle : le quartier est mentionné dans l'adresse
  for (const [quartier, coords] of Object.entries(QUARTIERS)) {
    if (norm.includes(quartier) || quartier.includes(norm.split(" ")[0])) {
      return { ...coords, nom: quartier, source: "partiel" };
    }
  }

  return null;
}

// ─── CHERCHER LA DISTANCE DANS LA MATRICE CONNUE ─────────────────────
function distanceConnue(orig, dest) {
  const normOrig = normaliser(orig);
  const normDest = normaliser(dest);

  // Chercher dans les deux sens
  const cle1 = `${normOrig}|${normDest}`;
  const cle2 = `${normDest}|${normOrig}`;

  if (DISTANCES_CONNUES[cle1]) return DISTANCES_CONNUES[cle1];
  if (DISTANCES_CONNUES[cle2]) return DISTANCES_CONNUES[cle2];

  // Recherche approximative
  for (const [cle, dist] of Object.entries(DISTANCES_CONNUES)) {
    const [k1, k2] = cle.split("|");
    if (
      (normOrig.includes(k1) || k1.includes(normOrig.split(" ")[0])) &&
      (normDest.includes(k2) || k2.includes(normDest.split(" ")[0]))
    ) return dist;
    if (
      (normDest.includes(k1) || k1.includes(normDest.split(" ")[0])) &&
      (normOrig.includes(k2) || k2.includes(normOrig.split(" ")[0]))
    ) return dist;
  }

  return null;
}

// ─── FORMULE HAVERSINE (vol d'oiseau) ────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GOOGLE MAPS API (si clé disponible) ─────────────────────────────
async function distanceGoogleMaps(origine, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const orig = encodeURIComponent(origine + ", Bénin");
    const dest = encodeURIComponent(destination + ", Bénin");
    const url  = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${orig}&destinations=${dest}&mode=driving&units=metric&key=${apiKey}`;

    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve(JSON.parse(d)));
      }).on("error", reject);
    });

    if (response.status === "OK" && response.rows?.[0]?.elements?.[0]?.status === "OK") {
      const el = response.rows[0].elements[0];
      return {
        distance_km: Math.round((el.distance.value / 1000) * 10) / 10,
        duree_min:   Math.round(el.duration.value / 60),
        methode:     "google_maps",
        fiable:      true,
      };
    }
    return null;
  } catch (err) {
    console.error("⚠️  Google Maps indisponible:", err.message);
    return null;
  }
}

// ─── FONCTION PRINCIPALE : ANALYSER UN TRAJET ─────────────────────────
async function analyserTrajet(origine, destination, serviceType = "standard") {
  console.log(`\n🗺️  Trajet: ${origine} → ${destination}`);

  // PRIORITÉ 1 : Google Maps (si clé configurée)
  const gmaps = await distanceGoogleMaps(origine, destination);
  if (gmaps) {
    console.log(`   ✅ Google Maps : ${gmaps.distance_km} km`);
    return { ...gmaps, isLongDistance: gmaps.distance_km > 30 };
  }

  // PRIORITÉ 2 : Matrice de distances connues
  const distMatrice = distanceConnue(origine, destination);
  if (distMatrice) {
    console.log(`   ✅ Matrice connue : ${distMatrice} km`);
    return {
      distance_km:    distMatrice,
      duree_min:      Math.round((distMatrice / 22) * 60),
      methode:        "matrice_reelle",
      fiable:         true,
      isLongDistance: distMatrice > 30,
    };
  }

  // PRIORITÉ 3 : Calcul GPS local avec coefficient routier
  const coordsOrig = trouverCoordonnees(origine);
  const coordsDest = trouverCoordonnees(destination);

  if (coordsOrig && coordsDest) {
    const volOiseau      = haversine(coordsOrig.lat, coordsOrig.lon, coordsDest.lat, coordsDest.lon);
    // Coefficient 1.4 = les routes béninoises ne sont jamais droites
    const distRoutiere   = Math.round(volOiseau * 1.4 * 10) / 10;

    console.log(`   ⚠️  Estimation GPS (×1.4) : ${distRoutiere} km`);
    console.log(`      Départ  : ${coordsOrig.nom} (${coordsOrig.source})`);
    console.log(`      Arrivée : ${coordsDest.nom} (${coordsDest.source})`);

    return {
      distance_km:    distRoutiere,
      duree_min:      Math.round((distRoutiere / 22) * 60),
      methode:        "gps_corrige",
      fiable:         false,
      isLongDistance: distRoutiere > 30,
    };
  }

  // PRIORITÉ 4 : Valeur prudente par défaut
  console.warn(`   ❌ Impossible de calculer : ${origine} → ${destination}`);
  return {
    distance_km:    8,
    duree_min:      25,
    methode:        "defaut",
    fiable:         false,
    isLongDistance: false,
  };
}

// ─── TROUVER LIVREURS PROCHES ─────────────────────────────────────────
async function trouverLivreursProches(adresseDepart, rayonKm = 10) {
  try {
    const livreurs = await Livreur.find({
      statut:                "actif",
      disponible_maintenant: true,
    });

    if (livreurs.length === 0) return [];

    const coordsDepart = trouverCoordonnees(adresseDepart);
    if (!coordsDepart) return livreurs.slice(0, 3).map(l => ({ livreur: l, distance: null }));

    return livreurs
      .filter(l => l.derniere_position?.lat && l.derniere_position?.lon)
      .map(l => ({
        livreur:  l,
        distance: Math.round(haversine(
          coordsDepart.lat, coordsDepart.lon,
          l.derniere_position.lat, l.derniere_position.lon
        ) * 1.4 * 10) / 10,
      }))
      .filter(l => l.distance <= rayonKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  } catch (err) {
    console.error("❌ Erreur livreurs proches:", err.message);
    return [];
  }
}

// ─── METTRE À JOUR POSITION LIVREUR ──────────────────────────────────
async function mettreAJourPosition(livreurWhatsapp, lat, lon) {
  try {
    await Livreur.findOneAndUpdate(
      { whatsapp: livreurWhatsapp },
      { derniere_position: { lat, lon, updatedAt: new Date() }, disponible_maintenant: true }
    );
    return true;
  } catch (err) {
    console.error("❌ Erreur MAJ position:", err.message);
    return false;
  }
}

module.exports = {
  analyserTrajet,
  trouverCoordonnees,
  trouverLivreursProches,
  mettreAJourPosition,
  QUARTIERS,
};
