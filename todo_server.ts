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
  status: z.enum(['pending', 'completed']),
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
  initial_task_descriptions: z.array(z.string()).optional(),
});

const CreateSessionOutputSchema = z.object({
  session_id: z.string(),
  created_tasks: z.array(TaskSchema),
});

const AddTaskInputSchema = z.object({
  session_id: z.string(),
  description: z.string(),
});

const AddTaskOutputSchema = z.object({
  added_task: TaskSchema,
});

const GetTasksInputSchema = z.object({
  session_id: z.string(),
  task_id: z.string().optional(),
  status: z.enum(['pending', 'completed', 'all']).optional(),
});

const GetTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
});

const UpdateTaskStatusInputSchema = z.object({
  session_id: z.string(),
  task_id: z.string(),
  status: z.enum(['pending', 'completed']),
});

const UpdateTaskStatusOutputSchema = z.object({
  success: z.boolean(),
  updated_task: TaskSchema.optional(),
});

const GetNextPendingTaskInputSchema = z.object({
  session_id: z.string(),
});

const GetNextPendingTaskOutputSchema = z.object({
  next_task: TaskSchema.nullable(),
});

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
  }
);

// Tool実装: create_session
function createSession(input: z.infer<typeof CreateSessionInputSchema>) {
  const sessionId = generateUniqueId();
  const createdTasks: Task[] = [];
  let taskIdCounter = 1;

  // 初期タスクの作成
  if (input.initial_task_descriptions) {
    for (const description of input.initial_task_descriptions) {
      const task: Task = {
        id: taskIdCounter.toString(),
        description,
        status: 'pending',
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
    created_tasks: createdTasks,
  };
}

// Tool実装: add_task
function addTask(input: z.infer<typeof AddTaskInputSchema>) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(ErrorCode.InvalidRequest, `Session not found: ${input.session_id}`);
  }

  const newTask: Task = {
    id: session.next_task_id_counter.toString(),
    description: input.description,
    status: 'pending',
  };

  session.tasks.push(newTask);
  session.next_task_id_counter++;

  return {
    added_task: newTask,
  };
}

// Tool実装: get_tasks
function getTasks(input: z.infer<typeof GetTasksInputSchema>) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(ErrorCode.InvalidRequest, `Session not found: ${input.session_id}`);
  }

  // 特定のタスクIDが指定された場合
  if (input.task_id) {
    const task = session.tasks.find(t => t.id === input.task_id);
    return {
      tasks: task ? [task] : [],
    };
  }

  // ステータスによるフィルタリング
  let filteredTasks = session.tasks;
  const status = input.status || 'all';
  
  if (status !== 'all') {
    filteredTasks = session.tasks.filter(t => t.status === status);
  }

  return {
    tasks: filteredTasks,
  };
}

// Tool実装: update_task_status
function updateTaskStatus(input: z.infer<typeof UpdateTaskStatusInputSchema>) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(ErrorCode.InvalidRequest, `Session not found: ${input.session_id}`);
  }

  const task = session.tasks.find(t => t.id === input.task_id);
  if (!task) {
    return {
      success: false,
    };
  }

  task.status = input.status;

  return {
    success: true,
    updated_task: task,
  };
}

// Tool実装: get_next_pending_task
function getNextPendingTask(input: z.infer<typeof GetNextPendingTaskInputSchema>) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(ErrorCode.InvalidRequest, `Session not found: ${input.session_id}`);
  }

  const pendingTasks = session.tasks.filter(t => t.status === 'pending');
  
  // IDが最も小さいタスクを返す（追加順を保持）
  if (pendingTasks.length === 0) {
    return {
      next_task: null,
    };
  }

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
        description: "新しいTODOリストセッションを開始します。オプションで初期タスクのリストを説明文で与えることができます。",
        inputSchema: CreateSessionInputSchema,
      },
      {
        name: "add_task",
        description: "既存のセッションに新しいタスクを追加します。",
        inputSchema: AddTaskInputSchema,
      },
      {
        name: "get_tasks",
        description: "指定されたセッションのタスクを取得します。task_idを指定すると特定のタスクを、statusを指定すると状態でフィルタリングされたタスクリストを返します。",
        inputSchema: GetTasksInputSchema,
      },
      {
        name: "update_task_status",
        description: "指定されたタスクの状態を更新します。これにより、タスクを完了(completed)にしたり、未完了(pending)に戻したりできます。",
        inputSchema: UpdateTaskStatusInputSchema,
      },
      {
        name: "get_next_pending_task",
        description: "指定されたセッションで、次に実行すべき未完了(pending)のタスクを1つ取得します。タスクは追加された順で取得されます。",
        inputSchema: GetNextPendingTaskInputSchema,
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
              text: JSON.stringify(CreateSessionOutputSchema.parse(result), null, 2),
            },
          ],
        };
      }

      case "add_task": {
        const input = AddTaskInputSchema.parse(args);
        const result = addTask(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(AddTaskOutputSchema.parse(result), null, 2),
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
              text: JSON.stringify(UpdateTaskStatusOutputSchema.parse(result), null, 2),
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
              text: JSON.stringify(GetNextPendingTaskOutputSchema.parse(result), null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.message}`);
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
