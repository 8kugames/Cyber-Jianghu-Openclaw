// ============================================================================
// Shared TypeScript Types - Cyber-Jianghu OpenClaw Plugin
// ============================================================================
//
// Matches the Rust WS protocol defined in:
// - crates/agent/src/runtime/decision/ws/protocol.rs (DownstreamMessage/UpstreamMessage)
// - crates/protocol/src/types/world.rs (WorldTime, WorldState)
// - crates/protocol/src/types/entities.rs (Entity, SceneItem, etc.)
// - crates/protocol/src/types/locations.rs (Location)
// - crates/agent/src/runtime/decision/http/cognitive_context.rs (CognitiveContext)
//
// All JSON field names use snake_case to match the Rust serde serialization.

// ============================================================================
// Primitive / Value types
// ============================================================================

/** Action type -- fully data-driven string, not an enum. */
export type ActionType = string;

// ============================================================================
// World sub-structures
// ============================================================================

/** World in-game time (matches Rust `WorldTime`). */
export interface WorldTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Weather description (e.g. "晴"). */
  weather: string;
}

/** Adjacent node reachable from the current location. */
export interface AdjacentNode {
  node_id: string;
  name: string;
  travel_cost: number;
}

/** Current location info (matches Rust `Location`, uses `"type"` for `node_type`). */
export interface Location {
  node_id: string;
  name: string;
  /** Serialised as `"type"` in JSON via `#[serde(rename = "type")]`. */
  type: string;
  adjacent_nodes: AdjacentNode[];
}

/** Inventory item in the agent's backpack. */
export interface InventoryItem {
  item_id: string;
  name: string;
  quantity: number;
  is_equipped: boolean;
}

/** Agent self-state -- dynamic, data-driven attributes. */
export interface AgentSelfState {
  /** Numeric attribute map (hp, stamina, hunger, thirst, etc.). */
  attributes: Record<string, number>;
  /** Narrative descriptions of attributes (value -> natural language). */
  attribute_descriptions: Record<string, string>;
  /** Active status effects (e.g. "中毒", "受伤"). */
  status_effects: string[];
  /** Items in the agent's inventory. */
  inventory: InventoryItem[];
}

/** Another agent visible in the same scene. */
export interface Entity {
  id: string;
  name: string;
  distance: number;
  state: string;
  hostile: boolean;
}

/** A pickable-up item on the ground. */
export interface SceneItem {
  item_id: string;
  name: string;
  quantity: number;
  item_type: string;
}

/** A structured world event from the server. */
export interface WorldEvent {
  event_type: string;
  tick_id: number;
  description: string;
  metadata: Record<string, unknown>;
}

/** An action the agent may take this tick. */
export interface AvailableAction {
  action: string;
  description: string;
  valid_targets?: string[];
}

// ============================================================================
// Experience / Report types
// ============================================================================

/**
 * Experience log entry returned by GET /api/v1/character/experiences.
 * Used by the Reporter for daily report generation.
 */
export interface Experience {
  tick_id: number;
  world_time: { year: number; month: number; day: number; hour: number; minute: number };
  event: string;
  observer_thought?: string;
  intent_summary?: string;
}

/**
 * Persona summary for character death narrative.
 */
export interface PersonaSummary {
  name: string;
  personality: string[];
  values: string[];
}

// ============================================================================
// WorldState -- full per-tick snapshot
// ============================================================================

/**
 * Complete world state snapshot pushed every tick.
 * Matches Rust `WorldState` in `crates/protocol/src/types/world.rs`.
 */
export interface WorldState {
  event_type: string;
  tick_id: number;
  agent_id?: string;
  world_time: WorldTime;
  location: Location;
  self_state: AgentSelfState;
  entities: Entity[];
  nearby_items: SceneItem[];
  events_log: WorldEvent[];
}

// ============================================================================
// Cognitive context (four-stage)
// ============================================================================

/** A single drive in the motivation stage. */
export interface Drive {
  drive: string;
  intensity: number;
  reason: string;
}

/** Action info inside the planning stage. */
export interface CognitiveAvailableAction {
  action: string;
  target?: string;
  description: string;
}

/** Stage 1 -- Perception. */
export interface PerceptionContext {
  self_status: string;
  environment: string;
  key_observations: string[];
}

/** Stage 2 -- Motivation. */
export interface MotivationContext {
  active_drives: Drive[];
  dominant_drive: string;
}

/** Stage 3 -- Planning. */
export interface PlanningContext {
  current_goals: string[];
  available_actions: CognitiveAvailableAction[];
}

/** Stage 4 -- Decision. */
export interface DecisionContext {
  requires_reasoning: boolean;
  thinking_prompt: string;
}

/** Four-stage cognitive context attached to tick messages. */
export interface CognitiveContext {
  perception: PerceptionContext;
  motivation: MotivationContext;
  planning: PlanningContext;
  decision: DecisionContext;
}

// ============================================================================
// Downstream messages (Agent -> OpenClaw)
// ============================================================================

/** Tick notification -- main per-tick message. */
export interface TickMessage {
  type: 'tick';
  tick_id: number;
  deadline_ms: number;
  state: WorldState;
  /** Narrative context in Markdown (for LLM reasoning). */
  context?: string;
  /** Structured four-stage cognitive context. */
  cognitive_context?: CognitiveContext;
}

/** Tick closed notification (timeout, no intent received). */
export interface TickClosedMessage {
  type: 'tick_closed';
  tick_id: number;
  reason: string;
  next_tick_in_ms: number;
}

/** Agent death notification. */
export interface AgentDiedMessage {
  type: 'agent_died';
  agent_id: string;
  cause: string;
  description: string;
  location: string;
  tick_id: number;
  died_at: number;
  /** 0 = immediate, -1 = no rebirth. */
  rebirth_delay_ticks: number;
}

/** Dialogue message forwarded from another agent. */
export interface ServerDialogueMessage {
  type: 'server_dialogue';
  dialogue_type: string;
  from_agent_id: string;
  to_agent_id?: string;
  session_id?: string;
  opening_remark?: string;
  content?: string;
}

/** Structured server error. */
export type ServerErrorCode =
  | 'agent_dead'
  | 'rate_limited'
  | 'tick_expired'
  | 'duplicate_submission'
  | 'invalid_action'
  | 'validation_failed'
  | 'unknown';

export interface ServerErrorMessage {
  type: 'server_error';
  code: ServerErrorCode;
  message: string;
  tick_id?: number;
  current_tick?: number;
}

/** Game rules hot-update. */
export interface GameRulesUpdateMessage {
  type: 'server_game_rules_update';
  tick_duration_secs: number;
  version: string;
  last_updated: string;
}

/** World-building rules hot-update. */
export interface WorldBuildingRulesUpdateMessage {
  type: 'server_world_building_rules_update';
  version: string;
  last_updated: string;
}

/** Notification that some messages were lost (lagged receiver). */
export interface MissedMessagesMessage {
  type: 'missed_messages';
  count: number;
  suggest_resync: boolean;
}

/** Server immediate event (e.g. speak broadcast). */
export interface ServerImmediateEventMessage {
  type: 'server_immediate_event';
  event_type: string;
  tick_id: number;
  description: string;
  metadata: Record<string, unknown>;
}

/** Union of every downstream message the plugin may receive. */
export type DownstreamMessage =
  | TickMessage
  | TickClosedMessage
  | AgentDiedMessage
  | ServerDialogueMessage
  | ServerErrorMessage
  | GameRulesUpdateMessage
  | WorldBuildingRulesUpdateMessage
  | MissedMessagesMessage
  | ServerImmediateEventMessage
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

/** Intent submission payload. */
export interface IntentPayload {
  type: 'intent';
  tick_id: number;
  action_type: string;
  action_data?: unknown;
  thought_log?: string;
}

/** LLM response sent back to the Agent. */
export interface LLMResponsePayload {
  type: 'llm_response';
  request_id: string;
  content: string;
  error?: string;
}

// ============================================================================
// Tool-facing types
// ============================================================================

/** Parameters for the `jianghu_act` tool. */
export interface GameActionParams {
  action: ActionType;
  target?: string;
  data?: string;
  reasoning?: string;
}

/** Internal tick-state tracking for the plugin runtime. */
export interface TickState {
  tickId: number;
  deadline: number;
  state: WorldState;
}
