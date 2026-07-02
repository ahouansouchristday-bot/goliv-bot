const sessionManager = require("../services/sessionManager");
const { askClaude }  = require("../services/claudeAI");
const { genererNumeroCommande } = require("../services/pricing");
const { handleLivreurInscription, demarrerInscription } = require("./livreurHandler");
const { handleLivreurAction }  = require("./livreurActionsHandler");
const { handleLocation, demarrerLocalisation } = require("./locationHandler");
const { analyserTrajet } = require("../services/location.service");
const db       = require("../services/dbService");
const notifier = require("../services/notifier");

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
  if (m==="2"||m.includes("suivi")||m.match(/glv-\d/)) return "suivi";
  if (m==="3"||m.includes("tarif")||m.includes("prix")||m.includes("combien")) return "tarif";
  if (m==="4"||m.includes("réclamation")||m.includes("support")) return "support";
  if (m==="5"||m.includes("livreur")||m.includes("inscription")) return "livreur";
  if (["oui","yes","ok","confirmer","valider"].includes(m)) return "oui";
  if (["non","no","annuler"].includes(m)) return "non";
  if (m==="urgent"||m.includes("urgent")) return "urgent";
  if (m==="standard"||m.includes("standard")) return "standard";
  return "ai";
}

function isLivreurCommand(msg) {
  const m=msg.trim().toUpperCase();
  return m.startsWith("ACCEPTER ")||m.startsWith("REFUSER ")||m.startsWith("LIVRE ")||
    m==="DISPO"||m==="DISPONIBLE"||m==="INDISPO"||m==="INDISPONIBLE"||m==="MES-COURSES"||m==="STATS";
}

async function handleMessage(phone, incomingMsg, mediaUrl, mediaType, latitude, longitude, body) {
  const session = sessionManager.get(phone);
  const msg     = incomingMsg?.trim()||"";
  const intent  = detectIntent(msg);

  // 1. Commandes livreur
  if (isLivreurCommand(msg)) { const r=await handleLivreurAction(phone,msg); if(r) return r; }

  // 2. Menu global
  if (intent==="menu" && !session.step.startsWith("livreur_") && !session.step.startsWith("location_")) {
    sessionManager.reset(phone); return MSG_MENU();
  }

  // 3. Inscription livreur
  if (session.step.startsWith("livreur_")) {
    const r=await handleLivreurInscription(phone,msg,mediaUrl,mediaType); if(r) return r;
  }

  // 4. Flow localisation
  if (session.step.startsWith("location_")) {
    const r=await handleLocation(phone,msg,body,latitude,longitude); if(r) return r;
  }

  // 5. MENU
  if (session.step==="menu") {
    switch(intent) {
      case "livraison": return demarrerLocalisation(phone,{});
      case "suivi": sessionManager.update(phone,{step:"suivi"}); return `🔍 *Suivi de colis*\n\nEntrez votre numéro de commande :\n_(Format: GLV-YYYYMMDD-XXXX)_`;
      case "tarif": sessionManager.update(phone,{step:"tarif_depart"}); return `💰 *Calculateur de tarif*\n\nQuartier de départ :\n_(Ex: Akpakpa, Godomey...)_`;
      case "support": sessionManager.update(phone,{step:"support"}); return `😊 *Support GoLiv*\n\nDécrivez votre problème :\n_Ou appelez le ${process.env.GOLIV_SUPPORT_PHONE}_`;
      case "livreur": return demarrerInscription(phone);
      default: sessionManager.update(phone,{step:"ai"}); return await handleAI(phone,msg,session);
    }
  }

  // 6. COLIS
  if (session.step==="colis") {
    const types={"1":"Document","2":"Petit colis","3":"Courses","4":"Nourriture"};
    const colis=types[msg]||msg;
    sessionManager.update(phone,{step:"service",order:{...session.order,colis}});
    return `✅ Colis : *${colis}*\n\nType de service :\n\n⚡ *1* - Urgent (30-45 min)\n🚚 *2* - Standard (1-2h)`;
  }

  // 7. SERVICE + PRIX
  if (session.step==="service") {
    const serviceType=(intent==="urgent"||msg==="1")?"urgent":"standard";
    const order={...session.order,service:serviceType};
    const tarif=await analyserTrajet(order.depart,order.destination,serviceType,order.depart_gps||null,order.destination_gps||null);
    const orderFinal={...order,prix:tarif.prix_total,distance_km:tarif.distance_km,delai:tarif.delai_texte};
    sessionManager.update(phone,{step:"confirmation",order:orderFinal});
    const icone=serviceType==="urgent"?"⚡":"🚚";
    const alerte=!tarif.fiable?"\n⚠️ _Prix estimé_":"";
    return (
      `📋 *Récapitulatif GoLiv*\n\n` +
      `📍 Départ : *${order.depart}*\n` +
      `🏁 Destination : *${order.destination}*\n` +
      `📦 Colis : ${order.colis}\n` +
      `${icone} Service : ${serviceType==="urgent"?"Urgent":"Standard"}\n` +
      `📏 Distance : *${tarif.distance_km} km*\n` +
      `⏱️ Délai : *${tarif.delai_texte}*\n` +
      `💰 Prix : *${tarif.prix_total.toLocaleString("fr-FR")} FCFA*`+alerte+
      `\n\n✅ *OUI* pour confirmer\n❌ *NON* pour annuler`
    );
  }

  // 8. CONFIRMATION
  if (session.step==="confirmation") {
    if (intent==="oui") {
      const numero=genererNumeroCommande();
      const commande=await db.creerCommande({numero,client_whatsapp:phone,...session.order});
      const nbLivr=commande?await notifier.notifierLivreurs(commande):0;
      sessionManager.reset(phone);
      return `🎉 *Commande confirmée !*\n\n📋 Numéro : *${numero}*\n🛵 ${nbLivr>0?`${nbLivr} livreur(s) alerté(s) !`:"Recherche d'un livreur..."}\n\n_Vous recevrez un message dès qu'un livreur accepte._\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}\n🔍 Suivi : tapez *${numero}*`;
    }
    if (intent==="non") { sessionManager.reset(phone); return `❌ Commande annulée.\n\nTapez *menu* pour recommencer.`; }
    return `Répondez *OUI* pour confirmer ou *NON* pour annuler.`;
  }

  // 9. TARIF
  if (session.step==="tarif_depart") {
    sessionManager.update(phone,{step:"tarif_dest",order:{depart:msg}});
    return `✅ Départ : *${msg}*\n\nQuartier de destination :`;
  }
  if (session.step==="tarif_dest") {
    const depart=session.order.depart, dest=msg;
    sessionManager.reset(phone);
    const std=await analyserTrajet(depart,dest,"standard");
    const urg=await analyserTrajet(depart,dest,"urgent");
    return `💰 *Tarif GoLiv*\n\n📍 ${depart} → ${dest}\n📏 Distance : *${std.distance_km} km*\n\n🚚 Standard (${std.delai_texte}) : *${std.prix_total.toLocaleString("fr-FR")} FCFA*\n⚡ Urgent (${urg.delai_texte}) : *${urg.prix_total.toLocaleString("fr-FR")} FCFA*\n\nTapez *1* pour commander ou *menu* pour revenir.`;
  }

  // 10. SUIVI
  if (session.step==="suivi") {
    const match=msg.toUpperCase().match(/GLV-\d{6,8}-\d{4}/);
    if (!match) return `⚠️ Format invalide. Exemple : *GLV-20240115-1234*`;
    const commande=await db.trouverCommande(match[0]);
    sessionManager.reset(phone);
    if (!commande) return `❌ Commande *${match[0]}* introuvable.\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}`;
    const icones={en_attente:"🟡",livreur_assigne:"🔵",en_cours:"🟠",livre:"✅",annule:"❌",litige:"⚠️"};
    return `📦 *Commande ${match[0]}*\n\nStatut : ${icones[commande.statut]||"🔵"} *${commande.statut.replace(/_/g," ")}*\n📍 ${commande.depart} → ${commande.destination}\n💰 ${commande.prix_total?.toLocaleString("fr-FR")} FCFA\n📅 ${new Date(commande.createdAt).toLocaleDateString("fr-FR")}\n\n📞 ${process.env.GOLIV_SUPPORT_PHONE}\nTapez *menu* pour revenir.`;
  }

  // 11. SUPPORT / AI
  if (["support","ai"].includes(session.step)) return await handleAI(phone,msg,session);

  sessionManager.reset(phone); return MSG_MENU();
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
