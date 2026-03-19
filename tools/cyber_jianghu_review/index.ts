/**
 * Cyber-Jianghu Review Tool
 *
 * Observer Agent 使用的审查工具
 *
 * 用于审查 Player Agent 的意图是否符合人设
 */

import type { PendingReview, ReviewDecision } from './types.js';
import { ReviewHttpClient, ReviewError } from './http-client.js';

export interface ReviewToolOptions {
  /** Player Agent 的 HTTP API 地址 */
  playerApiUrl: string;
  /** 请求超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * 创建审查工具实例
 */
export function createReviewTool(options: ReviewToolOptions) {
  const client = new ReviewHttpClient(
    options.playerApiUrl,
    options.timeoutMs,
  );

  return {
    /**
     * 获取待审查的意图列表
     */
    async getPendingReviews(): Promise<PendingReview[]> {
      try {
        return await client.getPendingReviews();
      } catch (error) {
        if (error instanceof ReviewError) {
          throw error;
        }
        throw new Error(`获取待审查列表失败: ${error}`);
      }
    },

    /**
     * 提交审查结果
     *
     * @param intentId 意图 ID
     * @param decision 审查决定（approved/rejected）
     * @param reason 审查理由
     * @param narrative 叙事描述（可选，仅批准时使用）
     */
    async submitReview(
      intentId: string,
      decision: ReviewDecision,
      reason: string,
      narrative?: string,
    ): Promise<void> {
      try {
        await client.submitReview(intentId, {
          result: decision,
          reason,
          narrative,
        });
      } catch (error) {
        if (error instanceof ReviewError) {
          throw error;
        }
        throw new Error(`提交审查失败: ${error}`);
      }
    },

    /**
     * 轮询并审查待处理的意图
     *
     * @param onReview 审查回调函数，返回审批决定和理由
     * @returns 本次审查的意图数量
     */
    async processPendingReviews(
      onReview: (review: PendingReview) => {
        decision: ReviewDecision;
        reason: string;
        narrative?: string;
      },
    ): Promise<number> {
      const pending = await this.getPendingReviews();

      if (pending.length === 0) {
        return 0;
      }

      let processed = 0;
      for (const review of pending) {
        try {
          const { decision, reason, narrative } = onReview(review);
          await this.submitReview(
            review.intent_id,
            decision,
            reason,
            narrative,
          );
          processed++;
        } catch (error) {
          console.error(
            `[Review] 处理意图 ${review.intent_id} 失败:`,
            error,
          );
        }
      }

      return processed;
    },
  };
}

// 导出类型
export * from './types.js';
export { ReviewError } from './http-client.js';
