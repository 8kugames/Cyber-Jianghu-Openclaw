// ============================================================================
// Shared TypeScript Types - Cyber-Jianghu OpenClaw Plugin
// ============================================================================
//
// Matches the Rust WS protocol defined in:
// - crates/agent/src/runtime/claw/protocol.rs (DownstreamMessage/UpstreamMessage)
// - crates/protocol/src/types/world.rs (WorldTime, WorldState)
// - crates/protocol/src/types/entities.rs (Entity, SceneItem, AgentSelfState, etc.)
// - crates/protocol/src/types/locations.rs (Location)
// - crates/agent/src/infra/api/cognitive_context.rs (CognitiveContext)
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
  /** Item type (consumable/weapon/material etc.). */
  item_type?: string;
  /** Alias list for LLM mapping. */
  aliases?: string[];
}

/** Survival drive from server (pre-computed from narratives.yaml). */
export interface SurvivalDrive {
  /** Triggering attribute name (e.g. "hunger"). */
  attribute: string;
  /** Drive name (e.g. "寻找食物"). */
  drive: string;
  /** Reason description. */
  reason: string;
  /** Urgency level (1-10). */
  urgency: number;
  /** Goal description. */
  goal: string;
}

/** Skill info for a learned skill. */
export interface SkillInfo {
  skill_id: string;
  name: string;
}

/** Recipe detail (server-authoritative, per-tick). */
export interface RecipeDetail {
  recipe_id: string;
  name: string;
  description: string;
  materials: RecipeMaterialInfo[];
  result_item: string;
  result_item_name: string;
  result_quantity: number;
  stamina_cost: number;
}

/** Recipe material info. */
export interface RecipeMaterialInfo {
  item_id: string;
  item_name: string;
  quantity: number;
}

/** Agent self-state -- dynamic, data-driven attributes. */
export interface AgentSelfState {
  /** Numeric attribute map (hp, stamina, hunger, thirst, etc.). */
  attributes: Record<string, number>;
  /** Derived attributes (real-time computed floats, e.g. dodge rate). */
  derived_attributes?: Record<string, number>;
  /** Narrative descriptions of attributes (value -> natural language). */
  attribute_descriptions: Record<string, string>;
  /** Survival drives (server pre-computed from narratives.yaml). */
  survival_drives?: SurvivalDrive[];
  /** Active status effects (e.g. "中毒", "受伤"). */
  status_effects: string[];
  /** Items in the agent's inventory. */
  inventory: InventoryItem[];
  /** Learned skills. */
  skills?: SkillInfo[];
  /** Known recipe details (server-authoritative). */
  recipe_details?: RecipeDetail[];
  /** Current age in game years. */
  age_years?: number;
  /** Maximum lifespan in game years. */
  max_age?: number;
}

/** Recent action record for nearby entities. */
export interface RecentAction {
  tick_id: number;
  action_type: string;
  content?: string;
  result: string;
}

/** Another agent visible in the same scene. */
export interface Entity {
  id: string;
  name: string;
  distance: number;
  state: string;
  hostile: boolean;
  /** Recent actions taken by this entity. */
  recent_actions?: RecentAction[];
}

/** A pickable-up item on the ground. */
export interface SceneItem {
  item_id: string;
  name: string;
  quantity: number;
  item_type: string;
  /** Alias list for LLM mapping. */
  aliases?: string[];
}

/** A structured world event from the server. */
export interface WorldEvent {
  event_type: string;
  tick_id: number;
  description: string;
  metadata: Record<string, unknown>;
}

/** Action requirement info (data-driven, from actions.yaml). */
export interface ActionRequirementInfo {
  requirement_type: string;
  target?: string;
  [key: string]: unknown;
}

/** Action effect info (data-driven, from actions.yaml). */
export interface ActionEffectInfo {
  effect_type: string;
  target?: string;
  [key: string]: unknown;
}

/** An action the agent may take this tick. */
export interface AvailableAction {
  action: string;
  /** Short display name. */
  name?: string;
  description: string;
  /** Action category. */
  category?: string;
  valid_targets?: string[];
  /** Required action_data field names. */
  required_fields?: string[];
  /** OOC risk level ("low" | "medium" | "high"). */
  ooc_risk?: string;
  /** Action type aliases (Chinese variants + common English errors). */
  aliases?: string[];
  /** Field alias mapping. */
  field_aliases?: Record<string, string[]>;
  /** Action requirements. */
  requirements?: ActionRequirementInfo[];
  /** Action effects. */
  effects?: ActionEffectInfo[];
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
 * Persona summary for character death narrative & review requests.
 */
export interface PersonaSummary {
  name: string;
  personality: string[];
  values: string[];
}

/**
 * Private dialogue record (index only, no content).
 */
export interface PrivateDialogueRecord {
  session_id: string;
  agent_a_id: string;
  agent_a_name: string;
  agent_b_id: string;
  agent_b_name: string;
  message_count: number;
  last_message_from: string;
}

/**
 * Cross-agent inherited lesson (aggregated by death cause).
 */
export interface PublicLesson {
  cause: string;
  lesson: string;
  death_count: number;
  avg_survival_ticks: number;
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
  /** Private dialogue index from last tick (who talked to whom). */
  private_dialogue_log?: PrivateDialogueRecord[];
  /** Last pipeline execution summary. */
  last_execution_summary?: unknown;
  /** Cross-agent inherited lessons (aggregated by death cause). */
  lessons_learned?: PublicLesson[];
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

/** Action info inside the planning stage of cognitive context. */
export interface CognitiveAvailableAction {
  action: string;
  /** Short display name. */
  name: string;
  /** Action category. */
  category: string;
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

/** Review request from ReflectorSoul (external review). */
export interface ReviewRequestMessage {
  type: 'review_request';
  tick_id: number;
  /** Player intent to review. */
  player_intent: {
    action_type: string;
    action_data?: unknown;
    thought_log?: string;
  };
  /** Persona summary for context. */
  persona_summary: PersonaSummary;
  /** World context narrative. */
  world_context: string;
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
  /** Death context (attribute snapshot etc.). */
  metadata?: unknown;
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

/** LLM request from the Agent's cognitive engine. */
export interface LLMRequestMessage {
  type: 'llm_request';
  request_id: string;
  prompt: string;
}

/** LLM response from OpenClaw back to the Agent (downstream echo). */
export interface LLMResponseMessage {
  type: 'llm_response';
  request_id: string;
  content: string;
  error?: string;
}

/** Union of every downstream message the plugin may receive. */
export type DownstreamMessage =
  | TickMessage
  | TickClosedMessage
  | ReviewRequestMessage
  | AgentDiedMessage
  | ServerDialogueMessage
  | ServerErrorMessage
  | GameRulesUpdateMessage
  | WorldBuildingRulesUpdateMessage
  | MissedMessagesMessage
  | ServerImmediateEventMessage
  | LLMRequestMessage
  | LLMResponseMessage;

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

/** Review decision enum. */
export type ReviewDecision = 'approved' | 'rejected' | 'needs_modification';

/** Review result sent back to the Agent. */
export interface ReviewResultPayload {
  type: 'review_result';
  tick_id: number;
  decision: ReviewDecision;
  reason?: string;
  narrative?: string;
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
