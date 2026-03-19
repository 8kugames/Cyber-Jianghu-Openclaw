/**
 * Cyber-Jianghu Review Tool
 *
 * 用于 Observer Agent 审查 Player Agent 意图的工具
 */

// 审查决定类型
export type ReviewDecision = 'approved' | 'rejected';

// 审查状态
export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'timeout_approved';

// 人设摘要
export interface PersonaSummary {
  name: string;
  gender: string;
  age: number;
  personality: string[];
  values: string[];
}

// 待审查意图
export interface PendingReview {
  intent_id: string;
  agent_id: string;
  intent: {
    action_type: string;
    action_data: unknown;
  };
  persona_summary: PersonaSummary;
  world_context: string;
  created_at: string;
  deadline: string;
}

// 审查提交请求
export interface ReviewSubmission {
  result: ReviewDecision;
  reason: string;
  narrative?: string;
}

// 审查结果
export interface ReviewResult {
  intent_id: string;
  status: ReviewStatus;
  decision?: ReviewDecision;
  reason?: string;
  narrative?: string;
  reviewed_at: string;
}

// 审查错误
export interface ReviewErrorResponse {
  error: string;
  message: string;
}
