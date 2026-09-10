export type NewsItem = {
  title: string;
  link: string;
  publishedAt: string | null;
};

// RSSからニュースを取得する関数
// windowDays: Googleニュースの検索を直近何日以内の記事に絞るか（未指定時は絞らない）
export async function getNews(
  query: string,
  limit = 8,
  windowDays?: number
): Promise<NewsItem[]> {
  const searchQuery =
    windowDays != null ? `${query} when:${windowDays}d` : query;

  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}` +
    `&hl=ja&gl=JP&ceid=JP:ja`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const xml = await response.text();

  const cutoff =
    windowDays != null
      ? Date.now() - windowDays * 24 * 60 * 60 * 1000
      : null;

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => {
      const item = match[1];

      const title =
        item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";

      const link =
        item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";

      const pubDateStr =
        item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";

      const pubDate = pubDateStr ? new Date(pubDateStr) : null;

      return {
        title: title.replace(/<!\[CDATA\[|\]\]>/g, ""),
        link,
        pubDate,
      };
    })
    // Googleニュースの when: 演算子だけでは古い記事（常設イベント案内など）が
    // 紛れ込むことがあるため、pubDate でも二重にフィルタする
    .filter((item) => {
      if (!cutoff) return true;
      if (!item.pubDate || Number.isNaN(item.pubDate.getTime())) return false;
      return item.pubDate.getTime() >= cutoff;
    })
    // 新しい記事を優先
    .sort((a, b) => {
      const at = a.pubDate?.getTime() ?? 0;
      const bt = b.pubDate?.getTime() ?? 0;
      return bt - at;
    })
    .slice(0, limit)
    .map(({ title, link, pubDate }) => ({
      title,
      link,
      publishedAt: pubDate ? pubDate.toISOString().slice(0, 10) : null,
    }));

  return items;
}