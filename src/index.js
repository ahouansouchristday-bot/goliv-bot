require("dotenv").config();
const express    = require("express");
const bodyParser = require("body-parser");
const twilio     = require("twilio");
const { connectDB }     = require("./services/database");
const { handleMessage } = require("./handlers/conversationHandler");
const { traiterCallbackPaiement } = require("./services/payment");
const sessionManager    = require("./services/sessionManager");
const adminDashboard    = require("./admin/adminDashboard");

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use("/admin", adminDashboard);
app.post("/paiement/callback", traiterCallbackPaiement);
app.get("/paiement/retour", (req,res) => res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ Paiement reçu !</h2></body></html>`));

app.post("/webhook", async (req, res) => {
  const from      = req.body.From;
  const body      = req.body.Body?.trim() || "";
  const mediaUrl  = req.body.MediaUrl0  || null;
  const mediaType = req.body.MediaContentType0 || null;

  // ── Coordonnées GPS (si le client envoie sa localisation WhatsApp) ──
  const latitude  = req.body.Latitude  || null;
  const longitude = req.body.Longitude || null;

  if (!from) return res.status(200).send("<Response></Response>");

  console.log(`\n📨 [${from}] "${body}" gps=${!!(latitude&&longitude)} media=${!!mediaUrl}`);
  if (latitude) console.log(`   📍 GPS: lat=${latitude}, lon=${longitude}`);

  try {
    const reply = await handleMessage(from, body, mediaUrl, mediaType, latitude, longitude, body);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.type("text/xml").send(twiml.toString());
  } catch(err) {
    console.error("❌", err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Erreur. Appelez le "+process.env.GOLIV_SUPPORT_PHONE);
    res.type("text/xml").send(twiml.toString());
  }
});

app.get("/health", (req,res) => res.json({ status:"ok", version:"4.2.0", sessions:sessionManager.activeCount() }));
app.get("/", (req,res) => res.send(`<html><body style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:20px"><h2>🛵 GoLiv Bot v4.2 ✅</h2><p>Sessions : <strong>${sessionManager.activeCount()}</strong></p><hr/><p><a href="/admin?key=${process.env.ADMIN_SECRET_KEY}">📊 Dashboard Admin</a></p></body></html>`));

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log("\n🚀 GoLiv WhatsApp Bot v4.2 démarré");
    console.log("   Port    : " + PORT);
    console.log("   Support : " + process.env.GOLIV_SUPPORT_PHONE);
    console.log("\n✅ Prêt !\n");
  });
}
start();
module.exports = app;
