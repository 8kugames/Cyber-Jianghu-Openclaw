/**
 * HTTP Client for Review API
 *
 * 与 Player Agent 的审查 API 通信
 */

import type {
  PendingReview,
  ReviewSubmission,
  ReviewResult,
  ReviewErrorResponse,
} from './types.js';

export class ReviewHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 5000,
  ) {}

  /**
   * 获取待审查意图列表
   */
  async getPendingReviews(): Promise<PendingReview[]> {
    const response = await this.request<PendingReview[]>(
      '/api/v1/review/pending',
    );
    return response;
  }

  /**
   * 提交审查结果
   */
  async submitReview(
    intentId: string,
    submission: ReviewSubmission,
  ): Promise<ReviewResult> {
    const response = await this.request<ReviewResult>(
      `/api/v1/review/${intentId}`,
      {
        method: 'POST',
        body: JSON.stringify(submission),
      },
    );
    return response;
  }

  /**
   * 获取审查状态
   */
  async getReviewStatus(intentId: string): Promise<ReviewResult> {
    const response = await this.request<ReviewResult>(
      `/api/v1/review/${intentId}/status`,
    );
    return response;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: ReviewErrorResponse = await response
          .json()
          .catch(() => ({
            error: 'unknown_error',
            message: `HTTP ${response.status}`,
          }));
        throw new ReviewError(error.message, error.error);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ReviewError) {
        throw error;
      }
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new ReviewError(
          `无法连接到 Player Agent (${this.baseUrl})`,
          'connection_error',
        );
      }
      throw new ReviewError(
        `请求失败: ${error instanceof Error ? error.message : String(error)}`,
        'request_error',
      );
    }
  }
}

export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}
