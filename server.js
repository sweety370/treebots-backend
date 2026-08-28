const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let bots = [];

app.get("/", (req, res) => {
  res.json({
    name: "TreeBots API",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    service: "TreeBots Backend"
  });
});

app.get("/api/bots", (req, res) => {
  res.json(bots);
});

app.post("/api/bots", (req, res) => {
  const bot = {
    id: Date.now().toString(),
    name: req.body.name || "Unnamed Bot",
    status: "offline",
    createdAt: new Date().toISOString()
  };

  bots.push(bot);

  res.status(201).json(bot);
});

app.delete("/api/bots/:id", (req, res) => {
  const exists = bots.some(bot => bot.id === req.params.id);

  if (!exists) {
    return res.status(404).json({
      error: "Bot not found"
    });
  }

  bots = bots.filter(bot => bot.id !== req.params.id);

  res.json({
    success: true
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TreeBots API running on port ${PORT}`);
});
