import { apiRequest, apiUpload, type UploadFile } from './http-client';
import { buildQuery } from './query-string';

import type { PaginatedResponse } from '@/shared-contracts/common-fields.contract';
import type {
  AnswerResponse,
  CommunityAccessResponse,
  CommunitySpace,
  CreateAnswerRequest,
  CreatePostRequest,
  CreateReportRequest,
  ForumCategoryResponse,
  LikeResponse,
  PostResponse,
  PostSummaryResponse,
  SetLikeRequest,
} from '@/shared-contracts/community.contract';

const auth = { authenticated: true } as const;

export interface PostListParams {
  space: CommunitySpace;
  categoryId?: string;
  q?: string;
  mine?: boolean;
  answeredByDoctor?: boolean;
  cursor?: string;
}

/**
 * Community. Reads send the token when there is one (members see the women's
 * space); writes need an account.
 */
export const communityEndpoints = {
  access: () => apiRequest<CommunityAccessResponse>('/community/access', auth),
  categories: () => apiRequest<ForumCategoryResponse[]>('/community/categories', auth),
  posts: (p: PostListParams) =>
    apiRequest<PaginatedResponse<PostSummaryResponse>>(
      `/community/posts${buildQuery({
        limit: 20,
        space: p.space,
        categoryId: p.categoryId,
        q: p.q,
        cursor: p.cursor,
        mine: p.mine ? 'true' : undefined,
        answeredByDoctor: p.answeredByDoctor ? 'true' : undefined,
      })}`,
      auth
    ),
  post: (postId: string) => apiRequest<PostResponse>(`/community/posts/${postId}`, auth),
  answers: (postId: string, cursor?: string) =>
    apiRequest<PaginatedResponse<AnswerResponse>>(`/community/posts/${postId}/answers${buildQuery({ limit: 30, cursor })}`, auth),

  joinWomen: (note?: string) =>
    apiRequest<CommunityAccessResponse>('/community/women/join-request', { ...auth, method: 'POST', body: { note } }),
  createPost: (body: CreatePostRequest) => apiRequest<PostResponse>('/community/posts', { ...auth, method: 'POST', body }),
  removePost: (postId: string) => apiRequest<void>(`/community/posts/${postId}`, { ...auth, method: 'DELETE' }),
  addImage: (postId: string, file: UploadFile) => apiUpload<PostResponse>(`/community/posts/${postId}/images`, file, {}, 'PUT'),
  answer: (postId: string, body: CreateAnswerRequest) =>
    apiRequest<AnswerResponse>(`/community/posts/${postId}/answers`, { ...auth, method: 'POST', body }),
  removeAnswer: (answerId: string) => apiRequest<void>(`/community/answers/${answerId}`, { ...auth, method: 'DELETE' }),
  setLike: (body: SetLikeRequest) => apiRequest<LikeResponse>('/community/likes', { ...auth, method: 'PUT', body }),
  report: (body: CreateReportRequest) => apiRequest<void>('/community/reports', { ...auth, method: 'POST', body }),
};
