import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// データ構造の定義
export const TaskSchema = z.object({
  id: z.string().describe("ユニークなタスクID"),
  description: z.string().describe(
    "タスクの説明。何をする必要があるかを記述します",
  ),
  status: z.enum(["pending", "completed"]).describe(
    "タスクの状態。'pending'は未完了、'completed'は完了を示します",
  ),
});

export type Task = z.infer<typeof TaskSchema>;

export interface Session {
  session_id: string;
  tasks: Task[];
  next_task_id_counter: number;
}

// インメモリデータストア
const sessions: Map<string, Session> = new Map();

// ユニークIDの生成
function generateUniqueId(): string {
  return crypto.randomUUID();
}

// Tool入力/出力スキーマの定義
const CreateSessionInputSchema = z.object({
  initial_tasks: z.array(z.string()).describe(
    "初期タスクのリスト。各タスクは説明文で与えられます",
  ),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

const CreateSessionOutputSchema = z.object({
  session_id: z.string(),
  tasks: z.array(TaskSchema),
});
export type CreateSessionOutput = z.infer<typeof CreateSessionOutputSchema>;

const GetTasksInputSchema = z.object({
  session_id: z.string().describe(
    "タスクを取得するセッションのID",
  ),
});
export type GetTasksInput = z.infer<typeof GetTasksInputSchema>;

const GetTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type GetTasksOutput = z.infer<typeof GetTasksOutputSchema>;

const UpdateTaskStatusInputSchema = z.object({
  session_id: z.string().describe(
    "タスクの状態を更新するセッションのID",
  ),
  task_id: z.string().describe("状態を更新するタスクのID。"),
  status: z.enum(["pending", "completed"]).describe(
    "タスクの新しい状態",
  ),
});
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;

const UpdateTaskStatusOutputSchema = z.object({
  updated_task: TaskSchema,
  tasks: z.array(TaskSchema),
});
export type UpdateTaskStatusOutput = z.infer<
  typeof UpdateTaskStatusOutputSchema
>;

const GetNextPendingTaskInputSchema = z.object({
  session_id: z.string().describe("タスクの状態を取得するセッションのID"),
});
export type GetNextPendingTaskInput = z.infer<
  typeof GetNextPendingTaskInputSchema
>;

const GetNextPendingTaskOutputSchema = z.object({
  next_task: TaskSchema.nullable(),
});
export type GetNextPendingTaskOutput = z.infer<
  typeof GetNextPendingTaskOutputSchema
>;

function toolOutputWrapper(
  content: unknown,
  outputSchema: z.ZodObject<z.ZodRawShape>,
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(outputSchema.parse(content), null, 2),
      },
    ],
  };
}

// MCPサーバーの作成
export const server = new McpServer(
  {
    name: "todo-list-server",
    version: "0.1.0",
    capabilities: {
      tools: true,
    },
  },
);

// Tool実装: create_session
function createSession({ initial_tasks }: CreateSessionInput) {
  if (initial_tasks.length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "initial_tasks must not be empty",
    );
  }
  const sessionId = generateUniqueId();
  const createdTasks: Task[] = [];
  let taskIdCounter = 1;

  // 初期タスクの作成
  if (initial_tasks) {
    for (const description of initial_tasks) {
      const task: Task = {
        id: taskIdCounter.toString(),
        description,
        status: "pending",
      };
      createdTasks.push(task);
      taskIdCounter++;
    }
  }

  // セッションの作成と保存
  const session: Session = {
    session_id: sessionId,
    tasks: createdTasks,
    next_task_id_counter: taskIdCounter,
  };

  sessions.set(sessionId, session);

  return toolOutputWrapper({
    session_id: sessionId,
    tasks: createdTasks,
  }, CreateSessionOutputSchema);
}

// Tool実装: get_tasks
function getTasks(input: GetTasksInput) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  return toolOutputWrapper({
    tasks: session.tasks,
  }, GetTasksOutputSchema);
}

// Tool実装: update_task_status
function updateTaskStatus(
  input: UpdateTaskStatusInput,
) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  const task = session.tasks.find((t) => t.id === input.task_id);
  if (!task) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Task not found: ${input.task_id}`,
    );
  }

  task.status = input.status;

  return toolOutputWrapper({
    tasks: session.tasks,
    updated_task: task,
  }, UpdateTaskStatusOutputSchema);
}

// Tool実装: get_next_pending_task
function getNextPendingTask(
  input: GetNextPendingTaskInput,
) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  const pendingTasks = session.tasks.filter((t) => t.status === "pending");

  // pending状態のタスクが存在しない場合はnullを返す
  if (pendingTasks.length === 0) {
    return toolOutputWrapper({
      next_task: null,
    }, GetNextPendingTaskOutputSchema);
  }

  const nextTask = pendingTasks.reduce((prev, current) =>
    parseInt(prev.id) < parseInt(current.id) ? prev : current
  );

  return toolOutputWrapper({
    next_task: nextTask,
  }, GetNextPendingTaskOutputSchema);
}

// Toolの登録
server.tool(
  "create_session",
  "新しいTODOリストセッションを開始します。初期タスクのリストを説明文で与える必要があります。",
  CreateSessionInputSchema.shape,
  {
    title: "Create a new TODO list session",
    destructiveHint: true,
  },
  createSession,
);

server.tool(
  "update_task_status",
  "指定されたタスクの状態を更新します。これにより、タスクを完了(completed)にしたり、未完了(pending)に戻したりできます。",
  UpdateTaskStatusInputSchema.shape,
  {
    title: "Update the status of a task",
    destructiveHint: true,
  },
  updateTaskStatus,
);

server.tool(
  "get_tasks",
  "指定されたセッションのタスクを取得します",
  GetTasksInputSchema.shape,
  {
    title: "Get tasks for a session",
    idempotentHint: true,
  },
  getTasks,
);

server.tool(
  "get_next_pending_task",
  "指定されたセッションで、次に実行すべき未完了(pending)のタスクを1つ取得します。タスクは追加された順で取得されます。",
  GetNextPendingTaskInputSchema.shape,
  {
    title: "Get the next pending task",
    idempotentHint: true,
  },
  getNextPendingTask,
);

// サーバーの起動
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TODO List MCP server running on stdio");
}

if (import.meta.main) {
  runServer().catch(console.error);
}
