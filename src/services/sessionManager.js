/**
 * sessionManager.js
 * Gère les sessions des utilisateurs WhatsApp (état de la conversation)
 * TTL: 30 minutes d'inactivité → session réinitialisée
 */

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 1800, checkperiod: 300 });

const DEFAULT_SESSION = () => ({
  step: "menu",
  order: {},
  history: [], // historique pour l'IA
  createdAt: Date.now(),
});

const sessionManager = {
  /**
   * Récupère ou crée la session d'un utilisateur
   * @param {string} phone - Numéro WhatsApp (ex: whatsapp:+22997xxxxxx)
   */
  get(phone) {
    let session = cache.get(phone);
    if (!session) {
      session = DEFAULT_SESSION();
      cache.set(phone, session);
    }
    return session;
  },

  /**
   * Met à jour la session
   */
  update(phone, updates) {
    const session = this.get(phone);
    const updated = { ...session, ...updates };
    cache.set(phone, updated);
    return updated;
  },

  /**
   * Réinitialise la session
   */
  reset(phone) {
    const fresh = DEFAULT_SESSION();
    cache.set(phone, fresh);
    return fresh;
  },

  /**
   * Ajoute un message à l'historique (pour Claude AI)
   */
  addToHistory(phone, role, content) {
    const session = this.get(phone);
    session.history.push({ role, content });
    // Limiter l'historique à 10 messages pour éviter les gros contextes
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }
    cache.set(phone, session);
  },

  /**
   * Nombre d'utilisateurs actifs
   */
  activeCount() {
    return cache.keys().length;
  },
};

module.exports = sessionManager;
