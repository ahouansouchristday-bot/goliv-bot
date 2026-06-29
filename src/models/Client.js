/**
 * Client.js — Modèle de données pour les clients GoLiv
 * 
 * Créé automatiquement à la première commande d'un client.
 * Permet de suivre l'historique et fidéliser les clients.
 */

const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    whatsapp: {
      type: String,
      required: true,
      unique: true,
    },
    nom: {
      type: String,
      default: null,
    },
    telephone: {
      type: String,
      default: null,
    },

    // ── Statistiques ──────────────────────────────────────────────────
    nombre_commandes: {
      type: Number,
      default: 0,
    },
    total_depense: {
      type: Number,
      default: 0, // F CFA
    },
    derniere_commande: {
      type: Date,
      default: null,
    },

    // ── Fidélité ──────────────────────────────────────────────────────
    est_client_fidele: {
      type: Boolean,
      default: false, // true si plus de 5 commandes
    },
    adresses_favorites: [
      {
        nom: String,    // Ex: "Maison", "Bureau"
        adresse: String,
      },
    ],

    // ── Statut ────────────────────────────────────────────────────────
    actif: {
      type: Boolean,
      default: true,
    },
    bloque: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Méthode : mettre à jour après commande ─────────────────────────────
clientSchema.methods.apresCommande = async function (montant) {
  this.nombre_commandes += 1;
  this.total_depense    += montant;
  this.derniere_commande = new Date();
  this.est_client_fidele = this.nombre_commandes >= 5;
  await this.save();
};

const Client = mongoose.model("Client", clientSchema);
module.exports = Client;
