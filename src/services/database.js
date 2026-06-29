/**
 * database.js
 * Connexion à MongoDB Atlas (base de données gratuite dans le cloud)
 * 
 * MongoDB Atlas = une base de données hébergée sur internet, gratuite jusqu'à 512 MB
 * Parfait pour démarrer GoLiv sans payer d'hébergement de base de données
 */


const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // DNS Google
const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("⚠️  MONGODB_URI non défini — les données ne seront pas sauvegardées !");
    return;
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = true;
    console.log("✅ MongoDB connecté avec succès");
  } catch (err) {
    console.error("❌ Erreur connexion MongoDB:", err.message);
    console.warn("⚠️  Le bot continue sans base de données (données en mémoire seulement)");
  }
}

function getStatus() {
  return isConnected ? "connecté" : "déconnecté";
}

module.exports = { connectDB, getStatus };
