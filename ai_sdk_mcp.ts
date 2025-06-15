import { experimental_createMCPClient, generateText } from "npm:ai";
import { Experimental_StdioMCPTransport } from "npm:ai/mcp-stdio";
import { createOpenAI } from "npm:@ai-sdk/openai";

// GitHub Models経由でOpenAI GPT-4.1を使用
const model = createOpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: Deno.env.get("GITHUB_TOKEN") || "dummy-key-for-github-models",
}).chat("openai/gpt-4.1");

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

    // AI処理の実行
    const response = await generateText({
      model,
      tools,
      maxSteps: 10,
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
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    // リソースのクリーンアップ
    await client?.close();
  }
}

// スクリプトがメインで実行された場合にmainを呼び出し
if (import.meta.main) {
  main().catch(console.error);
}
