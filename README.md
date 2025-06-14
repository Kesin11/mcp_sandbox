# MCP Sandbox

My MCP (Model Context Protocol) server sandbox

## TODO管理MCPサーバー

このプロジェクトには、TODOリスト管理のためのMCP (Model Context Protocol)
サーバーが含まれています。

### 起動方法

1. 依存関係をインストール（Denoを使用）:

```bash
# Denoがインストールされていることを確認
deno --version
```

2. MCPサーバーを起動:

```bash
deno run todo_server.ts
```

### 利用可能なツール

このMCPサーバーは以下の4つのツールを提供します：

#### 1. create_session

新しいTODOリストセッションを開始します。

**パラメータ:**

- `initial_tasks`: 初期タスクのリスト（文字列配列）

**機能:**

- ユニークなセッションIDを生成
- 初期タスクを `pending` 状態で作成
- セッション情報とタスクリストを返す

#### 2. get_tasks

指定されたセッションのタスクを取得します。

**パラメータ:**

- `session_id`: タスクを取得するセッションのID

**機能:**

- セッション内の全タスクを返す
- タスクの状態（pending/completed）を確認可能

#### 3. update_task_status

指定されたタスクの状態を更新します。

**パラメータ:**

- `session_id`: 対象セッションのID
- `task_id`: 更新するタスクのID
- `status`: 新しい状態（`pending` または `completed`）

**機能:**

- タスクを完了状態にマーク
- 完了したタスクを未完了に戻すことも可能

#### 4. get_next_pending_task

次に実行すべき未完了タスクを取得します。

**パラメータ:**

- `session_id`: 対象セッションのID

**機能:**

- 未完了（pending）状態のタスクから最も古いものを返す
- 全タスク完了時はnullを返す
- タスクの優先順位付けに使用

### 使用例

1. セッション作成とタスク管理:

```json
{
  "tool": "create_session",
  "arguments": {
    "initial_tasks": ["タスク1を実行", "タスク2を実行", "タスク3を実行"]
  }
}
```

2. 次のタスクを取得:

```json
{
  "tool": "get_next_pending_task",
  "arguments": {
    "session_id": "your-session-id"
  }
}
```

3. タスクを完了にマーク:

```json
{
  "tool": "update_task_status",
  "arguments": {
    "session_id": "your-session-id",
    "task_id": "1",
    "status": "completed"
  }
}
```
