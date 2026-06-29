/**
 * payment.js
 * Système de paiement GoLiv — MTN MoMo & Moov Money (Bénin)
 *
 * Deux options d'intégration :
 * 1. CinetPay (recommandé pour le Bénin — supporte MTN & Moov)
 * 2. MTN MoMo API directe (nécessite un compte développeur MTN)
 *
 * Pour commencer : utilisez CinetPay (cinetpay.com)
 * Inscription gratuite → tableau de bord → clé API
 */

const https   = require("https");
const Commande = require("../models/Commande");
const Livreur  = require("../models/Livreur");

// ─── Requête HTTP POST ────────────────────────────────────────────────
function httpPost(hostname, path, data) {
  return new Promise((resolve, reject) => {
    const body    = JSON.stringify(data);
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", chunk => d += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error("JSON parse error")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── CinetPay — Initier un paiement ──────────────────────────────────
/**
 * Envoyer une demande de paiement au client via CinetPay
 * Le client reçoit un USSD ou lien pour payer sur son téléphone
 */
async function initierPaiementCinetpay(commande, numeroTelephone) {
  try {
    const apiKey  = process.env.CINETPAY_API_KEY;
    const siteId  = process.env.CINETPAY_SITE_ID;

    if (!apiKey || !siteId) {
      console.warn("⚠️  CinetPay non configuré — paiement simulé");
      return { succes: true, simule: true, transactionId: `SIM-${Date.now()}` };
    }

    const payload = {
      apikey:           apiKey,
      site_id:          siteId,
      transaction_id:   commande.numero,
      amount:           commande.prix_total,
      currency:         "XOF", // Franc CFA
      description:      `Livraison GoLiv ${commande.depart} → ${commande.destination}`,
      customer_phone_number: numeroTelephone.replace(/\D/g, ""), // Seulement les chiffres
      customer_name:    "Client GoLiv",
      notify_url:       `${process.env.BASE_URL}/paiement/callback`,
      return_url:       `${process.env.BASE_URL}/paiement/retour`,
      channels:         "MOBILE_MONEY", // MTN MoMo, Moov Money
      lang:             "fr",
    };

    const result = await httpPost("api-checkout.cinetpay.com", "/v2/", payload);

    if (result.code === "201") {
      return {
        succes:        true,
        lienPaiement:  result.data?.payment_url,
        transactionId: commande.numero,
        message:       result.message,
      };
    } else {
      console.error("❌ Erreur CinetPay:", result.message);
      return { succes: false, erreur: result.message };
    }

  } catch (err) {
    console.error("❌ Erreur paiement CinetPay:", err.message);
    return { succes: false, erreur: err.message };
  }
}

// ─── Vérifier le statut d'un paiement ────────────────────────────────
async function verifierPaiement(transactionId) {
  try {
    const apiKey = process.env.CINETPAY_API_KEY;
    const siteId = process.env.CINETPAY_SITE_ID;

    if (!apiKey || !siteId) {
      return { statut: "paye", simule: true }; // Simulé si pas configuré
    }

    const payload = {
      apikey:         apiKey,
      site_id:        siteId,
      transaction_id: transactionId,
    };

    const result = await httpPost(
      "api-checkout.cinetpay.com",
      "/v2/payment/check/",
      payload
    );

    const statut = result.data?.status;
    return {
      statut: statut === "ACCEPTED" ? "paye" : "en_attente",
      details: result.data,
    };

  } catch (err) {
    console.error("❌ Erreur vérification paiement:", err.message);
    return { statut: "inconnu", erreur: err.message };
  }
}

// ─── Callback CinetPay (webhook paiement reçu) ───────────────────────
async function traiterCallbackPaiement(req, res) {
  try {
    const { cpm_trans_id, cpm_result, cpm_amount } = req.body;

    if (cpm_result === "00") {
      // Paiement réussi
      await Commande.findOneAndUpdate(
        { numero: cpm_trans_id },
        { paiement_statut: "paye", paiement_methode: "Mobile Money" }
      );
      console.log(`✅ Paiement reçu pour commande ${cpm_trans_id} — ${cpm_amount} F CFA`);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Erreur callback paiement:", err.message);
    res.status(500).send("ERROR");
  }
}

// ─── Virer argent au livreur (MTN MoMo) ─────────────────────────────
/**
 * Envoyer le paiement au livreur après livraison confirmée
 * Nécessite MTN MoMo API Developer (developer.mtn.com)
 */
async function payerLivreur(livreur, montant, numeroCommande) {
  try {
    const mtnKey = process.env.MTN_MOMO_API_KEY;

    if (!mtnKey) {
      // Mode simulation
      console.log(`💸 [SIMULÉ] Virement ${montant} F CFA → ${livreur.mobile_money} (${livreur.prenom} ${livreur.nom})`);
      return {
        succes:   true,
        simule:   true,
        montant,
        destinataire: livreur.mobile_money,
      };
    }

    // TODO: Intégration MTN MoMo API réelle
    // const result = await mtnMomoTransfer({ ... });

    // Mettre à jour les revenus du livreur
    await Livreur.findByIdAndUpdate(livreur._id, {
      $inc: { revenus_total: montant },
    });

    return { succes: true, montant, destinataire: livreur.mobile_money };

  } catch (err) {
    console.error("❌ Erreur paiement livreur:", err.message);
    return { succes: false, erreur: err.message };
  }
}

// ─── Générer message WhatsApp de demande de paiement ─────────────────
function genererMessagePaiement(commande, lienPaiement) {
  return (
    `💳 *Paiement de votre livraison*\n\n` +
    `📋 Commande : *${commande.numero}*\n` +
    `💰 Montant : *${commande.prix_total?.toLocaleString("fr-FR")} F CFA*\n\n` +
    `Cliquez sur ce lien pour payer avec :\n` +
    `📱 MTN Mobile Money\n` +
    `📱 Moov Money\n\n` +
    `👉 ${lienPaiement}\n\n` +
    `_Le lien est valable 30 minutes._\n` +
    `_Paiement 100% sécurisé via CinetPay._`
  );
}

module.exports = {
  initierPaiementCinetpay,
  verifierPaiement,
  traiterCallbackPaiement,
  payerLivreur,
  genererMessagePaiement,
};
