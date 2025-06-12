# TODOリストMCPサーバー 実装プラン

## 1. データ構造の定義

-   **`Task` (タスク)**
    -   `id`: `string` (タスクの一意な識別子)
    -   `description`: `string` (タスクの内容)
    -   `status`: `'pending' | 'completed'` (タスクの状態、デフォルトは 'pending')
-   **`Session` (セッション)**
    -   `session_id`: `string` (セッションの一意な識別子)
    -   `tasks`: `Task[]` (そのセッションに属するタスクのリスト)
    -   `next_task_id_counter`: `number` (セッション内でユニークなタスクIDを払い出すためのカウンター)
-   **インメモリデータストア**
    -   `sessions`: `Map<string, Session>` (セッションIDをキーとしてセッション情報を保持)

## 2. Toolの設計

-   **`create_session(initial_task_descriptions?: string[])`**
    -   **説明:** 新しいTODOリストセッションを開始します。オプションで初期タスクのリストを説明文で与えることができます。
    -   **処理:**
        1.  ユニークな `session_id` を生成します。
        2.  `initial_task_descriptions` が与えられた場合、各説明に対して新しい `Task` オブジェクトを作成し（IDを払い出し、statusを 'pending'に設定）、セッションの `tasks` リストに追加します。
        3.  新しいセッション情報をインメモリデータストアに保存します。
    -   **入力スキーマ (zod):** `z.object({ initial_task_descriptions: z.array(z.string()).optional() })`
    -   **出力スキーマ (zod):** `z.object({ session_id: z.string(), created_tasks: z.array(TaskSchema) })`

-   **`add_task(session_id: string, description: string)`**
    -   **説明:** 既存のセッションに新しいタスクを追加します。
    -   **処理:**
        1.  指定された `session_id` のセッションが存在するか確認します。
        2.  新しいタスクIDを払い出します。
        3.  新しい `Task` オブジェクトを作成し（statusを 'pending'に設定）、セッションの `tasks` リストに追加します。
    -   **入力スキーマ (zod):** `z.object({ session_id: z.string(), description: z.string() })`
    -   **出力スキーマ (zod):** `z.object({ added_task: TaskSchema })`

-   **`get_tasks(session_id: string, task_id?: string, status?: 'pending' | 'completed' | 'all')`**
    -   **説明:** 指定されたセッションのタスクを取得します。`task_id` を指定すると特定のタスクを、`status` を指定すると状態でフィルタリングされたタスクリストを返します。両方省略した場合は全てのタスクを返します。
    -   **処理:**
        1.  指定された `session_id` のセッションからタスクを取得します。
        2.  `task_id` があれば該当タスクを、なければ `status` (デフォルト 'all') でフィルタリングして返します。
    -   **入力スキーマ (zod):** `z.object({ session_id: z.string(), task_id: z.string().optional(), status: z.enum(['pending', 'completed', 'all']).optional() })`
    -   **出力スキーマ (zod):** `z.object({ tasks: z.array(TaskSchema) })`

-   **`update_task_status(session_id: string, task_id: string, status: 'pending' | 'completed')`**
    -   **説明:** 指定されたタスクの状態を更新します。これにより、タスクを完了 (`completed`) にしたり、未完了 (`pending`) に戻したりできます。
    -   **処理:**
        1.  指定された `session_id` と `task_id` のタスクの状態を更新します。
    -   **入力スキーマ (zod):** `z.object({ session_id: z.string(), task_id: z.string(), status: z.enum(['pending', 'completed']) })`
    -   **出力スキーマ (zod):** `z.object({ success: z.boolean(), updated_task: TaskSchema.optional() })`

-   **`get_next_pending_task(session_id: string)`**
    -   **説明:** 指定されたセッションで、次に実行すべき未完了 (`pending`) のタスクを1つ取得します。タスクは追加された順（またはID順）で取得されることを想定します。これにより、タスクを順番に処理していくことが可能です。
    -   **処理:**
        1.  指定された `session_id` のセッションから、`status` が 'pending' のタスクを検索します。
        2.  該当タスクがあれば、その中でIDが最も小さい（またはリストの最初にある）ものを返します。なければ `null` を返します。
    -   **入力スキーマ (zod):** `z.object({ session_id: z.string() })`
    -   **出力スキーマ (zod):** `z.object({ next_task: TaskSchema.nullable() })`

## 3. 実装ファイル構成案

-   `todo_server.ts`: MCPサーバーのロジック（データストア、Toolハンドラ、サーバーインスタンス化）を記述します。
-   `todo_server_test.ts`: `InMemoryTransport` を使用したテストコードを記述します。

## 4. TaskSchema (zod)

```typescript
import { z } from "https://deno.land/x/zod/mod.ts";

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'completed']),
});
```
