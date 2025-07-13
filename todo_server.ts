import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Define data structures
export const TaskSchema = z.object({
  id: z.string().describe("Unique task ID"),
  description: z.string().describe(
    "Task description. Describes what needs to be done.",
  ),
  status: z.enum(["pending", "completed"]).describe(
    "Task status. 'pending' indicates incomplete, 'completed' indicates complete.",
  ),
});

export type Task = z.infer<typeof TaskSchema>;

export interface Session {
  session_id: string;
  tasks: Task[];
  next_task_id_counter: number;
}

// In-memory data store
const sessions: Map<string, Session> = new Map();

// Generate unique ID
function generateUniqueId(): string {
  return crypto.randomUUID();
}

// Define Tool input/output schemas
const CreateSessionInputSchema = z.object({
  initial_tasks: z.array(z.string()).describe(
    "List of initial tasks. Each task is given as a description.",
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
    "ID of the session to get tasks from",
  ),
});
export type GetTasksInput = z.infer<typeof GetTasksInputSchema>;

const GetTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type GetTasksOutput = z.infer<typeof GetTasksOutputSchema>;

const UpdateTaskStatusInputSchema = z.object({
  session_id: z.string().describe(
    "ID of the session to update task status in",
  ),
  task_id: z.string().describe("ID of the task to update status for."),
  status: z.enum(["pending", "completed"]).describe(
    "The new status of the task",
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
  session_id: z.string().describe("ID of the session to get task status from"),
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

// Create MCP server
export const server = new McpServer(
  {
    name: "todo-list-server",
    version: "0.1.0",
    capabilities: {
      tools: true,
    },
  },
);

// Tool implementation: create_session
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

  // Create initial tasks
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

  // Create and save session
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

// Tool implementation: get_tasks
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

// Tool implementation: update_task_status
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

// Tool implementation: get_next_pending_task
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

  // Return null if no pending tasks exist
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

const UpdateTasksInputSchema = z.object({
  session_id: z.string().describe("ID of the session to update tasks in"),
  tasks: z.array(TaskSchema).describe("List of tasks to update"),
});
export type UpdateTasksInput = z.infer<typeof UpdateTasksInputSchema>;

const UpdateTasksOutputSchema = z.object({
  tasks: z.array(TaskSchema),
});
export type UpdateTasksOutput = z.infer<typeof UpdateTasksOutputSchema>;

function updateTasks(input: UpdateTasksInput) {
  const session = sessions.get(input.session_id);
  if (!session) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Session not found: ${input.session_id}`,
    );
  }

  for (const task of input.tasks) {
    const index = session.tasks.findIndex((t) => t.id === task.id);
    if (index === -1) {
      session.tasks.push(task);
      session.next_task_id_counter = Math.max(
        session.next_task_id_counter,
        parseInt(task.id, 10) + 1,
      );
    } else {
      session.tasks[index] = task;
    }
  }
  // sort by id
  session.tasks.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

  return toolOutputWrapper({
    tasks: session.tasks,
  }, UpdateTasksOutputSchema);
}

// Register Tools
server.tool(
  "create_session",
  "Starts a new TODO list session. A list of initial tasks must be provided as descriptions.",
  CreateSessionInputSchema.shape,
  {
    title: "Create a new TODO list session",
    destructiveHint: true,
  },
  createSession,
);

server.tool(
  "update_task_status",
  "Updates the status of a specified task. This allows you to mark a task as 'completed' or revert it to 'pending'.",
  UpdateTaskStatusInputSchema.shape,
  {
    title: "Update the status of a task",
    destructiveHint: true,
  },
  updateTaskStatus,
);

server.tool(
  "update_tasks",
  "Updates multiple tasks in a specified session at once.",
  UpdateTasksInputSchema.shape,
  {
    title: "Update tasks in a session",
    destructiveHint: true,
  },
  updateTasks,
);

server.tool(
  "get_tasks",
  "Gets the tasks for a specified session",
  GetTasksInputSchema.shape,
  {
    title: "Get tasks for a session",
    idempotentHint: true,
  },
  getTasks,
);

server.tool(
  "get_next_pending_task",
  "Gets the next pending task to be executed in the specified session. Tasks are retrieved in the order they were added.",
  GetNextPendingTaskInputSchema.shape,
  {
    title: "Get the next pending task",
    idempotentHint: true,
  },
  getNextPendingTask,
);

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TODO List MCP server running on stdio");
}

if (import.meta.main) {
  runServer().catch(console.error);
}
