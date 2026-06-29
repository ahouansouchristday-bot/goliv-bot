/**
 * livreurHandler.js
 * Gère l'inscription complète d'un livreur GoLiv via WhatsApp
 * 
 * Étapes du formulaire :
 * nom → prenom → telephone → vehicule → permis → zone → disponibilite
 * → mobile_money → photo_cni_recto → photo_cni_verso → photo_vehicule → cgu → terminé
 */

const sessionManager = require("../services/sessionManager");
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─── Zones de livraison disponibles ───────────────────────────────────
const ZONES = [
  "Cotonou Centre",
  "Cotonou Nord (Akpakpa, Zongo)",
  "Cotonou Sud (Fidjrossè, Cadjehoun)",
  "Abomey-Calavi",
  "Porto-Novo",
  "Sèmè-Kpodji",
  "Ouidah",
  "Parakou",
  "Autre zone",
];

// ─── Types de véhicules ───────────────────────────────────────────────
const VEHICULES = [
  "🛵 Moto",
  "🚲 Vélo",
  "🚗 Voiture",
  "🛺 Tricycle",
];

// ─── Disponibilités ───────────────────────────────────────────────────
const DISPOS = [
  "Tous les jours (7j/7)",
  "Lundi - Vendredi",
  "Week-end uniquement",
  "Matin uniquement (6h-13h)",
  "Après-midi uniquement (13h-20h)",
  "Soir uniquement (18h-22h)",
  "Flexible (selon les missions)",
];

// ─── Messages du formulaire ───────────────────────────────────────────
const ETAPES = {
  nom: () =>
    `👤 *Étape 1/11 — Votre nom de famille*\n\nComment vous appelez-vous ?\n_(Ex: AGOSSOU)_`,

  prenom: (data) =>
    `✅ Nom : *${data.nom}*\n\n👤 *Étape 2/11 — Votre prénom*\n\n_(Ex: Koffi)_`,

  telephone: (data) =>
    `✅ Prénom : *${data.prenom}*\n\n📱 *Étape 3/11 — Numéro de téléphone*\n\nEntrez votre numéro de téléphone principal :\n_(Ex: +229 97 00 00 00)_`,

  vehicule: (data) =>
    `✅ Téléphone : *${data.telephone}*\n\n🚗 *Étape 4/11 — Type de véhicule*\n\nQuel véhicule utilisez-vous pour livrer ?\n\n${VEHICULES.map((v, i) => `${i + 1}. ${v}`).join("\n")}`,

  permis: (data) =>
    `✅ Véhicule : *${data.vehicule}*\n\n📋 *Étape 5/11 — Numéro de permis*\n\n${data.vehicule.includes("Vélo") ? "Pour un vélo, le permis n'est pas obligatoire. Tapez *AUCUN* si vous n'en avez pas." : "Entrez votre numéro de permis de conduire :"}\n_(Ex: BJ-2019-12345 ou AUCUN)_`,

  zone: (data) =>
    `✅ Permis : *${data.permis}*\n\n📍 *Étape 6/11 — Zone de livraison habituelle*\n\nDans quelle zone livrez-vous principalement ?\n\n${ZONES.map((z, i) => `${i + 1}. ${z}`).join("\n")}`,

  disponibilite: (data) =>
    `✅ Zone : *${data.zone}*\n\n🕐 *Étape 7/11 — Vos disponibilités*\n\nQuand êtes-vous disponible pour livrer ?\n\n${DISPOS.map((d, i) => `${i + 1}. ${d}`).join("\n")}`,

  mobile_money: (data) =>
    `✅ Disponibilité : *${data.disponibilite}*\n\n💳 *Étape 8/11 — Numéro Mobile Money*\n\nEntrez le numéro Mobile Money où vous souhaitez recevoir vos paiements :\n_(MTN MoMo ou Moov Money — Ex: +229 96 00 00 00)_`,

  photo_cni_recto: (data) =>
    `✅ Mobile Money : *${data.mobile_money}*\n\n🪪 *Étape 9/11 — Photo CNI (Recto)*\n\nEnvoyez une photo du *recto* de votre Carte Nationale d'Identité ou passeport.\n\n_Assurez-vous que la photo est nette et lisible._`,

  photo_cni_verso: () =>
    `✅ Recto CNI reçu !\n\n🪪 *Étape 10/11 — Photo CNI (Verso)*\n\nMaintenant envoyez une photo du *verso* de votre pièce d'identité.`,

  photo_vehicule: () =>
    `✅ Verso CNI reçu !\n\n📸 *Étape 11/11 — Photo de votre véhicule*\n\nEnvoyez une photo de votre véhicule de livraison.\n\n_La photo doit montrer clairement le véhicule et sa plaque si applicable._`,

  cgu: (data) =>
    `✅ Photo véhicule reçue !\n\n📋 *Récapitulatif de votre dossier GoLiv*\n\n` +
    `👤 Nom : *${data.nom} ${data.prenom}*\n` +
    `📱 Téléphone : *${data.telephone}*\n` +
    `🚗 Véhicule : *${data.vehicule}*\n` +
    `📋 Permis : *${data.permis}*\n` +
    `📍 Zone : *${data.zone}*\n` +
    `🕐 Disponibilité : *${data.disponibilite}*\n` +
    `💳 Mobile Money : *${data.mobile_money}*\n` +
    `🪪 CNI : ✅ Reçue\n` +
    `📸 Véhicule : ✅ Reçue\n\n` +
    `─────────────────\n` +
    `📜 *Conditions GoLiv :*\n` +
    `• Commission GoLiv : 10% par course\n` +
    `• Vous êtes livreur indépendant\n` +
    `• Respect du client obligatoire\n` +
    `• Ponctualité exigée\n` +
    `• Notation minimum : 3.5/5\n\n` +
    `Tapez *ACCEPTER* pour soumettre votre dossier\nTapez *REFUSER* pour annuler`,

  termine: (data) =>
    `🎉 *Dossier soumis avec succès !*\n\n` +
    `Bonjour *${data.prenom} ${data.nom}*,\n\n` +
    `Votre dossier a bien été reçu par GoLiv Bénin.\n\n` +
    `⏳ *Délai de validation : 24 à 48 heures*\n\n` +
    `Notre équipe va vérifier vos documents et vous contacter sur ce numéro WhatsApp.\n\n` +
    `📞 Questions : ${process.env.GOLIV_SUPPORT_PHONE}\n\n` +
    `Merci de rejoindre la famille GoLiv ! 💚🛵`,
};

// ─── Fonction principale ──────────────────────────────────────────────

async function handleLivreurInscription(phone, msg, mediaUrl, mediaType) {
  const session = sessionManager.get(phone);
  const etape = session.step;
  const data = session.order || {};

  // Commande globale : annuler
  if (["annuler", "stop", "quitter"].includes(msg.toLowerCase())) {
    sessionManager.reset(phone);
    return "❌ Inscription annulée. Tapez *menu* pour revenir à l'accueil.";
  }

  // ── Étape : nom ─────────────────────────────────────────────────────
  if (etape === "livreur_nom") {
    if (msg.length < 2) return "⚠️ Veuillez entrer un nom valide.";
    const newData = { ...data, nom: msg.toUpperCase() };
    sessionManager.update(phone, { step: "livreur_prenom", order: newData });
    return ETAPES.prenom(newData);
  }

  // ── Étape : prénom ──────────────────────────────────────────────────
  if (etape === "livreur_prenom") {
    if (msg.length < 2) return "⚠️ Veuillez entrer un prénom valide.";
    const newData = { ...data, prenom: msg };
    sessionManager.update(phone, { step: "livreur_telephone", order: newData });
    return ETAPES.telephone(newData);
  }

  // ── Étape : téléphone ───────────────────────────────────────────────
  if (etape === "livreur_telephone") {
    const tel = msg.replace(/\s/g, "");
    if (tel.length < 8) return "⚠️ Numéro invalide. Entrez un numéro complet.\n_(Ex: +229 97 00 00 00)_";
    const newData = { ...data, telephone: tel };
    sessionManager.update(phone, { step: "livreur_vehicule", order: newData });
    return ETAPES.vehicule(newData);
  }

  // ── Étape : véhicule ────────────────────────────────────────────────
  if (etape === "livreur_vehicule") {
    const idx = parseInt(msg) - 1;
    const choix = VEHICULES[idx] || msg;
    if (!VEHICULES[idx] && msg.length < 2) return `⚠️ Choisissez un numéro entre 1 et ${VEHICULES.length}.`;
    const newData = { ...data, vehicule: choix };
    sessionManager.update(phone, { step: "livreur_permis", order: newData });
    return ETAPES.permis(newData);
  }

  // ── Étape : permis ──────────────────────────────────────────────────
  if (etape === "livreur_permis") {
    if (msg.length < 2) return "⚠️ Entrez votre numéro de permis ou tapez *AUCUN*.";
    const newData = { ...data, permis: msg.toUpperCase() };
    sessionManager.update(phone, { step: "livreur_zone", order: newData });
    return ETAPES.zone(newData);
  }

  // ── Étape : zone ────────────────────────────────────────────────────
  if (etape === "livreur_zone") {
    const idx = parseInt(msg) - 1;
    const choix = ZONES[idx] || msg;
    const newData = { ...data, zone: choix };
    sessionManager.update(phone, { step: "livreur_disponibilite", order: newData });
    return ETAPES.disponibilite(newData);
  }

  // ── Étape : disponibilité ───────────────────────────────────────────
  if (etape === "livreur_disponibilite") {
    const idx = parseInt(msg) - 1;
    const choix = DISPOS[idx] || msg;
    const newData = { ...data, disponibilite: choix };
    sessionManager.update(phone, { step: "livreur_mobile_money", order: newData });
    return ETAPES.mobile_money(newData);
  }

  // ── Étape : mobile money ────────────────────────────────────────────
  if (etape === "livreur_mobile_money") {
    const tel = msg.replace(/\s/g, "");
    if (tel.length < 8) return "⚠️ Numéro Mobile Money invalide.\n_(Ex: +229 96 00 00 00)_";
    const newData = { ...data, mobile_money: tel };
    sessionManager.update(phone, { step: "livreur_photo_cni_recto", order: newData });
    return ETAPES.photo_cni_recto(newData);
  }

  // ── Étape : photo CNI recto ─────────────────────────────────────────
  if (etape === "livreur_photo_cni_recto") {
    if (!mediaUrl || !mediaType?.startsWith("image")) {
      return "⚠️ Veuillez envoyer une *photo* (pas du texte).\nEnvoyez la photo du recto de votre CNI.";
    }
    const newData = { ...data, photo_cni_recto: mediaUrl };
    sessionManager.update(phone, { step: "livreur_photo_cni_verso", order: newData });
    return ETAPES.photo_cni_verso();
  }

  // ── Étape : photo CNI verso ─────────────────────────────────────────
  if (etape === "livreur_photo_cni_verso") {
    if (!mediaUrl || !mediaType?.startsWith("image")) {
      return "⚠️ Veuillez envoyer une *photo* du verso de votre CNI.";
    }
    const newData = { ...data, photo_cni_verso: mediaUrl };
    sessionManager.update(phone, { step: "livreur_photo_vehicule", order: newData });
    return ETAPES.photo_vehicule();
  }

  // ── Étape : photo véhicule ──────────────────────────────────────────
  if (etape === "livreur_photo_vehicule") {
    if (!mediaUrl || !mediaType?.startsWith("image")) {
      return "⚠️ Veuillez envoyer une *photo* de votre véhicule.";
    }
    const newData = { ...data, photo_vehicule: mediaUrl };
    sessionManager.update(phone, { step: "livreur_cgu", order: newData });
    return ETAPES.cgu(newData);
  }

  // ── Étape : CGU ─────────────────────────────────────────────────────
  if (etape === "livreur_cgu") {
    if (msg.toUpperCase() === "ACCEPTER") {
      // Sauvegarder le livreur
      const livreur = {
        ...data,
        whatsapp: phone,
        statut: "en_attente_validation",
        date_inscription: new Date().toISOString(),
        note: 0,
        courses_effectuees: 0,
      };

      // TODO: Sauvegarder en base de données
      // await Livreur.create(livreur);

      // Notifier l'admin
      await notifierAdmin(livreur);

      sessionManager.reset(phone);
      return ETAPES.termine(data);

    } else if (msg.toUpperCase() === "REFUSER") {
      sessionManager.reset(phone);
      return "❌ Inscription annulée. Revenez quand vous voulez !\n\nTapez *menu* pour l'accueil.";
    } else {
      return "Tapez *ACCEPTER* pour soumettre votre dossier ou *REFUSER* pour annuler.";
    }
  }

  return null;
}

// ─── Notifier l'admin GoLiv ───────────────────────────────────────────

async function notifierAdmin(livreur) {
  try {
    const adminPhone = process.env.GOLIV_ADMIN_WHATSAPP;
    if (!adminPhone) return;

    const msg =
      `🔔 *Nouveau livreur inscrit !*\n\n` +
      `👤 *${livreur.prenom} ${livreur.nom}*\n` +
      `📱 ${livreur.whatsapp}\n` +
      `🚗 ${livreur.vehicule}\n` +
      `📍 Zone : ${livreur.zone}\n` +
      `🕐 Dispo : ${livreur.disponibilite}\n` +
      `💳 MoMo : ${livreur.mobile_money}\n\n` +
      `_Connectez-vous au tableau de bord pour valider ce livreur._`;

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${adminPhone}`,
      body: msg,
    });
  } catch (err) {
    console.error("❌ Erreur notification admin:", err.message);
  }
}

// ─── Démarrer l'inscription ───────────────────────────────────────────

function demarrerInscription(phone) {
  sessionManager.update(phone, { step: "livreur_nom", order: {} });
  return (
    `🛵 *Inscription Livreur GoLiv Bénin*\n\n` +
    `Bienvenue dans le processus d'inscription !\n\n` +
    `Je vais vous poser *11 questions* pour constituer votre dossier. Cela prend environ *5 minutes*.\n\n` +
    `À tout moment, tapez *ANNULER* pour arrêter.\n\n` +
    `─────────────────\n` +
    ETAPES.nom()
  );
}

module.exports = { handleLivreurInscription, demarrerInscription };
