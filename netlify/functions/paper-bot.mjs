
import { getStore } from "@netlify/blobs";

const store = getStore("paper-trading");

export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  try {
    if (request.method === "GET") {
      const data = await store.get("paper-state", {
        type: "json"
      });

      return Response.json(
        { ok: true, data: data || null },
        { headers }
      );
    }

    if (request.method === "POST") {
      const body = await request.json();

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
      ) {
        return Response.json(
          { ok: false, error: "Invalid data" },
          { status: 400, headers }
        );
      }

      const size = JSON.stringify(body).length;

      if (size > 100000) {
        return Response.json(
          { ok: false, error: "Data too large" },
          { status: 413, headers }
        );
      }

      await store.setJSON("paper-state", body);

      return Response.json(
        { ok: true, message: "Paper data saved" },
        { headers }
      );
    }

    return Response.json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers }
    );

  } catch (error) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 500, headers }
    );
  }
};
