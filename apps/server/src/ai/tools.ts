export const codingTools = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories inside the trusted workspace.",
      strict: true,
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative directory path." } },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the trusted workspace.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_directory",
      description: "Create a directory inside the trusted workspace.",
      strict: true,
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or fully replace a UTF-8 text file inside the trusted workspace.",
      strict: true,
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace one exact, unique text fragment in a UTF-8 file.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" }
        },
        required: ["path", "oldText", "newText"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_path",
      description: "Delete a file or directory after explicit client-side user approval.",
      strict: true,
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command in the workspace after explicit client-side user approval.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          timeoutSeconds: { type: "integer", minimum: 1, maximum: 180 }
        },
        required: ["command"],
        additionalProperties: false
      }
    }
  }
] as const;
