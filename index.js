const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "sylvester_verify";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.send(challenge);
  }

  console.log("❌ Webhook verify failed");
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  // Always respond to Meta immediately
  res.sendStatus(200);

  try {
    const entry = req.body.entry && req.body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value = changes && changes.value;
    const message = value && value.messages && value.messages[0];

    if (!message) {
      console.log("No message in webhook payload");
      return;
    }

    const from = message.from;
    const text = message.text && message.text.body;

    console.log("📩 Incoming from:", from, "text:", text);

    if (!text) {
      await sendWhatsAppText(from, "I only understand text messages for now 🙂");
      return;
    }

    // Call OpenAI
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = aiResponse.data.choices[0].message.content;

    await sendWhatsAppText(from, reply);
  } catch (error) {
    console.error("Error in webhook:", error.response?.data || error.message || error);
  }
});

// Helper to send text back to WhatsApp
async function sendWhatsAppText(to, messageText) {
  try {
    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: to,
      text: { body: messageText }
    };

    const resp = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("📤 Sent message:", resp.data);
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));

