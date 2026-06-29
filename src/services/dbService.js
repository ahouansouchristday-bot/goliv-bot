/**
 * dbService.js
 * Toutes les opérations sur la base de données GoLiv
 * 
 * Ce fichier centralise les opérations : créer commande, trouver livreur,
 * mettre à jour statut, obtenir statistiques admin...
 */

const Commande  = require("../models/Commande");
const Livreur   = require("../models/Livreur");
const Client    = require("../models/Client");

// ─── COMMANDES ────────────────────────────────────────────────────────

/**
 * Créer une nouvelle commande
 */
async function creerCommande(data) {
  try {
    const commande = new Commande({
      numero:          data.numero,
      client_whatsapp: data.client_whatsapp,
      depart:          data.depart,
      destination:     data.destination,
      type_colis:      data.colis,
      service:         data.service,
      prix_total:      data.prix,
      historique_statuts: [{ statut: "en_attente", note: "Commande créée" }],
    });
    await commande.save();

    // Mettre à jour ou créer le client
    await Client.findOneAndUpdate(
      { whatsapp: data.client_whatsapp },
      {
        $inc:  { nombre_commandes: 1, total_depense: data.prix },
        $set:  { derniere_commande: new Date() },
        $setOnInsert: { whatsapp: data.client_whatsapp },
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Commande ${data.numero} sauvegardée en BDD`);
    return commande;
  } catch (err) {
    console.error("❌ Erreur création commande:", err.message);
    return null;
  }
}

/**
 * Trouver une commande par son numéro
 */
async function trouverCommande(numero) {
  try {
    return await Commande.findOne({ numero }).populate("livreur_id");
  } catch (err) {
    console.error("❌ Erreur recherche commande:", err.message);
    return null;
  }
}

/**
 * Mettre à jour le statut d'une commande
 */
async function majStatutCommande(numero, statut, note = "") {
  try {
    return await Commande.findOneAndUpdate(
      { numero },
      {
        $set:  { statut },
        $push: { historique_statuts: { statut, note, date: new Date() } },
      },
      { new: true }
    );
  } catch (err) {
    console.error("❌ Erreur maj statut:", err.message);
    return null;
  }
}

/**
 * Obtenir les commandes en attente (pour dashboard admin)
 */
async function commandesEnAttente() {
  try {
    return await Commande.find({ statut: "en_attente" })
      .sort({ createdAt: -1 })
      .limit(20);
  } catch (err) {
    console.error("❌ Erreur commandes en attente:", err.message);
    return [];
  }
}

// ─── LIVREURS ─────────────────────────────────────────────────────────

/**
 * Sauvegarder un nouveau livreur après inscription
 */
async function sauvegarderLivreur(data) {
  try {
    // Vérifier si le livreur existe déjà
    const existant = await Livreur.findOne({ whatsapp: data.whatsapp });
    if (existant) {
      console.log(`⚠️  Livreur ${data.whatsapp} déjà inscrit`);
      return existant;
    }

    const livreur = new Livreur({
      nom:              data.nom,
      prenom:           data.prenom,
      telephone:        data.telephone,
      whatsapp:         data.whatsapp,
      vehicule:         data.vehicule,
      permis:           data.permis,
      zone:             data.zone,
      disponibilite:    data.disponibilite,
      mobile_money:     data.mobile_money,
      photo_cni_recto:  data.photo_cni_recto,
      photo_cni_verso:  data.photo_cni_verso,
      photo_vehicule:   data.photo_vehicule,
      statut:           "en_attente_validation",
    });

    await livreur.save();
    console.log(`✅ Livreur ${data.prenom} ${data.nom} sauvegardé en BDD`);
    return livreur;
  } catch (err) {
    console.error("❌ Erreur sauvegarde livreur:", err.message);
    return null;
  }
}

/**
 * Trouver les livreurs disponibles dans une zone
 */
async function trouverLivreursDisponibles(zone) {
  try {
    return await Livreur.find({
      statut:                "actif",
      disponible_maintenant: true,
      zone:                  { $regex: zone.split(" ")[0], $options: "i" },
    }).limit(5);
  } catch (err) {
    console.error("❌ Erreur recherche livreurs:", err.message);
    return [];
  }
}

/**
 * Valider un livreur (action admin)
 */
async function validerLivreur(livreurId) {
  try {
    return await Livreur.findByIdAndUpdate(
      livreurId,
      { statut: "actif", disponible_maintenant: true },
      { new: true }
    );
  } catch (err) {
    console.error("❌ Erreur validation livreur:", err.message);
    return null;
  }
}

/**
 * Obtenir tous les livreurs en attente de validation
 */
async function livreursEnAttente() {
  try {
    return await Livreur.find({ statut: "en_attente_validation" })
      .sort({ createdAt: -1 });
  } catch (err) {
    console.error("❌ Erreur livreurs en attente:", err.message);
    return [];
  }
}

// ─── STATISTIQUES ADMIN ───────────────────────────────────────────────

/**
 * Tableau de bord : chiffres clés GoLiv
 */
async function statsAdmin() {
  try {
    const [
      total_commandes,
      commandes_aujourd_hui,
      commandes_en_attente,
      livreurs_actifs,
      livreurs_en_attente,
      total_clients,
      revenus_result,
    ] = await Promise.all([
      Commande.countDocuments(),
      Commande.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Commande.countDocuments({ statut: "en_attente" }),
      Livreur.countDocuments({ statut: "actif" }),
      Livreur.countDocuments({ statut: "en_attente_validation" }),
      Client.countDocuments(),
      Commande.aggregate([
        { $match: { statut: "livre" } },
        { $group: { _id: null, total: { $sum: "$commission_goliv" } } },
      ]),
    ]);

    const revenus_goliv = revenus_result[0]?.total || 0;

    return {
      total_commandes,
      commandes_aujourd_hui,
      commandes_en_attente,
      livreurs_actifs,
      livreurs_en_attente,
      total_clients,
      revenus_goliv,
    };
  } catch (err) {
    console.error("❌ Erreur stats admin:", err.message);
    return null;
  }
}

module.exports = {
  creerCommande,
  trouverCommande,
  majStatutCommande,
  commandesEnAttente,
  sauvegarderLivreur,
  trouverLivreursDisponibles,
  validerLivreur,
  livreursEnAttente,
  statsAdmin,
};
