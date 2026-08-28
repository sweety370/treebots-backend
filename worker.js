export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      // Home
      if (url.pathname === "/" && request.method === "GET") {
        return json({
          name: "TreeBots API",
          status: "online",
          version: "2.0.0",
          database: "connected"
        }, headers);
      }

      // API status
      if (url.pathname === "/api/status" && request.method === "GET") {
        const result = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM bots")
          .first();

        return json({
          status: "online",
          service: "TreeBots Backend",
          database: "connected",
          users: 0,
          bots: result?.count || 0
        }, headers);
      }

      // Get bots
      if (url.pathname === "/api/bots" && request.method === "GET") {
        const result = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              username,
              ip,
              port,
              version,
              status,
              uptime,
              ping,
              created_at AS createdAt
            FROM bots
            ORDER BY created_at DESC
          `)
          .all();

        return json(result.results || [], headers);
      }

      // Create bot
      if (url.pathname === "/api/bots" && request.method === "POST") {
        const body = await request.json();

        const name = String(body.name || "NewBot").trim();
        const username = String(body.username || name).trim();
        const ip = String(body.ip || "play.example.net").trim();
        const port = String(body.port || "25565").trim();
        const version = String(body.version || "1.21.x").trim();

        if (!name) {
          return json(
            { error: "Bot name is required" },
            headers,
            400
          );
        }

        const countResult = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM bots")
          .first();

        if ((countResult?.count || 0) >= 3) {
          return json(
            {
              error: "Bot limit reached",
              limit: 3
            },
            headers,
            400
          );
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO bots
            (id, name, username, ip, port, version, status, uptime, ping, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id,
            name,
            username,
            ip,
            port,
            version,
            "offline",
            "—",
            "—",
            createdAt
          )
          .run();

        return json({
          id,
          name,
          username,
          ip,
          port,
          version,
          status: "offline",
          uptime: "—",
          ping: "—",
          createdAt
        }, headers, 201);
      }

      // Start / stop bot
      const statusMatch = url.pathname.match(
        /^\/api\/bots\/([^/]+)\/status$/
      );

      if (statusMatch && request.method === "POST") {
        const id = statusMatch[1];
        const body = await request.json();

        const status =
          body.status === "online"
            ? "online"
            : "offline";

        const uptime = status === "online" ? "0m" : "—";
        const ping = status === "online" ? "45ms" : "—";

        const result = await env.DB
          .prepare(`
            UPDATE bots
            SET status = ?, uptime = ?, ping = ?
            WHERE id = ?
          `)
          .bind(status, uptime, ping, id)
          .run();

        if (!result.success || result.meta.changes === 0) {
          return json(
            { error: "Bot not found" },
            headers,
            404
          );
        }

        return json({
          success: true,
          id,
          status,
          uptime,
          ping
        }, headers);
      }

      // Delete bot
      const deleteMatch = url.pathname.match(
        /^\/api\/bots\/([^/]+)$/
      );

      if (deleteMatch && request.method === "DELETE") {
        const id = deleteMatch[1];

        const result = await env.DB
          .prepare("DELETE FROM bots WHERE id = ?")
          .bind(id)
          .run();

        if (!result.success || result.meta.changes === 0) {
          return json(
            { error: "Bot not found" },
            headers,
            404
          );
        }

        return json({
          success: true
        }, headers);
      }

      return json(
        {
          error: "Not Found",
          path: url.pathname
        },
        headers,
        404
      );

    } catch (error) {
      return json(
        {
          error: "Internal Server Error",
          message: error.message
        },
        headers,
        500
      );
    }
  }
};

function json(data, headers, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}
