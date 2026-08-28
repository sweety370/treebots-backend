export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        name: "TreeBots API",
        status: "online",
        version: "1.0.0"
      });
    }

    if (url.pathname === "/api/status") {
      return Response.json({
        status: "online",
        service: "TreeBots Backend"
      });
    }

    if (url.pathname === "/api/bots") {
      return Response.json({
        bots: []
      });
    }

    return Response.json(
      {
        error: "Not Found"
      },
      {
        status: 404
      }
    );
  }
};
