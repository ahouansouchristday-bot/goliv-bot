/**
 * geolocator.js
 * Système de géolocalisation GoLiv
 *
 * Fonctionnalités :
 * - Convertir une adresse en coordonnées GPS (latitude, longitude)
 * - Calculer la distance entre deux points
 * - Trouver les livreurs les plus proches d'un point
 * - Estimer le temps de trajet
 *
 * API utilisée : OpenStreetMap Nominatim (100% gratuite, pas de clé requise)
 */

const https = require("https");
const Livreur = require("../models/Livreur");

// ─── Coordonnées GPS des zones GoLiv au Bénin ─────────────────────────
// Utilisées comme fallback si le geocodage échoue
const ZONES_GPS = {
  "cotonou":          { lat: 6.3654,  lon: 2.4183  },
  "akpakpa":          { lat: 6.3600,  lon: 2.4400  },
  "gbégamey":         { lat: 6.3750,  lon: 2.3950  },
  "fidjrossè":        { lat: 6.3500,  lon: 2.3800  },
  "cadjehoun":        { lat: 6.3700,  lon: 2.3900  },
  "zongo":            { lat: 6.3550,  lon: 2.4350  },
  "calavi":           { lat: 6.4500,  lon: 2.3400  },
  "abomey-calavi":    { lat: 6.4500,  lon: 2.3400  },
  "porto-novo":       { lat: 6.4969,  lon: 2.6289  },
  "sèmè":             { lat: 6.3667,  lon: 2.6000  },
  "ouidah":           { lat: 6.3676,  lon: 2.0854  },
  "parakou":          { lat: 9.3370,  lon: 2.6283  },
  "bohicon":          { lat: 7.1833,  lon: 2.0667  },
  "natitingou":       { lat: 10.3167, lon: 1.3833  },
};

// ─── Requête HTTP simple ──────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "GoLiv-Bot/3.0" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error")); }
      });
    }).on("error", reject);
  });
}

// ─── Geocodage : adresse → coordonnées GPS ───────────────────────────
async function geocoder(adresse) {
  try {
    // Enrichir la recherche avec "Bénin"
    const query = encodeURIComponent(`${adresse}, Bénin`);
    const url   = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=bj`;

    const results = await httpGet(url);
    if (results && results.length > 0) {
      return {
        lat:     parseFloat(results[0].lat),
        lon:     parseFloat(results[0].lon),
        adresse: results[0].display_name,
        source:  "nominatim",
      };
    }

    // Fallback : chercher dans les zones prédéfinies
    return geocodeFallback(adresse);

  } catch (err) {
    console.error("❌ Erreur geocodage:", err.message);
    return geocodeFallback(adresse);
  }
}

// ─── Fallback géocodage local ─────────────────────────────────────────
function geocodeFallback(adresse) {
  const a = adresse.toLowerCase();
  for (const [zone, coords] of Object.entries(ZONES_GPS)) {
    if (a.includes(zone)) {
      return { ...coords, adresse, source: "fallback" };
    }
  }
  // Par défaut : centre de Cotonou
  return { lat: 6.3654, lon: 2.4183, adresse, source: "default" };
}

// ─── Calcul de distance (formule Haversine) ───────────────────────────
// Retourne la distance en kilomètres entre deux points GPS
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R    = 6371; // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Arrondi à 1 décimale
}

// ─── Estimation du temps de trajet ───────────────────────────────────
// Vitesse moyenne moto à Cotonou : ~25 km/h (trafic)
function estimerTemps(distanceKm) {
  const vitesseMoyenne = 25; // km/h
  const tempsMinutes   = Math.round((distanceKm / vitesseMoyenne) * 60);

  if (tempsMinutes < 10)  return "moins de 10 min";
  if (tempsMinutes < 30)  return `environ ${Math.round(tempsMinutes / 5) * 5} min`;
  if (tempsMinutes < 60)  return `environ ${tempsMinutes} min`;
  const heures = Math.floor(tempsMinutes / 60);
  const mins   = tempsMinutes % 60;
  return mins > 0 ? `${heures}h${mins}min` : `${heures}h`;
}

// ─── Calculer le prix selon la distance réelle ────────────────────────
function calculerPrixDistance(distanceKm, serviceType = "standard") {
  // Tarif de base
  const BASE_STD = 500;  // F CFA
  const BASE_URG = 800;  // F CFA
  const PRIX_KM  = 150;  // F CFA par km

  const base  = serviceType === "urgent" ? BASE_URG : BASE_STD;
  const total = Math.round(base + distanceKm * PRIX_KM);

  // Minimum : 1000 F, Maximum raisonnable : 10 000 F
  return Math.min(Math.max(total, 1000), 10000);
}

// ─── Trouver livreurs par distance réelle ────────────────────────────
async function trouverLivreursProches(adresseDepart, rayonKm = 10) {
  try {
    const coordsDepart = await geocoder(adresseDepart);

    // Récupérer tous les livreurs actifs et disponibles
    const livreurs = await Livreur.find({
      statut:                "actif",
      disponible_maintenant: true,
    });

    if (livreurs.length === 0) return [];

    // Calculer la distance pour chaque livreur
    const livreursAvecDistance = livreurs
      .filter(l => l.derniere_position?.lat && l.derniere_position?.lon)
      .map(l => ({
        livreur:  l,
        distance: calculerDistance(
          coordsDepart.lat, coordsDepart.lon,
          l.derniere_position.lat, l.derniere_position.lon
        ),
      }))
      .filter(l => l.distance <= rayonKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    // Si aucun livreur avec position GPS, fallback par zone
    if (livreursAvecDistance.length === 0) {
      return livreurs.slice(0, 3).map(l => ({ livreur: l, distance: null }));
    }

    return livreursAvecDistance;

  } catch (err) {
    console.error("❌ Erreur trouverLivreursProches:", err.message);
    return [];
  }
}

// ─── Analyser un trajet complet ───────────────────────────────────────
async function analyserTrajet(adresseDepart, adresseDestination, serviceType = "standard") {
  try {
    const [coordsDepart, coordsDest] = await Promise.all([
      geocoder(adresseDepart),
      geocoder(adresseDestination),
    ]);

    const distance = calculerDistance(
      coordsDepart.lat, coordsDepart.lon,
      coordsDest.lat,   coordsDest.lon
    );

    const temps = estimerTemps(distance);
    const prix  = calculerPrixDistance(distance, serviceType);

    return {
      distance,
      temps,
      prix,
      coordsDepart,
      coordsDest,
      isLongDistance: distance > 30,
    };

  } catch (err) {
    console.error("❌ Erreur analyserTrajet:", err.message);
    return null;
  }
}

// ─── Mettre à jour position GPS d'un livreur ─────────────────────────
async function mettreAJourPosition(livreurWhatsapp, lat, lon) {
  try {
    await Livreur.findOneAndUpdate(
      { whatsapp: livreurWhatsapp },
      {
        derniere_position: { lat, lon, updatedAt: new Date() },
        disponible_maintenant: true,
      }
    );
    return true;
  } catch (err) {
    console.error("❌ Erreur MAJ position:", err.message);
    return false;
  }
}

module.exports = {
  geocoder,
  calculerDistance,
  estimerTemps,
  calculerPrixDistance,
  trouverLivreursProches,
  analyserTrajet,
  mettreAJourPosition,
};
