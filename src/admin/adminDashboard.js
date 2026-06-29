/**
 * adminDashboard.js
 * Tableau de bord web pour l'administrateur GoLiv
 * Accessible sur : http://votre-url/admin
 * 
 * Fonctionnalités :
 * - Voir toutes les commandes en temps réel
 * - Valider les livreurs en attente
 * - Statistiques GoLiv (revenus, courses, clients)
 */

const express = require("express");
const router  = express.Router();
const db      = require("../services/dbService");
const Livreur = require("../models/Livreur");
const Commande = require("../models/Commande");

// ─── Middleware de protection basique ─────────────────────────────────
function protegerAdmin(req, res, next) {
  const mdp = req.query.key || req.headers["x-admin-key"];
  if (mdp !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).send(`
      <html><body style="font-family:sans-serif;max-width:400px;margin:100px auto;text-align:center">
        <h2>🔒 Accès réservé</h2>
        <p>Ajoutez <code>?key=VOTRE_CLE</code> à l'URL</p>
      </body></html>
    `);
  }
  next();
}

// ─── Page principale du dashboard ─────────────────────────────────────
router.get("/", protegerAdmin, async (req, res) => {
  const stats    = await db.statsAdmin() || {};
  const commandes = await Commande.find().sort({ createdAt: -1 }).limit(30);
  const livreurs_attente = await db.livreursEnAttente();

  const badgeStatut = (s) => {
    const map = {
      en_attente:       "background:#FEF3C7;color:#92400E",
      livreur_assigne:  "background:#DBEAFE;color:#1E40AF",
      en_cours:         "background:#D1FAE5;color:#065F46",
      livre:            "background:#D1FAE5;color:#065F46",
      annule:           "background:#FEE2E2;color:#991B1B",
      litige:           "background:#FEE2E2;color:#991B1B",
    };
    return map[s] || "background:#F3F4F6;color:#374151";
  };

  const badgeLivreur = (s) => {
    const map = {
      en_attente_validation: "background:#FEF3C7;color:#92400E",
      actif:    "background:#D1FAE5;color:#065F46",
      suspendu: "background:#FEE2E2;color:#991B1B",
      refuse:   "background:#FEE2E2;color:#991B1B",
    };
    return map[s] || "";
  };

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>GoLiv Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F9FAFB;color:#111}
    .header{background:#1D9E75;color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
    .header h1{font-size:20px;font-weight:600}
    .header small{opacity:.8;font-size:13px}
    .container{max-width:1100px;margin:0 auto;padding:24px 16px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}
    .stat{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:16px;text-align:center}
    .stat-val{font-size:28px;font-weight:700;color:#1D9E75;margin-bottom:4px}
    .stat-lbl{font-size:12px;color:#6B7280}
    .section{background:#fff;border:1px solid #E5E7EB;border-radius:12px;margin-bottom:20px;overflow:hidden}
    .section-head{padding:14px 18px;border-bottom:1px solid #E5E7EB;font-weight:600;font-size:15px;display:flex;align-items:center;justify-content:space-between}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:10px 16px;color:#6B7280;font-weight:500;border-bottom:1px solid #F3F4F6;background:#FAFAFA}
    td{padding:10px 16px;border-bottom:1px solid #F9FAFB;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500}
    .btn-val{background:#1D9E75;color:#fff;border:none;border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;text-decoration:none;display:inline-block}
    .btn-val:hover{background:#0F6E56}
    .btn-ref{background:#EF4444;color:#fff;border:none;border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;text-decoration:none;display:inline-block;margin-left:6px}
    .avatar{width:32px;height:32px;border-radius:50%;background:#E1F5EE;display:inline-flex;align-items:center;justify-content:center;font-weight:600;color:#085041;font-size:12px;margin-right:8px}
    .refresh{font-size:12px;color:#6B7280;cursor:pointer;text-decoration:none}
    .empty{text-align:center;padding:32px;color:#9CA3AF;font-size:14px}
    .photo-link{color:#1D9E75;font-size:12px;text-decoration:none}
    .photo-link:hover{text-decoration:underline}
    @media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}.container{padding:12px 8px}}
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>🛵 GoLiv Admin</h1>
    <small>Tableau de bord — ${new Date().toLocaleDateString("fr-FR", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</small>
  </div>
  <a href="?key=${process.env.ADMIN_SECRET_KEY}" class="refresh" style="color:#fff">↻ Actualiser</a>
</div>

<div class="container">

  <!-- Statistiques -->
  <div class="stats">
    <div class="stat"><div class="stat-val">${stats.total_commandes ?? 0}</div><div class="stat-lbl">Total commandes</div></div>
    <div class="stat"><div class="stat-val">${stats.commandes_aujourd_hui ?? 0}</div><div class="stat-lbl">Aujourd'hui</div></div>
    <div class="stat"><div class="stat-val">${stats.commandes_en_attente ?? 0}</div><div class="stat-lbl">En attente</div></div>
    <div class="stat"><div class="stat-val">${stats.livreurs_actifs ?? 0}</div><div class="stat-lbl">Livreurs actifs</div></div>
    <div class="stat"><div class="stat-val">${stats.livreurs_en_attente ?? 0}</div><div class="stat-lbl">À valider</div></div>
    <div class="stat"><div class="stat-val">${stats.total_clients ?? 0}</div><div class="stat-lbl">Clients</div></div>
    <div class="stat"><div class="stat-val">${(stats.revenus_goliv ?? 0).toLocaleString("fr-FR")}</div><div class="stat-lbl">Revenus GoLiv (F)</div></div>
  </div>

  <!-- Livreurs en attente de validation -->
  <div class="section">
    <div class="section-head">
      🟡 Livreurs en attente de validation
      <span style="background:#FEF3C7;color:#92400E;padding:2px 10px;border-radius:20px;font-size:12px">${livreurs_attente.length}</span>
    </div>
    ${livreurs_attente.length === 0
      ? `<div class="empty">Aucun livreur en attente ✅</div>`
      : `<table>
        <thead><tr>
          <th>Livreur</th><th>Zone</th><th>Véhicule</th><th>Disponibilité</th><th>Mobile Money</th><th>Documents</th><th>Actions</th>
        </tr></thead>
        <tbody>
        ${livreurs_attente.map(l => `
          <tr>
            <td>
              <div style="display:flex;align-items:center">
                <div class="avatar">${l.prenom[0]}${l.nom[0]}</div>
                <div>
                  <div style="font-weight:500">${l.prenom} ${l.nom}</div>
                  <div style="color:#6B7280;font-size:11px">${l.telephone}</div>
                </div>
              </div>
            </td>
            <td>${l.zone}</td>
            <td>${l.vehicule}</td>
            <td style="font-size:12px">${l.disponibilite}</td>
            <td style="font-size:12px">${l.mobile_money}</td>
            <td>
              ${l.photo_cni_recto ? `<a href="${l.photo_cni_recto}" target="_blank" class="photo-link">CNI R.</a>` : "❌"}
              ${l.photo_cni_verso ? `<a href="${l.photo_cni_verso}" target="_blank" class="photo-link"> CNI V.</a>` : "❌"}
              ${l.photo_vehicule  ? `<a href="${l.photo_vehicule}"  target="_blank" class="photo-link"> Véhic.</a>` : "❌"}
            </td>
            <td>
              <a class="btn-val" href="/admin/valider-livreur/${l._id}?key=${process.env.ADMIN_SECRET_KEY}">✅ Valider</a>
              <a class="btn-ref" href="/admin/refuser-livreur/${l._id}?key=${process.env.ADMIN_SECRET_KEY}">❌ Refuser</a>
            </td>
          </tr>
        `).join("")}
        </tbody>
      </table>`
    }
  </div>

  <!-- Dernières commandes -->
  <div class="section">
    <div class="section-head">
      📦 Dernières commandes
      <span style="font-size:12px;color:#6B7280">${commandes.length} affichées</span>
    </div>
    ${commandes.length === 0
      ? `<div class="empty">Aucune commande pour l'instant</div>`
      : `<table>
        <thead><tr>
          <th>Numéro</th><th>Départ → Destination</th><th>Colis</th><th>Service</th><th>Prix</th><th>Statut</th><th>Date</th>
        </tr></thead>
        <tbody>
        ${commandes.map(c => `
          <tr>
            <td style="font-family:monospace;font-size:12px">${c.numero}</td>
            <td style="font-size:12px">${c.depart}<br><span style="color:#6B7280">→ ${c.destination}</span></td>
            <td style="font-size:12px">${c.type_colis}</td>
            <td><span style="font-size:11px">${c.service === "urgent" ? "⚡ Urgent" : "🚚 Standard"}</span></td>
            <td style="font-weight:500">${c.prix_total?.toLocaleString("fr-FR")} F</td>
            <td><span class="badge" style="${badgeStatut(c.statut)}">${c.statut.replace(/_/g," ")}</span></td>
            <td style="font-size:11px;color:#6B7280">${new Date(c.createdAt).toLocaleDateString("fr-FR", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
          </tr>
        `).join("")}
        </tbody>
      </table>`
    }
  </div>

</div>
</body>
</html>`);
});

// ─── Action : valider un livreur ──────────────────────────────────────
router.get("/valider-livreur/:id", protegerAdmin, async (req, res) => {
  try {
    const livreur = await db.validerLivreur(req.params.id);
    if (!livreur) return res.redirect(`/admin?key=${process.env.ADMIN_SECRET_KEY}&msg=erreur`);

    // TODO: Envoyer message WhatsApp au livreur pour l'informer
    // await envoyerWhatsApp(livreur.whatsapp, `🎉 Félicitations ${livreur.prenom} ! Votre compte GoLiv est activé. Vous pouvez commencer à recevoir des missions !`);

    res.redirect(`/admin?key=${process.env.ADMIN_SECRET_KEY}&msg=valide`);
  } catch (err) {
    res.redirect(`/admin?key=${process.env.ADMIN_SECRET_KEY}&msg=erreur`);
  }
});

// ─── Action : refuser un livreur ──────────────────────────────────────
router.get("/refuser-livreur/:id", protegerAdmin, async (req, res) => {
  try {
    await Livreur.findByIdAndUpdate(req.params.id, { statut: "refuse" });
    res.redirect(`/admin?key=${process.env.ADMIN_SECRET_KEY}&msg=refuse`);
  } catch (err) {
    res.redirect(`/admin?key=${process.env.ADMIN_SECRET_KEY}&msg=erreur`);
  }
});

module.exports = router;
