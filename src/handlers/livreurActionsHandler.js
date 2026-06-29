/**
 * livreurActionsHandler.js
 * Gère les réponses des livreurs aux missions GoLiv
 * 
 * Commandes livreur :
 * - ACCEPTER GLV-XXXX  → Accepter une mission
 * - REFUSER GLV-XXXX   → Refuser une mission
 * - LIVRE GLV-XXXX     → Confirmer la livraison
 * - DISPO              → Se mettre disponible
 * - INDISPO            → Se mettre indisponible
 * - MES-COURSES        → Voir ses statistiques
 */

const Livreur  = require("../models/Livreur");
const Commande = require("../models/Commande");
const db       = require("../services/dbService");
const notifier = require("../services/notifier");

async function handleLivreurAction(phone, msg) {
  const m = msg.trim().toUpperCase();

  // ── ACCEPTER une mission ─────────────────────────────────────────────
  if (m.startsWith("ACCEPTER ")) {
    const numero = m.replace("ACCEPTER ", "").trim();
    return await accepterMission(phone, numero);
  }

  // ── REFUSER une mission ──────────────────────────────────────────────
  if (m.startsWith("REFUSER ")) {
    const numero = m.replace("REFUSER ", "").trim();
    return await refuserMission(phone, numero);
  }

  // ── Confirmer LIVRAISON ──────────────────────────────────────────────
  if (m.startsWith("LIVRE ")) {
    const numero = m.replace("LIVRE ", "").trim();
    return await confirmerLivraison(phone, numero);
  }

  // ── Se mettre DISPONIBLE ─────────────────────────────────────────────
  if (m === "DISPO" || m === "DISPONIBLE") {
    return await setDisponibilite(phone, true);
  }

  // ── Se mettre INDISPONIBLE ───────────────────────────────────────────
  if (m === "INDISPO" || m === "INDISPONIBLE") {
    return await setDisponibilite(phone, false);
  }

  // ── Voir ses courses ─────────────────────────────────────────────────
  if (m === "MES-COURSES" || m === "STATS") {
    return await mesStats(phone);
  }

  return null; // Pas une commande livreur → passer au handler normal
}

// ─── Accepter une mission ─────────────────────────────────────────────
async function accepterMission(phone, numero) {
  try {
    const livreur = await Livreur.findOne({ whatsapp: phone });
    if (!livreur) return `❌ Vous n'êtes pas enregistré comme livreur GoLiv.\n\nTapez *5* pour vous inscrire.`;
    if (livreur.statut !== "actif") return `❌ Votre compte n'est pas encore actif.\n\nContactez le ${process.env.GOLIV_SUPPORT_PHONE}`;

    const commande = await Commande.findOne({ numero });
    if (!commande) return `❌ Commande *${numero}* introuvable.`;
    if (commande.statut !== "en_attente") return `⚠️ Cette mission a déjà été prise par un autre livreur.\n\nRestez disponible pour les prochaines missions !`;

    // Assigner le livreur à la commande
    await Commande.findOneAndUpdate(
      { numero, statut: "en_attente" }, // Vérification atomique
      {
        statut:           "livreur_assigne",
        livreur_id:       livreur._id,
        livreur_whatsapp: phone,
        $push: { historique_statuts: { statut: "livreur_assigne", note: `Assigné à ${livreur.prenom} ${livreur.nom}` } },
      }
    );

    // Mettre le livreur en indisponible (il est en mission)
    await Livreur.findByIdAndUpdate(livreur._id, { disponible_maintenant: false });

    // Notifier le client
    const commandeMaj = await Commande.findOne({ numero });
    await notifier.notifierClientLivreurAssigne(commandeMaj, livreur);

    // Confirmation au livreur
    await notifier.notifierLivreurConfirmation(livreur, commande);

    return (
      `✅ *Mission acceptée !*\n\n` +
      `📋 Commande : *${numero}*\n\n` +
      `📍 *Aller récupérer le colis à :*\n${commande.depart}\n\n` +
      `🏁 *Livrer à :*\n${commande.destination}\n\n` +
      `📦 Colis : ${commande.type_colis}\n` +
      `💰 Votre gain : *${Math.round(commande.prix_total * 0.9).toLocaleString("fr-FR")} F CFA*\n\n` +
      `Une fois livré, tapez :\n*LIVRE ${numero}*`
    );

  } catch (err) {
    console.error("❌ Erreur accepterMission:", err.message);
    return `❌ Une erreur est survenue. Réessayez ou appelez le ${process.env.GOLIV_SUPPORT_PHONE}`;
  }
}

// ─── Refuser une mission ──────────────────────────────────────────────
async function refuserMission(phone, numero) {
  return (
    `❌ Mission *${numero}* refusée.\n\n` +
    `Pas de problème ! Restez disponible pour les prochaines missions.\n\n` +
    `Tapez *INDISPO* si vous ne voulez plus recevoir de missions pour l'instant.`
  );
}

// ─── Confirmer la livraison ───────────────────────────────────────────
async function confirmerLivraison(phone, numero) {
  try {
    const commande = await Commande.findOne({ numero, livreur_whatsapp: phone });
    if (!commande) return `❌ Commande *${numero}* introuvable ou non assignée à vous.`;
    if (commande.statut === "livre") return `⚠️ Cette livraison est déjà confirmée.`;

    // Mettre à jour le statut
    await Commande.findOneAndUpdate(
      { numero },
      {
        statut: "livre",
        $push: { historique_statuts: { statut: "livre", note: "Confirmé par le livreur" } },
      }
    );

    // Mettre à jour les stats du livreur
    await Livreur.findOneAndUpdate(
      { whatsapp: phone },
      {
        $inc: {
          courses_effectuees: 1,
          revenus_total: Math.round(commande.prix_total * 0.9),
        },
        disponible_maintenant: true, // Remettre disponible
      }
    );

    // Notifier le client
    await notifier.notifierClientLivre(commande);

    return (
      `🎉 *Livraison confirmée !*\n\n` +
      `📋 Commande : *${numero}*\n` +
      `💰 *${Math.round(commande.prix_total * 0.9).toLocaleString("fr-FR")} F CFA* seront virés sur votre Mobile Money.\n\n` +
      `Vous êtes maintenant disponible pour de nouvelles missions !\n\n` +
      `Tapez *INDISPO* si vous souhaitez faire une pause.`
    );

  } catch (err) {
    console.error("❌ Erreur confirmerLivraison:", err.message);
    return `❌ Erreur. Appelez le ${process.env.GOLIV_SUPPORT_PHONE}`;
  }
}

// ─── Changer disponibilité ────────────────────────────────────────────
async function setDisponibilite(phone, dispo) {
  try {
    const livreur = await Livreur.findOneAndUpdate(
      { whatsapp: phone, statut: "actif" },
      { disponible_maintenant: dispo },
      { new: true }
    );

    if (!livreur) return `❌ Compte livreur non trouvé ou inactif.\n\nContactez le ${process.env.GOLIV_SUPPORT_PHONE}`;

    return dispo
      ? `✅ *Vous êtes maintenant DISPONIBLE !*\n\nVous allez recevoir les prochaines missions dans votre zone.\n\n📍 Zone : ${livreur.zone}\n\n_Tapez *INDISPO* pour faire une pause._`
      : `⏸️ *Vous êtes maintenant INDISPONIBLE.*\n\nVous ne recevrez plus de missions jusqu'à ce que vous tapiez *DISPO*.\n\nBonne pause ! 😊`;

  } catch (err) {
    console.error("❌ Erreur setDisponibilite:", err.message);
    return `❌ Erreur. Réessayez.`;
  }
}

// ─── Voir ses statistiques ────────────────────────────────────────────
async function mesStats(phone) {
  try {
    const livreur = await Livreur.findOne({ whatsapp: phone });
    if (!livreur) return `❌ Vous n'êtes pas enregistré comme livreur.`;

    const icone = livreur.disponible_maintenant ? "🟢 Disponible" : "🔴 Indisponible";

    return (
      `📊 *Mes statistiques GoLiv*\n\n` +
      `👤 ${livreur.prenom} ${livreur.nom}\n` +
      `${livreur.vehicule}\n` +
      `📍 Zone : ${livreur.zone}\n` +
      `Statut : ${icone}\n\n` +
      `─────────────────\n` +
      `🛵 Courses effectuées : *${livreur.courses_effectuees}*\n` +
      `💰 Total gagné : *${livreur.revenus_total?.toLocaleString("fr-FR")} F CFA*\n` +
      `⭐ Note moyenne : *${livreur.note > 0 ? livreur.note.toFixed(1) + "/5" : "Pas encore noté"}*\n\n` +
      `─────────────────\n` +
      `*DISPO* → Se mettre disponible\n` +
      `*INDISPO* → Faire une pause`
    );

  } catch (err) {
    console.error("❌ Erreur mesStats:", err.message);
    return `❌ Erreur. Réessayez.`;
  }
}

module.exports = { handleLivreurAction };
