// index.js

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Config
const VERIFY_TOKEN = "sylvester_verify";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error("❌ Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID in environment variables");
}

if (!OPENAI_API_KEY) {
  console.warn("⚠️ No OPENAI_API_KEY set. Bot will always use fallback SIA message.");
}

// Webhook verification (GET)
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

// Webhook receiver (POST)
app.post("/webhook", async (req, res) => {
  // Always respond immediately to Meta
  res.sendStatus(200);

  try {
    const entry = req.body.entry && req.body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value = changes && changes.value;
    const message = value && value.messages && value.messages[0];

    if (!message) {
      console.log("No message object in webhook payload");
      return;
    }

    const from = message.from;
    const text = message.text && message.text.body;

    console.log("📩 Incoming from:", from, "text:", text);

    if (!text) {
      await sendWhatsAppText(
        from,
        "Hi, I’m SIA (Spectrum Intelligent Assistant). Please send me a text message so I can assist you."
      );
      return;
    }

    // Try to get AI reply from OpenAI, with SIA fallback on error / no credit
    let replyText;

    if (!OPENAI_API_KEY) {
      // No key configured at all
      replyText =
        "Hi, I’m SIA (Spectrum Intelligent Assistant). I don’t have enough credit to reply with my full AI brain right now, but your WhatsApp connection is working and I’ll respond properly soon.";
    } else {
      try {
        const aiResponse = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are SIA (Spectrum Intelligent Assistant), a helpful, polite banking and general assistant."
              },
              { role: "user", content: text }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        replyText = aiResponse.data.choices[0].message.content;
      } catch (error) {
        console.error(
          "❌ OpenAI error:",
          error.response?.data || error.message || error
        );

        // Fallback SIA message on quota / any OpenAI failure
        replyText =
          "Hi, I’m SIA (Spectrum Intelligent Assistant). I don’t have enough credit to reply with my full AI brain right now, but your WhatsApp connection is working and I’ll respond properly soon.";
      }
    }

    await sendWhatsAppText(from, replyText);
  } catch (error) {
    console.error("❌ Error in webhook handler:", error.message || error);
  }
});

// Helper: send message to WhatsApp user
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
    console.error(
      "❌ WhatsApp send error:",
      err.response?.data || err.message || err
    );
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 SIA server running on port", PORT));

