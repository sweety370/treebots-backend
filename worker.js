export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      // =========================
      // HOME
      // =========================
      if (url.pathname === "/" && request.method === "GET") {
        return json({
          name: "TreeBots API",
          status: "online",
          version: "3.0.0",
          database: "connected"
        }, headers);
      }

      // =========================
      // STATUS
      // =========================
      if (url.pathname === "/api/status" && request.method === "GET") {
        const users = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM users")
          .first();

        const bots = await env.DB
          .prepare("SELECT COUNT(*) AS count FROM bots")
          .first();

        return json({
          status: "online",
          service: "TreeBots Backend",
          database: "connected",
          users: users?.count || 0,
          bots: bots?.count || 0
        }, headers);
      }

      // =========================
      // REGISTER
      // =========================
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        const body = await request.json();

        const fullName = String(body.fullName || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const confirmPassword = String(body.confirmPassword || "");

        if (!fullName || !email || !password || !confirmPassword) {
          return json({
            error: "All fields are required"
          }, headers, 400);
        }

        if (password !== confirmPassword) {
          return json({
            error: "Passwords do not match"
          }, headers, 400);
        }

        if (password.length < 6) {
          return json({
            error: "Password must be at least 6 characters"
          }, headers, 400);
        }

        const existing = await env.DB
          .prepare("SELECT id FROM users WHERE email = ?")
          .bind(email)
          .first();

        if (existing) {
          return json({
            error: "Email already registered"
          }, headers, 409);
        }

        const id = crypto.randomUUID();

        const passwordHash = await hashPassword(password);

        const verificationCode =
          Math.floor(100000 + Math.random() * 900000).toString();

        const expiresAt =
          new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO users
            (
              id,
              full_name,
              email,
              password_hash,
              email_verified,
              verification_code,
              verification_expires_at,
              created_at
            )
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
          `)
          .bind(
            id,
            fullName,
            email,
            passwordHash,
            verificationCode,
            expiresAt,
            createdAt
          )
          .run();

        return json({
          success: true,
          message: "Account created",
          userId: id,
          email,
          verificationRequired: true,
          verificationCode
        }, headers, 201);
      }

      // =========================
      // VERIFY EMAIL
      // =========================
      if (url.pathname === "/api/auth/verify" && request.method === "POST") {
        const body = await request.json();

        const email = String(body.email || "")
          .trim()
          .toLowerCase();

        const code = String(body.code || "").trim();

        if (!email || !code) {
          return json({
            error: "Email and verification code are required"
          }, headers, 400);
        }

        const user = await env.DB
          .prepare(`
            SELECT *
            FROM users
            WHERE email = ?
          `)
          .bind(email)
          .first();

        if (!user) {
          return json({
            error: "Account not found"
          }, headers, 404);
        }

        if (user.email_verified === 1) {
          return json({
            success: true,
            message: "Email already verified"
          }, headers);
        }

        if (user.verification_code !== code) {
          return json({
            error: "Invalid verification code"
          }, headers, 400);
        }

        if (
          user.verification_expires_at &&
          new Date(user.verification_expires_at) < new Date()
        ) {
          return json({
            error: "Verification code expired"
          }, headers, 400);
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET
              email_verified = 1,
              verification_code = NULL,
              verification_expires_at = NULL
            WHERE id = ?
          `)
          .bind(user.id)
          .run();

        return json({
          success: true,
          message: "Email verified successfully"
        }, headers);
      }

      // =========================
      // LOGIN
      // =========================
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const body = await request.json();

        const email = String(body.email || "")
          .trim()
          .toLowerCase();

        const password = String(body.password || "");

        if (!email || !password) {
          return json({
            error: "Email and password are required"
          }, headers, 400);
        }

        const user = await env.DB
          .prepare(`
            SELECT *
            FROM users
            WHERE email = ?
          `)
          .bind(email)
          .first();

        if (!user) {
          return json({
            error: "Invalid email or password"
          }, headers, 401);
        }

        const validPassword = await verifyPassword(
          password,
          user.password_hash
        );

        if (!validPassword) {
          return json({
            error: "Invalid email or password"
          }, headers, 401);
        }

        if (user.email_verified !== 1) {
          return json({
            error: "Email not verified",
            verificationRequired: true
          }, headers, 403);
        }

        const sessionId = crypto.randomUUID();

        const expiresAt =
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            .toISOString();

        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO sessions
            (
              id,
              user_id,
              expires_at,
              created_at
            )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            sessionId,
            user.id,
            expiresAt,
            createdAt
          )
          .run();

        return json({
          success: true,
          token: sessionId,
          user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email
          }
        }, headers);
      }

      // =========================
      // CURRENT USER
      // =========================
      if (
        url.pathname === "/api/auth/me" &&
        request.method === "GET"
      ) {
        const user = await getUserFromRequest(
          request,
          env
        );

        if (!user) {
          return json({
            error: "Unauthorized"
          }, headers, 401);
        }

        return json({
          authenticated: true,
          user: {
            id: user.id,
            fullName: user.full_name,
            email: user.email
          }
        }, headers);
      }

      // =========================
      // LOGOUT
      // =========================
      if (
        url.pathname === "/api/auth/logout" &&
        request.method === "POST"
      ) {
        const token = getToken(request);

        if (token) {
          await env.DB
            .prepare("DELETE FROM sessions WHERE id = ?")
            .bind(token)
            .run();
        }

        return json({
          success: true
        }, headers);
      }

      // =========================
      // GET BOTS
      // =========================
      if (
        url.pathname === "/api/bots" &&
        request.method === "GET"
      ) {
        const user = await getUserFromRequest(
          request,
          env
        );

        if (!user) {
          return json({
            error: "Unauthorized"
          }, headers, 401);
        }

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
            WHERE user_id = ?
            ORDER BY created_at DESC
          `)
          .bind(user.id)
          .all();

        return json(
          result.results || [],
          headers
        );
      }

      // =========================
      // CREATE BOT
      // =========================
      if (
        url.pathname === "/api/bots" &&
        request.method === "POST"
      ) {
        const user = await getUserFromRequest(
          request,
          env
        );

        if (!user) {
          return json({
            error: "Unauthorized"
          }, headers, 401);
        }

        const body = await request.json();

        const name = String(
          body.name || "NewBot"
        ).trim();

        const username = String(
          body.username || name
        ).trim();

        const ip = String(
          body.ip || "play.example.net"
        ).trim();

        const port = String(
          body.port || "25565"
        ).trim();

        const version = String(
          body.version || "1.21.x"
        ).trim();

        if (!name) {
          return json({
            error: "Bot name is required"
          }, headers, 400);
        }

        const countResult = await env.DB
          .prepare(`
            SELECT COUNT(*) AS count
            FROM bots
            WHERE user_id = ?
          `)
          .bind(user.id)
          .first();

        if ((countResult?.count || 0) >= 3) {
          return json({
            error: "Bot limit reached",
            limit: 3
          }, headers, 400);
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await env.DB
          .prepare(`
            INSERT INTO bots
            (
              id,
              user_id,
              name,
              username,
              ip,
              port,
              version,
              status,
              uptime,
              ping,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id,
            user.id,
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

      // =========================
      // BOT STATUS
      // =========================
      const statusMatch = url.pathname.match(
        /^\/api\/bots\/([^/]+)\/status$/
      );

      if (
        statusMatch &&
        request.method === "POST"
      ) {
        const user = await getUserFromRequest(
          request,
          env
        );

        if (!user) {
          return json({
            error: "Unauthorized"
          }, headers, 401);
        }

        const id = statusMatch[1];

        const body = await request.json();

        const status =
          body.status === "online"
            ? "online"
            : "offline";

        const uptime =
          status === "online"
            ? "0m"
            : "—";

        const ping =
          status === "online"
            ? "45ms"
            : "—";

        const result = await env.DB
          .prepare(`
            UPDATE bots
            SET
              status = ?,
              uptime = ?,
              ping = ?
            WHERE id = ?
            AND user_id = ?
          `)
          .bind(
            status,
            uptime,
            ping,
            id,
            user.id
          )
          .run();

        if (
          !result.success ||
          result.meta.changes === 0
        ) {
          return json({
            error: "Bot not found"
          }, headers, 404);
        }

        return json({
          success: true,
          id,
          status,
          uptime,
          ping
        }, headers);
      }

      // =========================
      // DELETE BOT
      // =========================
      const deleteMatch = url.pathname.match(
        /^\/api\/bots\/([^/]+)$/
      );

      if (
        deleteMatch &&
        request.method === "DELETE"
      ) {
        const user = await getUserFromRequest(
          request,
          env
        );

        if (!user) {
          return json({
            error: "Unauthorized"
          }, headers, 401);
        }

        const id = deleteMatch[1];

        const result = await env.DB
          .prepare(`
            DELETE FROM bots
            WHERE id = ?
            AND user_id = ?
          `)
          .bind(id, user.id)
          .run();

        if (
          !result.success ||
          result.meta.changes === 0
        ) {
          return json({
            error: "Bot not found"
          }, headers, 404);
        }

        return json({
          success: true
        }, headers);
      }

      // =========================
      // 404
      // =========================
      return json({
        error: "Not Found",
        path: url.pathname
      }, headers, 404);

    } catch (error) {
      return json({
        error: "Internal Server Error",
        message: error.message
      }, headers, 500);
    }
  }
};


// ======================================
// HELPERS
// ======================================

function json(data, headers, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}


// ======================================
// PASSWORD HASH
// ======================================

async function hashPassword(password) {
  const encoder = new TextEncoder();

  const data = encoder.encode(password);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}


async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password);

  return passwordHash === hash;
}


// ======================================
// AUTH
// ======================================

function getToken(request) {
  const authorization =
    request.headers.get("Authorization");

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization.slice(7).trim();
  }

  return null;
}


async function getUserFromRequest(request, env) {
  const token = getToken(request);

  if (!token) {
    return null;
  }

  const session = await env.DB
    .prepare(`
      SELECT
        users.*
      FROM sessions
      JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.id = ?
      AND sessions.expires_at > ?
    `)
    .bind(
      token,
      new Date().toISOString()
    )
    .first();

  return session || null;
}
