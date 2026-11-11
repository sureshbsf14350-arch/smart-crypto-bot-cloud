
export default async (request) => {
  try {
    const url = new URL(request.url);

    const pair = url.searchParams.get("pair") || "B-BTC_USDT";

    const allowedPairs = [
      "B-BTC_USDT",
      "B-ETH_USDT",
      "B-SOL_USDT",
      "B-DOGE_USDT"
    ];

    if (!allowedPairs.includes(pair)) {
      return Response.json(
        { error: "Invalid trading pair" },
        { status: 400 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const to = Math.min(
      Number(url.searchParams.get("to")) || now,
      now
    );
    const from = Number(url.searchParams.get("from")) ||
      to - 60 * 60 * 24 * 90;

    if (
      !Number.isFinite(from) ||
      from >= to ||
      to - from > 60 * 60 * 24 * 90
    ) {
      return Response.json(
        { error: "Invalid date range" },
        { status: 400 }
      );
    }

    const apiUrl = new URL(
      "https://public.coindcx.com/market_data/candlesticks"
    );

    apiUrl.search = new URLSearchParams({
      pair,
      from: String(from),
      to: String(to),
      resolution: "60",
      pcode: "f"
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let response;

    try {
      response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return Response.json(
        { error: "CoinDCX market data unavailable" },
        { status: 502 }
      );
    }

    const result = await response.json();

    if (result.s !== "ok" || !Array.isArray(result.data)) {
      return Response.json(
        { error: "Invalid CoinDCX response" },
        { status: 502 }
      );
    }

    return Response.json(
      { s: "ok", data: result.data },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    return Response.json(
      { error: "Market data request failed" },
      { status: 502 }
    );
  }
};
