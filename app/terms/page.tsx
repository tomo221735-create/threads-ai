export const metadata = {
  title: "利用規約 | Threads AI",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="mb-6 inline-block text-sm text-text-muted transition hover:text-accent-cyan"
        >
          ← トップへ戻る
        </a>

        <h1 className="text-3xl font-bold text-text-primary">利用規約</h1>

        <p className="mt-3 text-sm text-text-faint">
          最終更新日：[2026年09月14日]
        </p>

        <div className="mt-8 space-y-8 text-text-muted">
          <section>
            <p className="leading-relaxed">
              本利用規約（以下「本規約」といいます）は、[大道智之]（以下「当方」といいます）が提供する「Threads
              AI」（以下「本サービス」といいます）の利用条件を定めるものです。ユーザーは、本規約に同意の上、本サービスをご利用ください。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第1条（適用）
            </h2>
            <p className="leading-relaxed">
              本規約は、ユーザーと当方との間の本サービスの利用に関わる一切の関係に適用されます。ユーザーは、本サービスに登録した時点で、本規約に同意したものとみなします。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第2条（サービス内容）
            </h2>
            <p className="leading-relaxed">
              本サービスは、ユーザーのThreadsアカウントと連携し、次の機能を提供します。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>投稿データの取得・分析（パフォーマンス推移、おすすめ投稿時間帯等）</li>
              <li>AIによる投稿ネタ・文章案の生成</li>
              <li>Threadsへの投稿の自動化（予約投稿・自動投稿）</li>
              <li>その他、当方が本サービス上で提供する機能</li>
            </ul>
            <p className="mt-3 leading-relaxed">
              当方は、ユーザーへの事前の通知なく、本サービスの内容を変更・追加・廃止することがあります。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第3条（アカウント登録）
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                ユーザーは、真実かつ正確な情報を用いてアカウント登録を行うものとします。
              </li>
              <li>
                ユーザーは、自己の責任においてアカウント情報（メールアドレス、パスワード等）を管理するものとし、第三者に利用させ、または貸与・譲渡してはなりません。
              </li>
              <li>
                アカウント情報の管理不十分、使用上の過誤等によって生じた損害の責任はユーザーが負うものとし、当方は一切の責任を負いません。
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第4条（Threadsアカウントとの連携）
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                ユーザーは、自己が正当な権限を有するThreadsアカウントのみを本サービスに連携するものとします。
              </li>
              <li>
                本サービスは、Meta社が提供するThreads
                APIを通じて情報の取得・投稿を行います。Threads側の仕様変更、障害、API提供の停止等により、本サービスの一部または全部が利用できなくなる場合がありますが、当方はこれによる損害について責任を負いません。
              </li>
              <li>
                ユーザーは、Threads側の利用規約についても遵守するものとします。
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第5条（料金・支払い）
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                本サービスには、無料プラン（FREE）および有料プラン（STARTER・PRO）が存在し、プランごとに利用できる機能・範囲が異なります。料金は本サービス上に表示する金額とします。
              </li>
              <li>
                有料プランの決済は、決済代行会社（Stripe, Inc.）を通じて行われ、契約期間に応じて自動的に更新（継続課金）されます。
              </li>
              <li>
                ユーザーは、本サービス上の手続きにより、いつでも有料プランを解約することができます。解約した場合でも、既にお支払いいただいた料金は、法令上返金が必要な場合を除き返金いたしません。
              </li>
              <li>
                当方は、事前の通知をもって料金プランの内容・金額を変更することがあります。
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第6条（禁止事項）
            </h2>
            <p className="leading-relaxed">
              ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
              <li>法令または公序良俗に違反する行為</li>
              <li>犯罪行為に関連する行為、またはそのおそれのある行為</li>
              <li>
                当方、Meta社、その他第三者の知的財産権、肖像権、プライバシー、名誉その他の権利・利益を侵害する行為
              </li>
              <li>本サービスのシステムに不正にアクセスし、または不正な操作を行う行為</li>
              <li>
                本サービスを通じて、スパム行為、虚偽情報の拡散、その他Threadsの利用規約に違反する投稿を行う行為
              </li>
              <li>本サービスの運営を妨害するおそれのある行為</li>
              <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
              <li>その他、当方が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第7条（AIが生成するコンテンツについて）
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                本サービスは、生成AIを利用して投稿ネタ・文章案・分析コメント等を生成しますが、その内容の正確性・完全性・有用性・法令適合性等について保証するものではありません。
              </li>
              <li>
                AIが生成した内容をもとに実際にThreadsへ投稿するか否かの最終判断は、ユーザーの責任において行うものとします。当方は、生成内容の利用によってユーザーまたは第三者に生じた損害について、責任を負いません。
              </li>
              <li>
                自動投稿機能を利用する場合も同様に、投稿内容および投稿の結果について、当方は責任を負いません。ユーザーは、自動投稿の設定内容を自己の責任で確認・管理するものとします。
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第8条（知的財産権）
            </h2>
            <p className="leading-relaxed">
              本サービスに関する著作権、商標権その他の知的財産権は、当方または正当な権利を有する第三者に帰属します。本サービスを通じて生成された投稿文言等の利用権はユーザーに帰属しますが、本サービス自体のプログラム、デザイン等の権利は当方に留保されます。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第9条（サービスの停止・変更・終了）
            </h2>
            <p className="leading-relaxed">
              当方は、システムの保守・点検、天災地変、外部サービス（Threads
              API等）の障害・仕様変更、その他やむを得ない事由がある場合、ユーザーへの事前の通知なく本サービスの全部または一部の提供を停止・変更・終了することがあります。これによりユーザーに生じた損害について、当方は責任を負いません。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第10条（免責事項）
            </h2>
            <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
              <li>
                当方は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定目的への適合性等）がないことを保証するものではありません。
              </li>
              <li>
                当方は、本サービスに起因してユーザーに生じたあらゆる損害について、当方の故意または重過失による場合を除き、責任を負いません。
              </li>
              <li>
                本サービスに関連してユーザーと第三者との間で生じたトラブル・紛争については、ユーザーの責任で解決するものとし、当方は一切の責任を負いません。
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第11条（規約の変更）
            </h2>
            <p className="leading-relaxed">
              当方は、必要と判断した場合、ユーザーへの事前の通知なく本規約を変更できるものとします。変更後の規約は、本サービス上に掲載された時点から効力を生じるものとし、変更後も本サービスの利用を継続した場合、ユーザーは変更後の規約に同意したものとみなします。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第12条（準拠法・合意管轄）
            </h2>
            <p className="leading-relaxed">
              本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、[管轄裁判所（例：東京地方裁判所）]を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-text-primary">
              第13条（お問い合わせ）
            </h2>
            <p className="leading-relaxed">
              本規約に関するお問い合わせは、以下の窓口までご連絡ください。
            </p>
            <p className="mt-3 leading-relaxed">
              運営者：[大道智之]
              <br />
              連絡先：[tomo.221735@icloud.com]
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}