import { experimental_createMCPClient, generateText } from "npm:ai";
import { Experimental_StdioMCPTransport } from "npm:ai/mcp-stdio";
import { createOpenAI } from "npm:@ai-sdk/openai";

// GitHub Models経由で各種モデルを使用
// openai/gpt-4.1: OK
// openai/gpt-4.1-mini: OK
// deepseek/deepseek-r1-0528: レートリミットが厳しいため実質使用不
// deepseek/deepseek-v3-0324: レートリミットが厳しいため実質使用不可
// meta/Llama-4-Maverick-17B-128E-Instruct-FP8: OK
// meta/llama-4-scout-17b-16e-instruct: 動作せず
// meta/llama-3.3-70b-instruct: 応答が返ってこない。あるいはtoolを正しく使えない
// meta/meta-llama-3.1-8b-instruct: toolを正しく使えない
// microsoft/phi-3-medium-128k-instruct: そもそもtoolを使えない
// microsoft/Phi-4: そもそもtoolを使えないっぽい？

// リトライ設定（maxRetriesのみ設定可能）
const MAX_RETRIES = parseInt(Deno.env.get("MAX_RETRIES") || "3");

const model = createOpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: Deno.env.get("GITHUB_TOKEN") || "dummy-key-for-github-models",
}).chat(Deno.args[1] || "openai/gpt-4.1");

async function main() {
  const userInput = Deno.args[0] ||
    "新しいプロジェクトでwebアプリ開発、テスト作成、デプロイのタスクを作成して管理してください";

  let client;

  try {
    // MCP clientの設定（stdio transport使用）
    const transport = new Experimental_StdioMCPTransport({
      command: "deno",
      args: ["run", "/home/kesin/github/kesin11/mcp_sandbox/todo_server.ts"],
    });

    client = await experimental_createMCPClient({
      transport,
    });

    // MCPサーバーからtoolsを取得
    const tools = await client.tools();

    // モデル情報
    console.log("=== 使用するモデル ===");
    console.log(`モデルID: ${model.modelId}`);

    // AI処理の実行
    // リトライ設定の詳細：
    // - maxRetries: レートリミットやネットワークエラー時の最大リトライ回数（環境変数で設定可能）
    // - AI SDKは内部で固定の指数バックオフを使用（初期待機時間: 2秒、係数: 2倍）
    const response = await generateText({
      model,
      tools,
      maxSteps: 10,
      maxRetries: MAX_RETRIES,
      messages: [
        {
          role: "system",
          content: `あなたはTODOタスク管理のエキスパートアシスタントです。
ユーザーからの要求に応じて、以下のツールを使用してタスクを管理してください：

1. create_session: 新しいセッションを作成し、初期タスクを設定
2. get_tasks: セッション内のタスク一覧を取得
3. update_task_status: タスクの状態を更新（完了/未完了）
4. get_next_pending_task: 次に実行すべき未完了タスクを取得

ユーザーの要求を理解し、適切な順序でツールを呼び出してタスクを管理し、
結果をわかりやすく日本語で説明してください。`,
        },
        {
          role: "user",
          content: userInput,
        },
      ],
    });

    console.log("=== AI Todo Manager の結果 ===");
    console.log(response.text);

    // 詳細なログを出力
    console.log("\n=== 詳細なやり取りログ ===");
    console.log(`総ステップ数: ${response.steps.length}`);
    console.log(`最終結果: ${response.finishReason}`);
    console.log(`トークン使用量: ${JSON.stringify(response.usage)}`);

    // 各ステップの詳細を出力
    response.steps.forEach((step, index) => {
      console.log(`\n--- ステップ ${index + 1} (${step.stepType}) ---`);

      if (step.text) {
        console.log(`テキスト応答: ${step.text}`);
      }

      if (step.toolCalls && step.toolCalls.length > 0) {
        console.log("ツール呼び出し:");
        step.toolCalls.forEach((call, callIndex) => {
          console.log(`  ${callIndex + 1}. ${call.toolName}`);
          console.log(`     引数: ${JSON.stringify(call.args, null, 2)}`);
        });
      }

      if (step.toolResults && step.toolResults.length > 0) {
        console.log("ツール実行結果:");
        step.toolResults.forEach((result, resultIndex) => {
          console.log(`  ${resultIndex + 1}. ${result.toolName}`);
          console.log(`     結果: ${JSON.stringify(result.result, null, 2)}`);
        });
      }

      if (step.usage) {
        console.log(`ステップ使用量: ${JSON.stringify(step.usage)}`);
      }
    });
  } catch (error) {
    console.error("エラーが発生しました:", error);

    // リトライエラーの詳細を表示
    if (error instanceof Error && error.name === "RetryError") {
      console.error("=== リトライエラーの詳細 ===");
      const retryError = error as Error & {
        reason?: string;
        errors?: unknown[];
      };
      console.error(`理由: ${retryError.reason || "不明"}`);
      console.error(`メッセージ: ${error.message}`);
      console.error(`試行回数: ${retryError.errors?.length || "不明"}`);

      if (retryError.errors) {
        console.error("エラー履歴:");
        retryError.errors.forEach((err: unknown, index: number) => {
          const errMessage = err instanceof Error ? err.message : String(err);
          console.error(`  ${index + 1}. ${errMessage}`);
        });
      }
    }

    // リトライエラーの場合
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      console.error(
        "\n💡 ヒント: レートリミットに達している可能性があります。",
      );
      console.error("以下の環境変数で設定を調整してください:");
      console.error(
        "- MAX_RETRIES: リトライ回数を増やす（現在: " + MAX_RETRIES + "）",
      );
      console.error(
        "注意: AI SDKの内部リトライ設定（初期待機2秒、係数2倍）は変更できません",
      );
      console.error("\n例: MAX_RETRIES=10 deno run --allow-all ai_sdk_mcp.ts");
    }
  } finally {
    // リソースのクリーンアップ
    await client?.close();
  }
}

// スクリプトがメインで実行された場合にmainを呼び出し
if (import.meta.main) {
  main().catch(console.error);
}
