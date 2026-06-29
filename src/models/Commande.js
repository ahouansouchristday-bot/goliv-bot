/**
 * Commande.js — Modèle de données pour les commandes GoLiv
 * 
 * Chaque livraison passée par un client est sauvegardée ici.
 * Permet le suivi en temps réel et les statistiques admin.
 */

const mongoose = require("mongoose");

const commandeSchema = new mongoose.Schema(
  {
    // ── Numéro unique ─────────────────────────────────────────────────
    numero: {
      type: String,
      required: true,
      unique: true,
      // Format: GLV-20240115-1234
    },

    // ── Client ────────────────────────────────────────────────────────
    client_whatsapp: {
      type: String,
      required: true,
    },
    client_nom: {
      type: String,
      default: "Client anonyme",
    },

    // ── Détails livraison ─────────────────────────────────────────────
    depart: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    type_colis: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      enum: ["standard", "urgent"],
      default: "standard",
    },

    // ── Tarification ──────────────────────────────────────────────────
    prix_total: {
      type: Number,
      required: true, // En F CFA
    },
    commission_goliv: {
      type: Number, // 10% du prix total
    },
    revenu_livreur: {
      type: Number, // 90% du prix total
    },

    // ── Assignation livreur ───────────────────────────────────────────
    livreur_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Livreur",
      default: null,
    },
    livreur_whatsapp: {
      type: String,
      default: null,
    },

    // ── Suivi de statut ───────────────────────────────────────────────
    statut: {
      type: String,
      enum: [
        "en_attente",        // Commande créée, pas encore de livreur
        "livreur_assigne",   // Un livreur a accepté
        "en_cours",          // Livreur a récupéré le colis
        "livre",             // Livraison effectuée
        "annule",            // Commande annulée
        "litige",            // Problème signalé
      ],
      default: "en_attente",
    },

    // ── Historique des statuts ────────────────────────────────────────
    historique_statuts: [
      {
        statut: String,
        date: { type: Date, default: Date.now },
        note: String,
      },
    ],

    // ── Notation ──────────────────────────────────────────────────────
    note_client: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    commentaire_client: {
      type: String,
      default: null,
    },

    // ── Paiement ──────────────────────────────────────────────────────
    paiement_statut: {
      type: String,
      enum: ["en_attente", "paye", "rembourse"],
      default: "en_attente",
    },
    paiement_methode: {
      type: String,
      default: null, // "MTN MoMo", "Moov Money", "Espèces"
    },
  },
  {
    timestamps: true,
  }
);

// ── Index pour recherches rapides ──────────────────────────────────────
commandeSchema.index({ statut: 1, createdAt: -1 });
commandeSchema.index({ client_whatsapp: 1 });
commandeSchema.index({ livreur_id: 1 });
commandeSchema.index({ numero: 1 });

// ── Middleware : calculer automatiquement commission et revenu livreur ─
commandeSchema.pre("save", function (next) {
  if (this.prix_total) {
    this.commission_goliv = Math.round(this.prix_total * 0.10);
    this.revenu_livreur   = this.prix_total - this.commission_goliv;
  }
  next();
});

const Commande = mongoose.model("Commande", commandeSchema);
module.exports = Commande;
