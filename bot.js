const express = require("express");
const mineflayer = require("mineflayer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const bots = new Map();

app.get("/", (req, res) => {
  res.json({
    name: "TreeBots Runtime",
    status: "online"
  });
});

app.post("/start", (req, res) => {
  const {
    id,
    username,
    host,
    port,
    version
  } = req.body;

  if (!id || !username || !host) {
    return res.status(400).json({
      error: "id, username and host are required"
    });
  }

  if (bots.has(id)) {
    return res.json({
      success: true,
      status: "already_online"
    });
  }

  const bot = mineflayer.createBot({
    host,
    port: Number(port) || 25565,
    username,
    version: version || false
  });

  bots.set(id, bot);

  bot.on("login", () => {
    console.log(`[${id}] Bot connected`);
  });

  bot.on("spawn", () => {
    console.log(`[${id}] Bot spawned`);
  });

  bot.on("end", () => {
    console.log(`[${id}] Bot disconnected`);
    bots.delete(id);
  });

  bot.on("error", error => {
    console.error(`[${id}]`, error.message);
  });

  res.json({
    success: true,
    status: "starting"
  });
});

app.post("/stop", (req, res) => {
  const { id } = req.body;

  const bot = bots.get(id);

  if (!bot) {
    return res.json({
      success: true,
      status: "offline"
    });
  }

  bot.quit("Stopped by TreeBots");

  bots.delete(id);

  res.json({
    success: true,
    status: "offline"
  });
});

app.get("/status/:id", (req, res) => {
  const bot = bots.get(req.params.id);

  if (!bot) {
    return res.json({
      status: "offline"
    });
  }

  res.json({
    status: bot.player
      ? "online"
      : "starting"
  });
});

app.get("/bots", (req, res) => {
  res.json(
    [...bots.entries()].map(([id, bot]) => ({
      id,
      username: bot.username,
      status: bot.player ? "online" : "starting"
    }))
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `TreeBots Runtime running on port ${PORT}`
  );
});
