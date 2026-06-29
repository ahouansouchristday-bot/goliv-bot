/**
 * claudeAI.js
 * Service d'intégration avec l'API Anthropic Claude
 * Utilisé pour répondre aux questions libres des clients GoLiv
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es l'assistant virtuel WhatsApp de GoLiv Bénin, une plateforme de livraison freelance basée au Bénin (modèle type Uber pour la livraison).

CONTEXTE GOLIV :
- 3 acteurs : Clients, Livreurs freelance, Administrateur GoLiv
- Le client demande → la plateforme organise → le livreur exécute
- Matching automatique : le système assigne le livreur le plus proche
- Les livreurs sont indépendants, payés par course (ex: 1800 F sur 2000 F)
- Commission GoLiv = 10% par course

TARIFS :
- Standard (1-2h) : 1000-1500 F CFA courte distance, 3000-4000 F longue distance
- Urgent (30-45 min) : 2000-2500 F CFA courte distance, 4500-5500 F longue distance
- Zones couvertes : Cotonou, Abomey-Calavi, Porto-Novo, Parakou

RÈGLES DE RÉPONSE :
- Réponds toujours en français, style WhatsApp (court, clair, amical)
- Maximum 4 lignes par réponse
- Utilise des emojis appropriés
- Si la question dépasse tes capacités, suggère d'appeler le +229 97 00 00 00
- Ne donne jamais d'informations fausses sur des commandes réelles
- Pour les litiges ou problèmes graves, transfère vers l'admin

Ne réponds qu'aux sujets liés à GoLiv, la livraison, les tarifs, ou le support client.`;

/**
 * Envoie une question à Claude et retourne la réponse
 * @param {string} userMessage - Message de l'utilisateur
 * @param {Array} history - Historique de la conversation [{role, content}]
 */
async function askClaude(userMessage, history = []) {
  try {
    const messages = [
      ...history,
      { role: "user", content: userMessage },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages,
    });

    return response.content[0]?.text || "Désolé, je n'ai pas pu traiter votre demande. Appelez le +229 97 00 00 00 🙏";
  } catch (error) {
    console.error("❌ Erreur Claude AI:", error.message);
    return "Service temporairement indisponible. Appelez-nous au 📞 +229 97 00 00 00";
  }
}

module.exports = { askClaude };
