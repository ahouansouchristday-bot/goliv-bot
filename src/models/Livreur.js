const mongoose = require("mongoose");

const livreurSchema = new mongoose.Schema(
  {
    nom:      { type: String, required: true, trim: true, uppercase: true },
    prenom:   { type: String, required: true, trim: true },
    telephone:{ type: String, required: true, unique: true },
    whatsapp: { type: String, required: true, unique: true },
    vehicule: { type: String, required: true, enum: ["🛵 Moto","🚲 Vélo","🚗 Voiture","🛺 Tricycle"] },
    permis:   { type: String, default: "AUCUN" },
    photo_cni_recto:  { type: String },
    photo_cni_verso:  { type: String },
    photo_vehicule:   { type: String },
    zone:             { type: String, required: true },
    disponibilite:    { type: String, required: true },
    mobile_money:     { type: String, required: true },
    statut: {
      type: String,
      enum: ["en_attente_validation","actif","suspendu","refuse"],
      default: "en_attente_validation",
    },
    note:                 { type: Number, default: 0, min: 0, max: 5 },
    nombre_notes:         { type: Number, default: 0 },
    courses_effectuees:   { type: Number, default: 0 },
    revenus_total:        { type: Number, default: 0 },
    disponible_maintenant:{ type: Boolean, default: false },

    // ── Géolocalisation ──────────────────────────────────────────────
    derniere_position: {
      lat:       { type: Number, default: null },
      lon:       { type: Number, default: null },
      updatedAt: { type: Date,   default: null },
    },
  },
  { timestamps: true }
);

livreurSchema.index({ zone: 1, statut: 1, disponible_maintenant: 1 });
livreurSchema.index({ whatsapp: 1 });
livreurSchema.index({ "derniere_position.lat": 1, "derniere_position.lon": 1 });

livreurSchema.virtual("nom_complet").get(function () {
  return `${this.prenom} ${this.nom}`;
});

module.exports = mongoose.model("Livreur", livreurSchema);
