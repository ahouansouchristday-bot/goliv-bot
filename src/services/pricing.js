/**
 * pricing.js
 * Calcul des tarifs et génération des numéros de commande GoLiv
 */

// Villes longue distance (> ~50 km de Cotonou)
const LONG_DISTANCE_CITIES = ["parakou", "natitingou", "kandi", "malanville", "djougou"];

// Tarifs en F CFA
const TARIFS = {
  standard: { short: 1300, long: 3500 },
  urgent:   { short: 2200, long: 5000 },
};

const COMMISSION_RATE = 0.10; // 10%

/**
 * Détermine si c'est une longue distance
 */
function isLongDistance(destination) {
  const dest = destination.toLowerCase();
  return LONG_DISTANCE_CITIES.some(city => dest.includes(city));
}

/**
 * Calcule le tarif d'une course
 */
function calculerTarif(destination, serviceType = "standard") {
  const longDist = isLongDistance(destination);
  const distType = longDist ? "long" : "short";
  const prix = TARIFS[serviceType]?.[distType] || TARIFS.standard.short;
  const commission = Math.round(prix * COMMISSION_RATE);
  const livreurGagne = prix - commission;

  return {
    prix,
    commission,
    livreurGagne,
    isLongDistance: longDist,
    delai: serviceType === "urgent" ? "30-45 min" : "1-2 heures",
  };
}

/**
 * Génère un numéro de commande unique
 * Format: GLV-YYMMDD-XXXX
 */
function genererNumeroCommande() {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `GLV-${date}-${rand}`;
}

/**
 * Récapitulatif formaté pour WhatsApp
 */
function formatRecapCommande(order) {
  const tarif = calculerTarif(order.destination, order.service);
  const icon = order.service === "urgent" ? "⚡" : "🚚";

  return (
    `📋 *Récapitulatif de votre commande*\n\n` +
    `📍 Départ: ${order.depart}\n` +
    `🏁 Destination: ${order.destination}\n` +
    `📦 Colis: ${order.colis}\n` +
    `${icon} Service: ${order.service === "urgent" ? "Urgent" : "Standard"} (${tarif.delai})\n` +
    `💰 Prix total: *${tarif.prix} F CFA*\n\n` +
    `_Confirmez-vous cette commande ?_`
  );
}

module.exports = { calculerTarif, genererNumeroCommande, formatRecapCommande };
