/**
 * notifier.js
 * Système de notification GoLiv
 * 
 * Quand une commande arrive :
 * 1. On cherche les livreurs disponibles dans la zone
 * 2. On leur envoie un message WhatsApp avec les détails
 * 3. Le premier qui répond OUI prend la course
 * 4. On notifie le client que son livreur est assigné
 */

const twilio  = require("twilio");
const Livreur = require("../models/Livreur");
const db      = require("./dbService");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─── Envoyer un message WhatsApp ──────────────────────────────────────
async function envoyerWhatsApp(numero, message) {
  try {
    // S'assurer que le numéro est au bon format
    const to = numero.startsWith("whatsapp:") ? numero : `whatsapp:${numero}`;
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: message,
    });
    console.log(`📤 Message envoyé à ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Erreur envoi WhatsApp à ${numero}:`, err.message);
    return false;
  }
}

// ─── Notifier les livreurs disponibles d'une nouvelle commande ────────
async function notifierLivreurs(commande) {
  try {
    // Chercher livreurs actifs dans la zone de départ
    const livreurs = await Livreur.find({
      statut:                "actif",
      disponible_maintenant: true,
      zone: { $regex: commande.depart.split(",")[0].trim(), $options: "i" },
    }).limit(5);

    if (livreurs.length === 0) {
      console.log(`⚠️  Aucun livreur disponible pour la commande ${commande.numero}`);

      // Chercher dans toutes les zones si aucun livreur trouvé localement
      const livreursGlobal = await Livreur.find({
        statut:                "actif",
        disponible_maintenant: true,
      }).limit(3);

      if (livreursGlobal.length === 0) {
        console.log("⚠️  Aucun livreur actif sur toute la plateforme");
        return 0;
      }

      livreurs.push(...livreursGlobal);
    }

    const iconeService = commande.service === "urgent" ? "⚡" : "🚚";
    const msg =
      `🔔 *Nouvelle mission GoLiv !*\n\n` +
      `📋 N° : *${commande.numero}*\n` +
      `${iconeService} Service : *${commande.service === "urgent" ? "URGENT" : "Standard"}*\n\n` +
      `📍 *Départ :* ${commande.depart}\n` +
      `🏁 *Destination :* ${commande.destination}\n` +
      `📦 *Colis :* ${commande.type_colis}\n\n` +
      `💰 *Votre gain :* ${commande.revenu_livreur?.toLocaleString("fr-FR") || Math.round(commande.prix_total * 0.9)} F CFA\n\n` +
      `─────────────────\n` +
      `Répondez *ACCEPTER ${commande.numero}* pour prendre cette course\n` +
      `Répondez *REFUSER ${commande.numero}* pour passer\n\n` +
      `_Répondez vite ! La mission peut être prise par un autre livreur._`;

    // Envoyer à chaque livreur
    let nbEnvoyes = 0;
    for (const livreur of livreurs) {
      const succes = await envoyerWhatsApp(livreur.whatsapp, msg);
      if (succes) nbEnvoyes++;
    }

    console.log(`✅ Notification envoyée à ${nbEnvoyes} livreur(s) pour ${commande.numero}`);
    return nbEnvoyes;

  } catch (err) {
    console.error("❌ Erreur notification livreurs:", err.message);
    return 0;
  }
}

// ─── Notifier le client que son livreur est assigné ───────────────────
async function notifierClientLivreurAssigne(commande, livreur) {
  const msg =
    `🛵 *Votre livreur est en route !*\n\n` +
    `📋 Commande : *${commande.numero}*\n\n` +
    `👤 Livreur : *${livreur.prenom} ${livreur.nom}*\n` +
    `📱 Contact : ${livreur.telephone}\n` +
    `${livreur.vehicule}\n\n` +
    `_Votre livreur se dirige vers le point de départ._\n\n` +
    `📞 Besoin d'aide : ${process.env.GOLIV_SUPPORT_PHONE}`;

  return await envoyerWhatsApp(commande.client_whatsapp, msg);
}

// ─── Notifier le client : livraison effectuée ─────────────────────────
async function notifierClientLivre(commande) {
  const msg =
    `✅ *Livraison effectuée !*\n\n` +
    `📋 Commande : *${commande.numero}*\n` +
    `📦 Votre colis a bien été livré.\n\n` +
    `Merci de faire confiance à *GoLiv Bénin* ! 💚\n\n` +
    `─────────────────\n` +
    `⭐ Notez votre livreur (1 à 5) :\n` +
    `Répondez *NOTE ${commande.numero} 5* pour noter 5 étoiles`;

  return await envoyerWhatsApp(commande.client_whatsapp, msg);
}

// ─── Notifier le livreur : commande confirmée ─────────────────────────
async function notifierLivreurConfirmation(livreur, commande) {
  const msg =
    `✅ *Mission confirmée !*\n\n` +
    `📋 Commande : *${commande.numero}*\n\n` +
    `📍 *Récupérer le colis ici :*\n${commande.depart}\n\n` +
    `🏁 *Livrer à :*\n${commande.destination}\n\n` +
    `📦 Colis : ${commande.type_colis}\n` +
    `💰 Votre gain : *${Math.round(commande.prix_total * 0.9).toLocaleString("fr-FR")} F CFA*\n\n` +
    `─────────────────\n` +
    `Une fois le colis livré, répondez :\n` +
    `*LIVRE ${commande.numero}* pour confirmer la livraison`;

  return await envoyerWhatsApp(livreur.whatsapp, msg);
}

// ─── Notifier l'admin GoLiv ───────────────────────────────────────────
async function notifierAdmin(message) {
  const adminPhone = process.env.GOLIV_ADMIN_WHATSAPP;
  if (!adminPhone) return;
  return await envoyerWhatsApp(adminPhone, message);
}

// ─── Notifier admin : nouveau livreur inscrit ─────────────────────────
async function notifierAdminNouveauLivreur(livreur) {
  const msg =
    `🔔 *Nouveau livreur à valider !*\n\n` +
    `👤 *${livreur.prenom} ${livreur.nom}*\n` +
    `📱 ${livreur.telephone}\n` +
    `🚗 ${livreur.vehicule}\n` +
    `📍 Zone : ${livreur.zone}\n` +
    `🕐 Dispo : ${livreur.disponibilite}\n` +
    `💳 MoMo : ${livreur.mobile_money}\n\n` +
    `👉 Validez sur le dashboard :\n` +
    `${process.env.BASE_URL}/admin?key=${process.env.ADMIN_SECRET_KEY}`;

  return await notifierAdmin(msg);
}

module.exports = {
  envoyerWhatsApp,
  notifierLivreurs,
  notifierClientLivreurAssigne,
  notifierClientLivre,
  notifierLivreurConfirmation,
  notifierAdmin,
  notifierAdminNouveauLivreur,
};
