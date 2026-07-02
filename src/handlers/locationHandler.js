/**
 * locationHandler.js — GoLiv Bénin v4.2
 * ========================================
 * Gère la récupération de position client style Gozem/Uber
 *
 * Deux modes :
 *  1. 📍 GPS WhatsApp (bouton → latitude/longitude directes)
 *  2. ✍️  Saisie manuelle (quartier/adresse → géocodage)
 */

const sessionManager = require("../services/sessionManager");
const { resoudreAdresse, analyserTrajet, trouverCoordonnees } = require("../services/location.service");

// ─── MESSAGE : Demander la position de départ ─────────────────────────
function demanderPosition(etape = "depart") {
  const label = etape === "depart" ? "de départ (où récupérer le colis)" : "de destination (où livrer)";
  return (
    `📍 *Position ${label}*\n\n` +
    `Comment veux-tu envoyer ta position ?\n\n` +
    `1️⃣  📍 Envoyer ma localisation GPS\n` +
    `2️⃣  ✍️  Entrer mon quartier manuellement\n\n` +
    `_Tapez 1 ou 2_`
  );
}

// ─── MESSAGE : Demander saisie manuelle ───────────────────────────────
function demanderSaisieManuelle(etape = "depart") {
  const exemples = etape === "depart"
    ? "Akpakpa, Dantokpa, Godomey carrefour, près de l'UAC..."
    : "Zogbadjè, Calavi centre, Jéricho, Fidjrossè...";

  return (
    `✍️ *Entrez votre quartier ou un point de repère*\n\n` +
    `📌 Exemples : ${exemples}\n\n` +
    `_Soyez précis pour un meilleur calcul de prix._`
  );
}

// ─── DÉTECTER UN MESSAGE GPS WHATSAPP ────────────────────────────────
// Twilio envoie les coordonnées GPS dans Body sous la forme :
// "https://www.google.com/maps?q=-6.3540,2.4590" ou via Latitude/Longitude
function extraireGPS(body, latitude, longitude) {
  // Cas 1 : Twilio fournit Latitude et Longitude directement
  if (latitude && longitude) {
    return { lat: parseFloat(latitude), lon: parseFloat(longitude) };
  }

  // Cas 2 : lien Google Maps dans le body
  const match = body?.match(/[?&]q=([-\d.]+),([-\d.]+)/);
  if (match) {
    return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  }

  // Cas 3 : coordonnées brutes dans le body
  const coordMatch = body?.match(/([-\d.]+)\s*,\s*([-\d.]+)/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    // Vérifier que c'est bien au Bénin (lat entre 6 et 12, lon entre 1 et 4)
    if (lat >= 6 && lat <= 12 && lon >= 1 && lon <= 4) {
      return { lat, lon };
    }
  }

  return null;
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────
async function handleLocation(phone, msg, body, latitude, longitude) {
  const session = sessionManager.get(phone);
  const step    = session.step;
  const order   = session.order || {};

  // ── Détection GPS WhatsApp automatique ──────────────────────────────
  const gps = extraireGPS(body, latitude, longitude);

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Choix du mode (GPS ou manuel) — DÉPART
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_mode_depart") {
    if (gps) {
      // Le client a déjà envoyé sa position GPS directement
      return await positionGPSRecue(phone, gps, "depart", order);
    }
    if (msg === "1") {
      sessionManager.update(phone, { step: "location_gps_depart" });
      return (
        `📍 *Envoyer votre position GPS*\n\n` +
        `Dans WhatsApp :\n` +
        `1. Appuyez sur le trombone 📎\n` +
        `2. Choisissez *"Localisation"*\n` +
        `3. Envoyez votre position actuelle\n\n` +
        `_Ou partagez n'importe quelle position sur la carte._`
      );
    }
    if (msg === "2") {
      sessionManager.update(phone, { step: "location_manuelle_depart" });
      return demanderSaisieManuelle("depart");
    }
    return demanderPosition("depart");
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Attente GPS — DÉPART
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_gps_depart") {
    if (gps) {
      return await positionGPSRecue(phone, gps, "depart", order);
    }
    // Vérifier si c'est un texte (l'utilisateur a changé d'avis)
    if (msg.length > 2) {
      return await positionTextRecue(phone, msg, "depart", order);
    }
    return (
      `⏳ En attente de votre position GPS...\n\n` +
      `Appuyez sur 📎 → *Localisation* dans WhatsApp\n\n` +
      `Ou tapez votre quartier directement.`
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Saisie manuelle — DÉPART
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_manuelle_depart") {
    if (gps) {
      return await positionGPSRecue(phone, gps, "depart", order);
    }
    if (msg.length < 3) return `⚠️ Entrez un quartier valide.\n_(Ex: Akpakpa, Godomey, Zogbadjè...)_`;
    return await positionTextRecue(phone, msg, "depart", order);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Choix du mode — DESTINATION
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_mode_destination") {
    if (gps) {
      return await positionGPSRecue(phone, gps, "destination", order);
    }
    if (msg === "1") {
      sessionManager.update(phone, { step: "location_gps_destination" });
      return (
        `📍 *Position de destination*\n\n` +
        `Envoyez la position du lieu de livraison :\n` +
        `📎 → *Localisation* → choisissez sur la carte\n\n` +
        `_Vous pouvez chercher l'adresse dans Maps et la partager._`
      );
    }
    if (msg === "2") {
      sessionManager.update(phone, { step: "location_manuelle_destination" });
      return demanderSaisieManuelle("destination");
    }
    return demanderPosition("destination");
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Attente GPS — DESTINATION
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_gps_destination") {
    if (gps) {
      return await positionGPSRecue(phone, gps, "destination", order);
    }
    if (msg.length > 2) {
      return await positionTextRecue(phone, msg, "destination", order);
    }
    return `⏳ En attente de la position de destination...\n\nOu tapez le quartier de destination.`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÉTAPE : Saisie manuelle — DESTINATION
  // ═══════════════════════════════════════════════════════════════════
  if (step === "location_manuelle_destination") {
    if (gps) {
      return await positionGPSRecue(phone, gps, "destination", order);
    }
    if (msg.length < 3) return `⚠️ Entrez un quartier valide.\n_(Ex: Calavi centre, Zogbadjè, Porto-Novo...)_`;
    return await positionTextRecue(phone, msg, "destination", order);
  }

  return null;
}

// ─── TRAITER UNE POSITION GPS REÇUE ──────────────────────────────────
async function positionGPSRecue(phone, gps, etape, order) {
  // Trouver le quartier le plus proche de ce GPS
  const quartierProche = trouverQuartierProche(gps.lat, gps.lon);
  const nomPosition    = quartierProche
    ? `${quartierProche.nom} (GPS)`
    : `Position GPS (${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)})`;

  console.log(`📍 GPS reçu [${etape}]: lat=${gps.lat}, lon=${gps.lon} → ${nomPosition}`);

  if (etape === "depart") {
    const newOrder = {
      ...order,
      depart:     nomPosition,
      depart_gps: gps,
    };
    sessionManager.update(phone, { step: "location_mode_destination", order: newOrder });
    return (
      `✅ *Position de départ reçue !*\n` +
      `📍 ${nomPosition}\n\n` +
      `Maintenant, où livrer ?\n\n` +
      `1️⃣  📍 Envoyer la localisation de destination\n` +
      `2️⃣  ✍️  Entrer le quartier manuellement\n\n` +
      `_Tapez 1 ou 2_`
    );
  }

  if (etape === "destination") {
    const newOrder = {
      ...order,
      destination:     nomPosition,
      destination_gps: gps,
    };
    return await finaliserTrajet(phone, newOrder);
  }

  return null;
}

// ─── TRAITER UNE ADRESSE TEXTE REÇUE ─────────────────────────────────
async function positionTextRecue(phone, adresse, etape, order) {
  // Vérifier qu'on reconnaît ce quartier
  const coords = trouverCoordonnees(adresse);

  if (!coords) {
    return (
      `⚠️ Quartier *"${adresse}"* non reconnu.\n\n` +
      `Essayez avec un nom plus précis :\n` +
      `• Cotonou : Akpakpa, Jéricho, Gbégamey, Agla, Fidjrossè...\n` +
      `• Calavi : Godomey, Zogbadjè, UAC, Kpanroun...\n` +
      `• Porto-Novo, Sèmè-Kpodji...\n\n` +
      `Ou envoyez votre position GPS 📍`
    );
  }

  if (etape === "depart") {
    const newOrder = { ...order, depart: adresse, depart_coords: coords };
    sessionManager.update(phone, { step: "location_mode_destination", order: newOrder });
    return (
      `✅ *Départ : ${adresse}* (${coords.ville})\n\n` +
      `Maintenant, où livrer ?\n\n` +
      `1️⃣  📍 Envoyer la localisation GPS\n` +
      `2️⃣  ✍️  Entrer le quartier manuellement\n\n` +
      `_Tapez 1 ou 2_`
    );
  }

  if (etape === "destination") {
    const newOrder = { ...order, destination: adresse, destination_coords: coords };
    return await finaliserTrajet(phone, newOrder);
  }

  return null;
}

// ─── FINALISER LE TRAJET : CALCUL PRIX + COLIS ───────────────────────
async function finaliserTrajet(phone, order) {
  sessionManager.update(phone, { step: "colis", order });

  // Calculer le prix en arrière-plan (on le fera à l'étape service)
  return (
    `✅ *Destination : ${order.destination}*\n\n` +
    `📦 *Type de colis*\n\n` +
    `📄 *1* - Document / Enveloppe\n` +
    `📦 *2* - Petit colis (< 5 kg)\n` +
    `🛍️ *3* - Courses / Achats\n` +
    `🍱 *4* - Nourriture\n` +
    `📫 *5* - Autre`
  );
}

// ─── TROUVER LE QUARTIER LE PLUS PROCHE D'UN GPS ─────────────────────
function trouverQuartierProche(lat, lon) {
  const { QUARTIERS_BENIN } = require("../services/location.service");

  let plusProche = null;
  let distMin    = Infinity;

  for (const [nom, coords] of Object.entries(QUARTIERS_BENIN)) {
    const dist = Math.sqrt((lat - coords.lat) ** 2 + (lon - coords.lon) ** 2);
    if (dist < distMin) {
      distMin    = dist;
      plusProche = { nom, ...coords };
    }
  }

  // Seulement si le quartier est à moins de ~2 km (en degrés ~0.02)
  return distMin < 0.02 ? plusProche : null;
}

// ─── DÉMARRER LE FLOW LOCALISATION ────────────────────────────────────
function demarrerLocalisation(phone, order = {}) {
  sessionManager.update(phone, { step: "location_mode_depart", order });
  return demanderPosition("depart");
}

module.exports = {
  handleLocation,
  demarrerLocalisation,
  extraireGPS,
  demanderPosition,
};
