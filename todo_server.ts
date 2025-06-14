import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// データ構造の定義
export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["pending", "completed"]),
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
  initial_tasks: z.array(z.string()),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;

const CreateSessionOutputSchema = z.object({
  session_id: z.string(),
  tasks: z.array(TaskSchema),
});
type CreateSessionOutput = z.infer<typeof CreateSessionOutputSchema>;

const GetTasksInputSchema = z.object({
  session_id: z.string(),
});
export type GetTasksInput = z.infer<typeof GetTasksInputSchema>;

const GetTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type GetTasksOutput = z.infer<typeof GetTasksOutputSchema>;

const UpdateTaskStatusInputSchema = z.object({
  session_id: z.string(),
  task_id: z.string(),
  status: z.enum(["pending", "completed"]),
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
  session_id: z.string(),
});
export type GetNextPendingTaskInput = z.infer<
  typeof GetNextPendingTaskInputSchema
>;

const GetNextPendingTaskOutputSchema = z.object({
  next_task: TaskSchema,
});
export type GetNextPendingTaskOutput = z.infer<
  typeof GetNextPendingTaskOutputSchema
>;

// MCPサーバーの作成
export const server = new Server(
  {
    name: "todo-list-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool実装: create_session
function createSession(input: CreateSessionInput): CreateSessionOutput {
  const sessionId = generateUniqueId();
  const createdTasks: Task[] = [];
  let taskIdCounter = 1;

  // 初期タスクの作成
  if (input.initial_tasks) {
    for (const description of input.initial_tasks) {
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

  return {
    session_id: sessionId,
    tasks: createdTasks,
  };
}

// Tool実装: get_tasks
function getTasks(input: GetTasksInput): GetTasksOutput {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  return {
    tasks: session.tasks,
  };
}

// Tool実装: update_task_status
function updateTaskStatus(
  input: UpdateTaskStatusInput,
): UpdateTaskStatusOutput {
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

  return {
    tasks: session.tasks,
    updated_task: task,
  };
}

// Tool実装: get_next_pending_task
function getNextPendingTask(
  input: GetNextPendingTaskInput,
): GetNextPendingTaskOutput {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  const pendingTasks = session.tasks.filter((t) => t.status === "pending");

  const nextTask = pendingTasks.reduce((prev, current) =>
    parseInt(prev.id) < parseInt(current.id) ? prev : current
  );

  return {
    next_task: nextTask,
  };
}

// Toolの登録
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: "create_session",
        description:
          "新しいTODOリストセッションを開始します。オプションで初期タスクのリストを説明文で与えることができます。",
        inputSchema: CreateSessionInputSchema,
        outputSchema: CreateSessionOutputSchema,
        annotations: {
          title: "Create a new TODO list session",
          destructiveHint: true,
        },
      },
      {
        name: "update_task_status",
        description:
          "指定されたタスクの状態を更新します。これにより、タスクを完了(completed)にしたり、未完了(pending)に戻したりできます。",
        inputSchema: UpdateTaskStatusInputSchema,
        outputSchema: UpdateTaskStatusOutputSchema,
        annotations: {
          title: "Update the status of a task",
          destructiveHint: true,
        },
      },
      {
        name: "get_tasks",
        description:
          "指定されたセッションのタスクを取得します。task_idを指定すると特定のタスクを、statusを指定すると状態でフィルタリングされたタスクリストを返します。",
        inputSchema: GetTasksInputSchema,
        outputSchema: GetTasksOutputSchema,
        annotations: {
          title: "Get tasks for a session",
          idempotentHint: true,
        },
      },
      {
        name: "get_next_pending_task",
        description:
          "指定されたセッションで、次に実行すべき未完了(pending)のタスクを1つ取得します。タスクは追加された順で取得されます。",
        inputSchema: GetNextPendingTaskInputSchema,
        outputSchema: GetNextPendingTaskOutputSchema,
        annotations: {
          title: "Get the next pending task",
          idempotentHint: true,
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_session": {
        const input = CreateSessionInputSchema.parse(args);
        const result = createSession(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                CreateSessionOutputSchema.parse(result),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_tasks": {
        const input = GetTasksInputSchema.parse(args);
        const result = getTasks(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(GetTasksOutputSchema.parse(result), null, 2),
            },
          ],
        };
      }

      case "update_task_status": {
        const input = UpdateTaskStatusInputSchema.parse(args);
        const result = updateTaskStatus(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                UpdateTaskStatusOutputSchema.parse(result),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_next_pending_task": {
        const input = GetNextPendingTaskInputSchema.parse(args);
        const result = getNextPendingTask(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                GetNextPendingTaskOutputSchema.parse(result),
                null,
                2,
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.message}`,
      );
    }
    throw error;
  }
});

// サーバーの起動
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TODO List MCP server running on stdio");
}

if (import.meta.main) {
  runServer().catch(console.error);
}
