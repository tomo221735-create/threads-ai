import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url =
      "https://news.google.com/rss/search?q=徳島&hl=ja&gl=JP&ceid=JP:ja";

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("ニュース取得に失敗しました");
    }

    const xml = await response.text();

    // RSSからタイトルを簡単に抽出
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 10)
      .map((match) => {
        const item = match[1];

        const title =
          item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";

        const link =
          item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";

        return {
          title: title.replace(/<!\[CDATA\[|\]\]>/g, ""),
          link,
        };
      });

    return NextResponse.json({
      items,
    });
  } catch (error) {
    console.error("ニュース取得エラー:", error);

    return NextResponse.json(
      {
        error: "ニュースの取得に失敗しました。",
      },
      {
        status: 500,
      }
    );
  }
}