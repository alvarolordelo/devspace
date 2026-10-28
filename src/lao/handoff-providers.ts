/**
 * Optional UI launch adapters. Tasks only persist a generic requesting-agent
 * label; provider-specific URLs never enter task records or MCP results.
 *
 * Visiting a provider page does NOT authorize or execute an MCP tool call.
 * The user must submit the copied continuation instruction in a client that
 * already has the DevSpace MCP connection.
 */
export const LAO_HANDOFF_PROVIDERS = Object.freeze([
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "claude", name: "Claude", url: "https://claude.ai/new" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  { id: "grok", name: "Grok", url: "https://grok.com/" },
] as const);
