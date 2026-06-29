const sessionManager = require("../services/sessionManager");
const { askClaude }  = require("../services/claudeAI");
const { genererNumeroCommande, formatRecapCommande } = require("../services/pricing");
const { handleLivreurInscription, demarrerInscription } = require("./livreurHandler");
const { handleLivreurAction }  = require("./livreurActionsHandler");
const db       = require("../services/dbService");
const notifier = require("../services/notifier");
const geo      = require("../services/geolocator");
const payment  = require("../services/payment");

const MSG_MENU = () =>
  `👋 Bonjour et bienvenue chez *GoLiv Bénin* ! 🛵\n\n` +
  `_Le client demande, la plateforme organise, le livreur exécute._\n\n` +
  `Que souhaitez-vous faire ?\n\n` +
  `1️⃣  Nouvelle livraison\n2️⃣  Suivre mon colis\n3️⃣  Calculer un tarif\n4️⃣  Réclamation / Support\n5️⃣  Devenir livreur GoLiv\n\n` +
  `_Tapez le numéro de votre choix._`;

function detectIntent(msg) {
  const m = msg.toLowerCase().trim();
  if (["menu","accueil","retour","0","bonjour","salut","hello","bonsoir"].some(k=>m.includes(k))) return "menu";
  if (m==="1"||m.includes("livraison")||m.includes("commander")) return "livraison";
  if (m==="2"||m.includes("suivi")||m.includes("suivre")||m.match(/glv-\d/)) return "suivi";
  if (m==="3"||m.includes("tarif")||m.includes("prix")||m.includes("combien")) return "tarif";
  if (m==="4"||m.includes("réclamation")||m.includes("problème")||m.includes("support")) return "support";
  if (m==="5"||m.includes("livreur")||m.includes("travailler")||m.includes("inscription")) return "livreur";
  if (["oui","yes","ok","confirmer","valider"].includes(m)) return "oui";
  if (["non","no","annuler"].includes(m)) return "non";
  if (m==="urgent"||m.includes("urgent")) return "urgent";
  if (m==="standard"||m.includes("standard")) return "standard";
  if (m.startsWith("payer")||m.includes("paiement")) return "payer";
  return "ai";
}

function isLivreurCommand(msg) {
  const m = msg.trim().toUpperCase();
  return (
    m.startsWith("ACCEPTER ")||m.startsWith("REFUSER ")||m.startsWith("LIVRE ")||
    m==="DISPO"||m==="DISPONIBLE"||m==="INDISPO"||m==="INDISPONIBLE"||
    m==="MES-COURSES"||m==="STATS"
  );
}

async function handleMessage(phone, incomingMsg, mediaUrl, mediaType) {
  const session = sessionManager.get(phone);
  const msg     = incomingMsg?.trim() || "";
  const intent  = detectIntent(msg);

  // ── Commandes livreur prioritaires ──────────────────────────────────
  if (isLivreurCommand(msg)) {
    const rep = await handleLivreurAction(phone, msg);
    if (rep) return rep;
  }

  // ── Menu global ──────────────────────────────────────────────────────
  if (intent==="menu" && !session.step.startsWith("livreur_")) {
    sessionManager.reset(phone);
    return MSG_MENU();
  }

  // ── Inscription livreur ──────────────────────────────────────────────
  if (session.step.startsWith("livreur_")) {
    const rep = await handleLivreurInscription(phone, msg, mediaUrl, mediaType);
    if (rep) return rep;
  }

  // ── MENU ─────────────────────────────────────────────────────────────
  if (session.step==="menu") {
    switch(intent) {
      case "livraison":
        sessionManager.update(phone,{step:"depart",order:{}});
        return `📦 *Nouvelle livraison GoLiv*\n\nÉtape 1/4 — Point de départ\n\nOù se trouve le colis ?\n_(Ex: Quartier Gbégamey, Cotonou)_`;
      case "suivi":
        sessionManager.update(phone,{step:"suivi"});
        return `🔍 *Suivi de colis*\n\nEntrez votre numéro de commande :\n_(Format: GLV-YYYYMMDD-XXXX)_`;
      case "tarif":
        sessionManager.update(phone,{step:"tarif_depart"});
        return `💰 *Calculateur de tarif précis*\n\nÉtape 1/2 — Point de départ :\n_(Ex: Akpakpa, Cotonou)_`;
      case "support":
        sessionManager.update(phone,{step:"support"});
        return `😊 *Support GoLiv*\n\nDécrivez votre problème :\n_Ou appelez le ${process.env.GOLIV_SUPPORT_PHONE}_`;
      case "livreur":
        return demarrerInscription(phone);
      default:
        sessionManager.update(phone,{step:"ai"});
        return await handleAI(phone,msg,session);
    }
  }

  // ── LIVRAISON ─────────────────────────────────────────────────────────
  if (session.step==="depart") {
    if (msg.length<3) return "⚠️ Entrez un point de départ valide.";
    sessionManager.update(phone,{step:"destination",order:{depart:msg}});
    return `✅ Départ : *${msg}*\n\nÉtape 2/4 — Destination\n\nOù livrer ?`;
  }

  if (session.step==="destination") {
    const order={...session.order,destination:msg};
    sessionManager.update(phone,{step:"colis",order});
    return `✅ Destination : *${msg}*\n\nÉtape 3/4 — Type de colis\n\n📄 *1* - Document\n📦 *2* - Petit colis\n🛍️ *3* - Courses\n🍱 *4* - Nourriture\n📫 *5* - Autre`;
  }

  if (session.step==="colis") {
    const types={"1":"Document","2":"Petit colis","3":"Courses","4":"Nourriture"};
    const colis=types[msg]||msg;
    const order={...session.order,colis};
    sessionManager.update(phone,{step:"service",order});
    return `✅ Colis : *${colis}*\n\nÉtape 4/4 — Service\n\n⚡ *1* - Urgent (30-45 min)\n🚚 *2* - Standard (1-2h)`;
  }

  if (session.step==="service") {
    const serviceType=(intent==="urgent"||msg==="1")?"urgent":"standard";
    const order={...session.order,service:serviceType};
    sessionManager.update(phone,{step:"calcul_prix",order});

    // Calculer le prix réel avec la géolocalisation
    const trajet = await geo.analyserTrajet(order.depart, order.destination, serviceType);

    const prix  = trajet ? trajet.prix : (serviceType==="urgent"?2200:1300);
    const temps = trajet ? trajet.temps : (serviceType==="urgent"?"30-45 min":"1-2 heures");
    const dist  = trajet ? `${trajet.distance} km` : "distance estimée";

    const orderFinal = {...order, prix, distance: trajet?.distance};
    sessionManager.update(phone,{step:"confirmation",order:orderFinal});

    return (
      `✅ Service : *${serviceType==="urgent"?"⚡ Urgent":"🚚 Standard"}*\n\n` +
      `📋 *Récapitulatif GoLiv*\n\n` +
      `📍 Départ : ${order.depart}\n` +
      `🏁 Destination : ${order.destination}\n` +
      `📦 Colis : ${order.colis}\n` +
      `📏 Distance : *${dist}*\n` +
      `⏱️ Temps estimé : *${temps}*\n` +
      `💰 Prix : *${prix.toLocaleString("fr-FR")} F CFA*\n\n` +
      `✅ *OUI* pour confirmer\n❌ *NON* pour annuler`
    );
  }

  if (session.step==="confirmation") {
    if (intent==="oui") {
      const numero   = genererNumeroCommande();
      const order    = session.order;
      const commande = await db.creerCommande({numero,client_whatsapp:phone,...order});
      const nbLivr   = commande ? await notifier.notifierLivreurs(commande) : 0;

      // Initier paiement Mobile Money
      let msgPaiement = "";
      if (commande && process.env.CINETPAY_API_KEY) {
        const paie = await payment.initierPaiementCinetpay(commande, phone.replace("whatsapp:",""));
        if (paie.succes && paie.lienPaiement) {
          msgPaiement = `\n\n💳 *Payez maintenant :*\n${paie.lienPaiement}`;
        }
      }

      sessionManager.reset(phone);
      return (
        `🎉 *Commande confirmée !*\n\n` +
        `📋 Numéro : *${numero}*\n` +
        `🛵 ${nbLivr>0?`${nbLivr} livreur(s) alerté(s) !`:"Recherche d'un livreur..."}\n` +
        `_Vous recevrez un message dès qu'un livreur accepte._` +
        msgPaiement +
        `\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}\n🔍 Suivi : *${numero}*`
      );
    }
    if (intent==="non") { sessionManager.reset(phone); return `❌ Commande annulée.\n\nTapez *menu* pour recommencer.`; }
    return `Répondez *OUI* pour confirmer ou *NON* pour annuler.`;
  }

  // ── TARIF avec géolocalisation ────────────────────────────────────────
  if (session.step==="tarif_depart") {
    sessionManager.update(phone,{step:"tarif_dest",order:{depart:msg}});
    return `✅ Départ : *${msg}*\n\nÉtape 2/2 — Destination :\n_(Ex: Calavi, Abomey-Calavi)_`;
  }

  if (session.step==="tarif_dest") {
    const depart = session.order.depart;
    const dest   = msg;
    sessionManager.reset(phone);

    const trajetStd = await geo.analyserTrajet(depart, dest, "standard");
    const trajetUrg = await geo.analyserTrajet(depart, dest, "urgent");

    if (!trajetStd) return `❌ Impossible de calculer ce trajet. Vérifiez les adresses.`;

    return (
      `💰 *Tarif précis GoLiv*\n\n` +
      `📍 ${depart} → ${dest}\n` +
      `📏 Distance : *${trajetStd.distance} km*\n\n` +
      `🚚 Standard (${trajetStd.temps}) : *${trajetStd.prix.toLocaleString("fr-FR")} F CFA*\n` +
      `⚡ Urgent (${trajetUrg?.temps||"30-45 min"}) : *${(trajetUrg?.prix||trajetStd.prix*1.6|0).toLocaleString("fr-FR")} F CFA*\n\n` +
      `Tapez *1* pour commander ou *menu* pour revenir.`
    );
  }

  // ── SUIVI ─────────────────────────────────────────────────────────────
  if (session.step==="suivi") {
    const match=msg.toUpperCase().match(/GLV-\d{6,8}-\d{4}/);
    if (!match) return `⚠️ Format invalide. Exemple : *GLV-20240115-1234*`;
    const commande=await db.trouverCommande(match[0]);
    sessionManager.reset(phone);
    if (!commande) return `❌ Commande *${match[0]}* introuvable.\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}`;
    const icones={en_attente:"🟡",livreur_assigne:"🔵",en_cours:"🟠",livre:"✅",annule:"❌",litige:"⚠️"};
    const livreurInfo = commande.livreur_id
      ? `\n🛵 Livreur : ${commande.livreur_id.prenom} ${commande.livreur_id.nom} — ${commande.livreur_id.telephone}` : "";
    return (
      `📦 *Commande ${match[0]}*\n\n` +
      `Statut : ${icones[commande.statut]||"🔵"} *${commande.statut.replace(/_/g," ")}*\n` +
      `📍 ${commande.depart} → ${commande.destination}\n` +
      `💰 ${commande.prix_total?.toLocaleString("fr-FR")} F CFA\n` +
      `📅 ${new Date(commande.createdAt).toLocaleDateString("fr-FR")}` +
      livreurInfo +
      `\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}\nTapez *menu* pour revenir.`
    );
  }

  // ── SUPPORT / AI ──────────────────────────────────────────────────────
  if (["support","ai"].includes(session.step)) return await handleAI(phone,msg,session);

  sessionManager.reset(phone);
  return MSG_MENU();
}

async function handleAI(phone,msg,session) {
  sessionManager.addToHistory(phone,"user",msg);
  const fresh=sessionManager.get(phone);
  const reply=await askClaude(msg,fresh.history.slice(0,-1));
  sessionManager.addToHistory(phone,"assistant",reply);
  sessionManager.update(phone,{step:"ai"});
  return reply+`\n\n_Tapez *menu* pour revenir à l'accueil._`;
}

module.exports = { handleMessage };
