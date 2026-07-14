// 야후 파이낸스(무료)로 종목 시세를 가져와요. API 키가 필요 없고 약 15분
// 지연 시세예요. 국내주식은 005930.KS/247540.KQ, 해외는 AAPL 처럼 넣어요.
// 서버에서만 호출하세요(클라이언트에서 부르면 CORS로 막혀요).

const QUOTE_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export type Quote = {
  ticker: string;
  price: number;
  currency: string;
  name: string | null;
};

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
}

async function fetchChartMeta(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `${QUOTE_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": USER_AGENT },
        // 시세는 자주 바뀌니 캐시하지 않아요.
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
    };

    return data.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
}

// 종목 하나의 현재가와 통화를 가져와요. 실패하면 null.
export async function fetchQuote(ticker: string): Promise<Quote | null> {
  const symbol = normalizeTicker(ticker);

  if (!symbol) {
    return null;
  }

  const meta = await fetchChartMeta(symbol);
  const price = Number(meta?.regularMarketPrice);

  if (!meta || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    ticker: symbol,
    price,
    currency: typeof meta.currency === "string" ? meta.currency : "KRW",
    name:
      (typeof meta.longName === "string" && meta.longName) ||
      (typeof meta.shortName === "string" && meta.shortName) ||
      null,
  };
}

// 통화 → 원화 환율. KRW면 1. 여러 종목을 갱신할 때 통화별로 한 번만 조회하도록
// 캐시 맵을 넘길 수 있어요.
export async function fetchFxRateToKrw(
  currency: string,
  cache?: Map<string, number>,
): Promise<number> {
  const code = currency.trim().toUpperCase();

  if (!code || code === "KRW") {
    return 1;
  }

  if (cache?.has(code)) {
    return cache.get(code) as number;
  }

  const meta = await fetchChartMeta(`${code}KRW=X`);
  const rate = Number(meta?.regularMarketPrice);
  const resolved = Number.isFinite(rate) && rate > 0 ? rate : 0;

  cache?.set(code, resolved);
  return resolved;
}

// 종목 시세와 보유수량으로 원화 평가액을 계산해요. 환율을 못 구하면 null.
export async function valuationInKrw(
  ticker: string,
  quantity: number,
  fxCache?: Map<string, number>,
): Promise<{ value: number; quote: Quote; fxRate: number } | null> {
  const quote = await fetchQuote(ticker);

  if (!quote) {
    return null;
  }

  const fxRate = await fetchFxRateToKrw(quote.currency, fxCache);

  if (fxRate <= 0) {
    return null;
  }

  return {
    value: Math.round(quote.price * quantity * fxRate),
    quote,
    fxRate,
  };
}
