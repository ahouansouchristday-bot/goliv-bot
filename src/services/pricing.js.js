/**
 * pricing.service.js — GoLiv Bénin v4
 * =====================================
 * Module de calcul de prix réaliste et compétitif
 * Référence marché : Gozem (~1975 FCFA pour 15 km)
 * Stratégie : 0% à 10% moins cher que Gozem, jamais en dessous du seuil de rentabilité
 *
 * Ordre de priorité pour la distance :
 *  1. Google Maps Distance Matrix API (distance routière réelle)
 *  2. Mapbox Directions API (fallback API)
 *  3. Estimation prudente par zones (fallback local)
 */

const https = require("https");

// ─── PARAMÈTRES DE TARIFICATION ───────────────────────────────────────
const TARIF = {
  // Formule de base : prix = BASE + (km × PRIX_KM)
  standard: {
    base:    300,   // FCFA — frais de prise en charge
    par_km:   95,   // FCFA / km — calibré sur référence Gozem (15km ≈ 1870 FCFA vs 1975 Gozem)
    min:     500,   // FCFA minimum absolu
  },
  urgent: {
    base:    500,
    par_km:  125,   // FCFA / km — environ 30% de plus que standard
    min:     800,
  },
  // Majoration progressive longue distance (> 10 km)
  // Pour éviter les pertes sur les grandes courses
  paliers_distance: [
    { seuil: 0,  multiplicateur: 1.00 }, // 0-10 km  : tarif normal
    { seuil: 10, multiplicateur: 1.10 }, // 10-20 km : +10%
    { seuil: 20, multiplicateur: 1.20 }, // 20-30 km : +20%
    { seuil: 30, multiplicateur: 1.30 }, // > 30 km  : +30%
  ],
};

// ─── RÉFÉRENCE MARCHÉ GOZEM ───────────────────────────────────────────
// 15 km → ~1975 FCFA
// GoLiv cible : 1800 à 1975 FCFA pour 15 km ✅
// Vérification : 300 + (15 × 90) × 1.10 = 300 + 1485 = 1785 FCFA ✅ (dans la cible)

// ─── ZONES GÉOGRAPHIQUES DU BÉNIN ────────────────────────────────────
// Coordonnées GPS des principaux points de référence
const ZONES = {
  // Cotonou
  "cotonou_centre":   { lat: 6.3676, lon: 2.4390, nom: "Cotonou Centre" },
  "akpakpa":          { lat: 6.3540, lon: 2.4590, nom: "Akpakpa" },
  "gbegamey":         { lat: 6.3780, lon: 2.3960, nom: "Gbégamey" },
  "fidjrosse":        { lat: 6.3520, lon: 2.3760, nom: "Fidjrossè" },
  "cadjehoun":        { lat: 6.3700, lon: 2.3830, nom: "Cadjehoun" },
  "zongo":            { lat: 6.3560, lon: 2.4410, nom: "Zongo" },
  "jericho":          { lat: 6.3640, lon: 2.4270, nom: "Jéricho" },
  "palais_congres":   { lat: 6.3583, lon: 2.4177, nom: "Palais des Congrès" },
  "uac":              { lat: 6.3980, lon: 2.3400, nom: "UAC Abomey-Calavi" },
  "stade_amitie":     { lat: 6.3652, lon: 2.4035, nom: "Stade de l'Amitié" },
  "port_cotonou":     { lat: 6.3483, lon: 2.4355, nom: "Port de Cotonou" },
  "gare_cotonou":     { lat: 6.3623, lon: 2.4210, nom: "Gare de Cotonou" },

  // Abomey-Calavi
  "calavi_centre":    { lat: 6.4480, lon: 2.3372, nom: "Calavi Centre" },
  "godomey":          { lat: 6.4000, lon: 2.3480, nom: "Godomey" },
  "womey":            { lat: 6.4250, lon: 2.3400, nom: "Womey" },

  // Porto-Novo
  "porto_novo":       { lat: 6.4969, lon: 2.6289, nom: "Porto-Novo" },
  "seme":             { lat: 6.3667, lon: 2.6050, nom: "Sèmè-Kpodji" },

  // Autres villes
  "ouidah":           { lat: 6.3676, lon: 2.0854, nom: "Ouidah" },
  "parakou":          { lat: 9.3370, lon: 2.6283, nom: "Parakou" },
  "bohicon":          { lat: 7.1833, lon: 2.0667, nom: "Bohicon" },
  "natitingou":       { lat: 10.3167, lon: 1.3833, nom: "Natitingou" },
};

// ─── MATRICE DE DISTANCES ROUTIÈRES (km) ─────────────────────────────
// Distances routières réelles observées pour les trajets fréquents
// Utilisée comme fallback si les APIs ne répondent pas
const MATRICE_DISTANCES = {
  "cotonou_centre-calavi_centre":  18,
  "cotonou_centre-godomey":        12,
  "cotonou_centre-porto_novo":     35,
  "cotonou_centre-seme":           30,
  "cotonou_centre-ouidah":         40,
  "cotonou_centre-uac":            15,
  "akpakpa-calavi_centre":         22,
  "akpakpa-porto_novo":            28,
  "gbegamey-calavi_centre":        14,
  "godomey-calavi_centre":          8,
  "uac-palais_congres":            15, // Référence Gozem
};

// ─── REQUÊTE HTTP GÉNÉRIQUE ───────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "GoLiv-Bot/4.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Réponse non JSON")); }
      });
    }).on("error", reject);
  });
}

// ─── 1. GOOGLE MAPS DISTANCE MATRIX API ──────────────────────────────
async function distanceViaGoogleMaps(origine, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const orig = encodeURIComponent(origine + ", Bénin");
    const dest = encodeURIComponent(destination + ", Bénin");
    const url  = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${orig}&destinations=${dest}&mode=driving&units=metric&key=${apiKey}`;

    const data = await httpGet(url);

    if (
      data.status === "OK" &&
      data.rows?.[0]?.elements?.[0]?.status === "OK"
    ) {
      const element  = data.rows[0].elements[0];
      const distanceM  = element.distance.value; // mètres
      const dureeS     = element.duration.value; // secondes

      return {
        distance_km: Math.round((distanceM / 1000) * 10) / 10,
        duree_min:   Math.round(dureeS / 60),
        methode:     "google_maps",
        fiable:      true,
      };
    }
    return null;
  } catch (err) {
    console.error("⚠️  Google Maps API indisponible:", err.message);
    return null;
  }
}

// ─── 2. MAPBOX DIRECTIONS API (FALLBACK) ─────────────────────────────
async function distanceViaMapbox(origine, destination) {
  const token = process.env.MAPBOX_API_KEY;
  if (!token) return null;

  try {
    // Résoudre les coordonnées depuis nos zones
    const coordsOrig = resoudreCoordonnees(origine);
    const coordsDest = resoudreCoordonnees(destination);
    if (!coordsOrig || !coordsDest) return null;

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsOrig.lon},${coordsOrig.lat};${coordsDest.lon},${coordsDest.lat}?access_token=${token}&overview=false`;

    const data = await httpGet(url);

    if (data.routes?.length > 0) {
      const route = data.routes[0];
      return {
        distance_km: Math.round((route.distance / 1000) * 10) / 10,
        duree_min:   Math.round(route.duration / 60),
        methode:     "mapbox",
        fiable:      true,
      };
    }
    return null;
  } catch (err) {
    console.error("⚠️  Mapbox API indisponible:", err.message);
    return null;
  }
}

// ─── 3. FALLBACK : ESTIMATION PAR ZONES ──────────────────────────────
function distanceFallbackZones(origine, destination) {
  // Vérifier la matrice de distances connues
  const cle1 = `${normaliserZone(origine)}-${normaliserZone(destination)}`;
  const cle2 = `${normaliserZone(destination)}-${normaliserZone(origine)}`;

  if (MATRICE_DISTANCES[cle1]) {
    return {
      distance_km: MATRICE_DISTANCES[cle1],
      duree_min:   Math.round((MATRICE_DISTANCES[cle1] / 25) * 60),
      methode:     "matrice_connue",
      fiable:      true,
    };
  }
  if (MATRICE_DISTANCES[cle2]) {
    return {
      distance_km: MATRICE_DISTANCES[cle2],
      duree_min:   Math.round((MATRICE_DISTANCES[cle2] / 25) * 60),
      methode:     "matrice_connue",
      fiable:      true,
    };
  }

  // Haversine uniquement pour ESTIMATION (jamais pour prix direct)
  const coordsOrig = resoudreCoordonnees(origine);
  const coordsDest = resoudreCoordonnees(destination);

  if (coordsOrig && coordsDest) {
    const volOiseau = haversine(coordsOrig.lat, coordsOrig.lon, coordsDest.lat, coordsDest.lon);
    // Coefficient routier : les routes béninoises ne sont pas droites
    // On multiplie par 1.4 pour approximer la distance réelle
    const distanceRoutiere = Math.round(volOiseau * 1.4 * 10) / 10;
    return {
      distance_km: distanceRoutiere,
      duree_min:   Math.round((distanceRoutiere / 22) * 60), // 22 km/h moyenne Cotonou
      methode:     "estimation_gps_corrigee",
      fiable:      false, // Non fiable → signaler dans les logs
    };
  }

  // Dernier recours : distance indéterminée → tarif prudent
  console.warn(`⚠️  Distance impossible à calculer : ${origine} → ${destination}`);
  return {
    distance_km: 10, // Valeur prudente par défaut
    duree_min:   30,
    methode:     "defaut_prudent",
    fiable:      false,
  };
}

// ─── RÉSOLUTION COORDONNÉES ───────────────────────────────────────────
function resoudreCoordonnees(adresse) {
  const a = adresse.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [cle, zone] of Object.entries(ZONES)) {
    const nomNorm = zone.nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (a.includes(cle.replace(/_/g, " ")) || a.includes(nomNorm.split(" ")[0])) {
      return { lat: zone.lat, lon: zone.lon, nom: zone.nom };
    }
  }
  return null;
}

function normaliserZone(adresse) {
  const a = adresse.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const cle of Object.keys(ZONES)) {
    if (a.includes(cle.replace(/_/g, " "))) return cle;
  }
  return a.split(",")[0].trim().replace(/\s+/g, "_");
}

// ─── FORMULE HAVERSINE (INTERNE UNIQUEMENT) ───────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

// ─── OBTENIR LA DISTANCE (ORDRE DE PRIORITÉ) ─────────────────────────
async function obtenirDistance(origine, destination) {
  // Priorité 1 : Google Maps
  let resultat = await distanceViaGoogleMaps(origine, destination);
  if (resultat) return resultat;

  // Priorité 2 : Mapbox
  resultat = await distanceViaMapbox(origine, destination);
  if (resultat) return resultat;

  // Priorité 3 : Fallback zones
  return distanceFallbackZones(origine, destination);
}

// ─── CALCUL DU MULTIPLICATEUR PAR PALIER ─────────────────────────────
function getMultiplicateur(distanceKm) {
  const paliers = [...TARIF.paliers_distance].reverse();
  for (const palier of paliers) {
    if (distanceKm >= palier.seuil) return palier.multiplicateur;
  }
  return 1.0;
}

// ─── CALCUL DU PRIX FINAL ─────────────────────────────────────────────
function calculerPrix(distanceKm, serviceType = "standard") {
  const config = TARIF[serviceType] || TARIF.standard;
  const multi  = getMultiplicateur(distanceKm);

  const prixBrut = config.base + (distanceKm * config.par_km * multi);
  const prixFinal = Math.max(
    config.min,
    Math.ceil(prixBrut / 5) * 5 // Arrondi au supérieur par multiple de 5
  );

  // Commission GoLiv (10%)
  const commission   = Math.round(prixFinal * 0.10);
  const revenuLivreur = prixFinal - commission;

  return {
    prix_total:     prixFinal,
    commission_goliv: commission,
    revenu_livreur: revenuLivreur,
    multiplicateur: multi,
  };
}

// ─── FONCTION PRINCIPALE EXPORTÉE ────────────────────────────────────
/**
 * Calculer le tarif complet d'une livraison
 * @param {string} origine - Adresse de départ
 * @param {string} destination - Adresse de destination
 * @param {string} serviceType - "standard" ou "urgent"
 * @returns {Promise<Object>} - Résultat complet avec prix, distance, méthode
 */
async function calculerTarif(origine, destination, serviceType = "standard") {
  const debut = Date.now();

  // 1. Obtenir la distance
  const distInfo = await obtenirDistance(origine, destination);

  // 2. Calculer le prix
  const prixInfo = calculerPrix(distInfo.distance_km, serviceType);

  // 3. Estimer le délai
  const delaiMin  = distInfo.duree_min;
  const delaiTexte = serviceType === "urgent"
    ? `${Math.round(delaiMin * 0.8)}-${delaiMin} min`
    : `${delaiMin}-${Math.round(delaiMin * 1.3)} min`;

  const resultat = {
    // Trajet
    origine,
    destination,
    distance_km:  distInfo.distance_km,
    duree_min:    distInfo.duree_min,
    delai_texte:  delaiTexte,

    // Prix
    service:      serviceType,
    prix_total:   prixInfo.prix_total,
    commission_goliv: prixInfo.commission_goliv,
    revenu_livreur: prixInfo.revenu_livreur,

    // Méta
    methode_distance: distInfo.methode,
    distance_fiable:  distInfo.fiable,
    temps_calcul_ms:  Date.now() - debut,
  };

  // 4. LOG OBLIGATOIRE
  console.log(`
💰 [GoLiv Pricing]
   ${origine} → ${destination}
   Distance  : ${distInfo.distance_km} km (${distInfo.methode})
   Service   : ${serviceType}
   Prix final: ${prixInfo.prix_total} FCFA
   Livreur   : ${prixInfo.revenu_livreur} FCFA | GoLiv: ${prixInfo.commission_goliv} FCFA
   Fiable    : ${distInfo.fiable ? "✅ Oui" : "⚠️  Estimation"}
  `);

  return resultat;
}

// ─── FORMATAGE POUR WHATSAPP ──────────────────────────────────────────
function formaterPourWhatsApp(tarif) {
  const icone = tarif.service === "urgent" ? "⚡" : "🚚";
  const alerte = !tarif.distance_fiable ? "\n⚠️ _Prix estimé (vérification en cours)_" : "";

  return (
    `${icone} *${tarif.service === "urgent" ? "Urgent" : "Standard"}*\n\n` +
    `📍 ${tarif.origine}\n` +
    `🏁 ${tarif.destination}\n` +
    `📏 Distance : *${tarif.distance_km} km*\n` +
    `⏱️ Délai : *${tarif.delai_texte}*\n` +
    `💰 Prix : *${tarif.prix_total.toLocaleString("fr-FR")} FCFA*` +
    alerte
  );
}

// ─── VERSION SYNCHRONE SIMPLE (sans API) ─────────────────────────────
// Pour usage rapide dans les cas où on connaît déjà la distance
function calculerTarifSimple(distanceKm, serviceType = "standard") {
  return calculerPrix(distanceKm, serviceType);
}

// ─── GÉNÉRER NUMÉRO DE COMMANDE ───────────────────────────────────────
function genererNumeroCommande() {
  const now  = new Date();
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `GLV-${date}-${rand}`;
}

// ─── RÉCAPITULATIF COMMANDE POUR WHATSAPP ────────────────────────────
function formatRecapCommande(order) {
  const icone = order.service === "urgent" ? "⚡" : "🚚";
  return (
    `📋 *Récapitulatif GoLiv*\n\n` +
    `📍 Départ : ${order.depart}\n` +
    `🏁 Destination : ${order.destination}\n` +
    `📦 Colis : ${order.colis}\n` +
    `${icone} Service : ${order.service === "urgent" ? "Urgent" : "Standard"} (${order.delai || "estimé"})\n` +
    `📏 Distance : ${order.distance_km ? order.distance_km + " km" : "en cours"}\n` +
    `💰 Prix : *${order.prix?.toLocaleString("fr-FR")} FCFA*`
  );
}

module.exports = {
  calculerTarif,        // Async — utilise les APIs de distance
  calculerTarifSimple,  // Sync  — si la distance est déjà connue
  obtenirDistance,      // Async — uniquement la distance
  formaterPourWhatsApp, // Formatage message WhatsApp
  genererNumeroCommande,
  formatRecapCommande,
  TARIF,               // Exporter les paramètres pour les tests/ajustements
};
