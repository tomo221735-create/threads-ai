// Threads連携を開始するための共通ヘルパー。
//
// 以前は `window.location.href = "/api/threads/login?..."` として
// サーバー側の302リダイレクトに任せていたが、モバイル（特にAndroid）だと
// threads.com への遷移がOSレベルでThreadsアプリに横取りされてしまい、
// 連携が完了しないまま終わってしまうことがある。
//
// Meta公式ドキュメントでも、モバイルではこの横取りを避けるために
// 認可画面のURLを window.open(url, "_system") で開くことが推奨されている。
// https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions
//
// そのため、認可URLの組み立てはサーバー側のAPI（/api/threads/login）に任せつつ、
// レスポンスはリダイレクトではなくJSONで返してもらい、フロント側で
// window.open(..., "_system") を使って遷移するようにしている。
export async function connectThreads(userId: string): Promise<void> {
  const response = await fetch(
    `/api/threads/login?userId=${encodeURIComponent(userId)}`
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.authUrl) {
    throw new Error(
      data?.error || "Threads連携用のURLを取得できませんでした。"
    );
  }

  window.open(data.authUrl, "_system");
}