import { experimental_createMCPClient, generateText } from "npm:ai";
import { Experimental_StdioMCPTransport } from "npm:ai/mcp-stdio";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { createOllama } from "npm:ollama-ai-provider";
import { parseArgs } from "jsr:@std/cli/parse-args";

// プロバイダー設定の型定義
interface ProviderConfig {
  provider: "github" | "openrouter" | "ollama";
  baseURL: string;
  apiKey: string;
  model: string;
}

// コマンドライン引数の型定義
interface ParsedArgs {
  message: string;
  provider: "github" | "openrouter" | "ollama";
  token?: string;
  model: string;
  baseUrl?: string;
  help: boolean;
}

// ヘルプメッセージを表示
function showHelp(): void {
  console.log(`
AI SDK MCP クライアント - マルチプロバイダー対応TODOタスク管理システム

使用方法:
  deno run --allow-all ai_sdk_mcp.ts "メッセージ" --model "モデル名" [オプション]

必須パラメータ:
  メッセージ            AIに送信するメッセージ（位置引数）
  --model, -m          使用するモデル名（必須）

オプションパラメータ:
  --provider, -p       プロバイダー選択 (github|openrouter|ollama) [デフォルト: github]
  --token, -t          APIトークン（環境変数より優先）
  --baseUrl, -b        カスタムbaseURL（全プロバイダー対応）
  --help, -h           このヘルプを表示

環境変数:
  GITHUB_TOKEN         GitHub Modelsアクセス用トークン
  OPENROUTER_API_KEY   OpenRouterアクセス用トークン
  MAX_RETRIES          リトライ回数 [デフォルト: 3]

使用例:
  # GitHub Models（デフォルト）
  deno run --allow-all ai_sdk_mcp.ts "タスク作成してください" --model "openai/gpt-4.1"
  
  # GitHub Models、別のモデル
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --model "openai/gpt-4.1-mini"
  
  # OpenRouter使用
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider openrouter --model "openai/gpt-4"
  
  # OpenRouter、Claudeモデル
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider openrouter --model "anthropic/claude-3.5-sonnet"
  
  # Ollama使用（ローカル）
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider ollama --model "llama3.1"
  
  # Ollama、カスタムURL
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider ollama --model "phi3" --baseUrl "http://remote-ollama:11434"
  
  # GitHub Models、カスタムbaseURL
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider github --model "openai/gpt-4.1" --baseUrl "https://custom-github-models.example.com"
  
  # トークン明示指定
  deno run --allow-all ai_sdk_mcp.ts "タスク作成" --provider openrouter --model "openai/gpt-4" --token "sk-xxx"

対応モデルの例:
  GitHub Models:
    - openai/gpt-4.1 (推奨)
    - openai/gpt-4.1-mini
    - meta/llama-3.3-70b-instruct
    
  OpenRouter:
    - openai/gpt-4
    - anthropic/claude-3.5-sonnet
    - meta-llama/llama-3.1-70b
    - google/gemini-pro
    
  Ollama:
    - llama3.1
    - llama3.2
    - phi3
    - mistral
    - codellama
    - gemma
`);
}

// コマンドライン引数を解析
function parseCommandLineArgs(): ParsedArgs {
  const flags = parseArgs(Deno.args, {
    string: ["provider", "token", "model", "baseUrl"],
    boolean: ["help"],
    alias: { p: "provider", t: "token", m: "model", b: "baseUrl", h: "help" },
    default: { provider: "github" },
  });

  const message = flags._[0] as string;

  if (flags.help) {
    return {
      message: "",
      provider: "github",
      model: "",
      help: true,
    };
  }

  if (!message) {
    throw new Error("メッセージを指定してください。");
  }

  if (!flags.model) {
    throw new Error("--model パラメータは必須です。");
  }

  if (
    flags.provider !== "github" && flags.provider !== "openrouter" &&
    flags.provider !== "ollama"
  ) {
    throw new Error(
      "--provider は 'github'、'openrouter'、または 'ollama' を指定してください。",
    );
  }

  return {
    message,
    provider: flags.provider as "github" | "openrouter" | "ollama",
    token: flags.token,
    model: flags.model,
    baseUrl: flags.baseUrl,
    help: false,
  };
}

// プロバイダー設定を作成
function createProviderConfig(args: ParsedArgs): ProviderConfig {
  switch (args.provider) {
    case "github":
      return {
        provider: "github",
        baseURL: args.baseUrl || "https://models.github.ai/inference",
        apiKey: args.token || Deno.env.get("GITHUB_TOKEN") ||
          "dummy-key-for-github-models",
        model: args.model,
      };
    case "openrouter": {
      const openrouterKey = args.token || Deno.env.get("OPENROUTER_API_KEY");
      if (!openrouterKey) {
        throw new Error(
          "OpenRouterを使用する場合は、OPENROUTER_API_KEY環境変数または--tokenパラメータでAPIキーを設定してください。",
        );
      }
      return {
        provider: "openrouter",
        baseURL: args.baseUrl || "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
        model: args.model,
      };
    }
    case "ollama":
      return {
        provider: "ollama",
        baseURL: args.baseUrl || "http://localhost:11434/api",
        apiKey: "", // Ollama は認証不要
        model: args.model,
      };
    default:
      throw new Error(`サポートされていないプロバイダー: ${args.provider}`);
  }
}

// モデルクライアントを作成
function createModelClient(config: ProviderConfig) {
  switch (config.provider) {
    case "github":
    case "openrouter":
      return createOpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
      }).chat(config.model);
    case "ollama":
      return createOllama({
        baseURL: config.baseURL,
      }).chat(config.model);
    default:
      throw new Error(`サポートされていないプロバイダー: ${config.provider}`);
  }
}

// リトライ設定（maxRetriesのみ設定可能）
const MAX_RETRIES = parseInt(Deno.env.get("MAX_RETRIES") || "3");

async function main() {
  try {
    // コマンドライン引数を解析
    const args = parseCommandLineArgs();

    // ヘルプ表示
    if (args.help) {
      showHelp();
      return;
    }

    // プロバイダー設定を作成
    const config = createProviderConfig(args);

    // モデルクライアントを作成
    const model = createModelClient(config);

    console.log("=== 設定情報 ===");
    console.log(`プロバイダー: ${config.provider}`);
    console.log(`モデル: ${config.model}`);
    console.log(`ベースURL: ${config.baseURL}`);
    console.log(`リトライ回数: ${MAX_RETRIES}`);

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
      console.log(`モデルID: ${config.model}`);

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
3. update_task_status: 指定されたタスクの状態を更新（完了/未完了）
4. update_tasks: 指定されたセッション内の複数のタスクを一度に更新・追加

ユーザーの要求を理解し、適切な順序でツールを呼び出してタスクを管理し、
結果をわかりやすく日本語で説明してください。`,
          },
          {
            role: "user",
            content: args.message,
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
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
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
        console.error(
          "\n例: MAX_RETRIES=10 deno run --allow-all ai_sdk_mcp.ts",
        );
      }
    } finally {
      // リソースのクリーンアップ
      await client?.close();
    }
  } catch (error) {
    console.error("初期化エラー:", error);

    if (error instanceof Error && error.message.includes("メッセージを指定")) {
      console.error("\n💡 ヒント: 以下のようにメッセージを指定してください:");
      console.error(
        'deno run --allow-all ai_sdk_mcp.ts "タスク作成してください" --model "openai/gpt-4.1"',
      );
    }

    if (
      error instanceof Error &&
      error.message.includes("--model パラメータは必須")
    ) {
      console.error(
        "\n💡 ヒント: --model パラメータでモデル名を指定してください:",
      );
      console.error(
        'deno run --allow-all ai_sdk_mcp.ts "メッセージ" --model "openai/gpt-4.1"',
      );
    }
  }
}

// スクリプトがメインで実行された場合にmainを呼び出し
if (import.meta.main) {
  main().catch(console.error);
}
