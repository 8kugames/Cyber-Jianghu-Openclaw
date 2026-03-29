// ============================================================================
// Shared TypeScript Types - Cyber-Jianghu OpenClaw Plugin
// ============================================================================

// ============================================================================
// Downstream messages (Agent -> OpenClaw)
// ============================================================================

/** Union of every downstream message the plugin may receive. */
export type DownstreamMessage =
  | LLMRequestMessage;

/** LLM request from the Agent's cognitive engine. */
export interface LLMRequestMessage {
  type: 'llm_request';
  request_id: string;
  prompt: string;
}

// ============================================================================
// Upstream messages (OpenClaw -> Agent)
// ============================================================================

/** LLM response sent back to the Agent. */
export interface LLMResponsePayload {
  type: 'llm_response';
  request_id: string;
  content: string;
  error?: string;
}
