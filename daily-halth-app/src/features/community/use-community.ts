import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { communityEndpoints, type PostListParams } from '@/api/community-endpoints';
import type { UploadFile } from '@/api/http-client';
import type {
  CreateAnswerRequest,
  CreatePostRequest,
  CreateReportRequest,
  PostResponse,
  SetLikeRequest,
} from '@/shared-contracts/community.contract';

export const communityKeys = {
  all: ['community'] as const,
  access: ['community', 'access'] as const,
  categories: ['community', 'categories'] as const,
  posts: (p: Omit<PostListParams, 'cursor'>) => ['community', 'posts', p] as const,
  post: (id: string) => ['community', 'post', id] as const,
  answers: (id: string) => ['community', 'answers', id] as const,
};

export function useCommunityAccess() {
  return useQuery({ queryKey: communityKeys.access, queryFn: communityEndpoints.access, staleTime: 60_000 });
}

export function useForumCategories() {
  return useQuery({ queryKey: communityKeys.categories, queryFn: communityEndpoints.categories, staleTime: 5 * 60_000 });
}

export function usePosts(params: Omit<PostListParams, 'cursor'>, enabled = true) {
  return useInfiniteQuery({
    queryKey: communityKeys.posts(params),
    queryFn: ({ pageParam }) => communityEndpoints.posts({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
    enabled,
  });
}

export function usePost(postId: string) {
  return useQuery({ queryKey: communityKeys.post(postId), queryFn: () => communityEndpoints.post(postId) });
}

export function useAnswers(postId: string) {
  return useInfiniteQuery({
    queryKey: communityKeys.answers(postId),
    queryFn: ({ pageParam }) => communityEndpoints.answers(postId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.cursor ?? undefined) : undefined),
  });
}

export function useJoinWomen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) => communityEndpoints.joinWomen(note),
    onSuccess: (access) => client.setQueryData(communityKeys.access, access),
  });
}

export function useCreatePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, images }: { body: CreatePostRequest; images: UploadFile[] }) => {
      let post: PostResponse = await communityEndpoints.createPost(body);
      // Pictures go one by one after the post exists (each is checked and resized on the server).
      for (const image of images) post = await communityEndpoints.addImage(post.id, image);
      return post;
    },
    onSuccess: (post) => {
      client.setQueryData(communityKeys.post(post.id), post);
      void client.invalidateQueries({ queryKey: ['community', 'posts'] });
    },
  });
}

export function usePostActions(postId: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: communityKeys.post(postId) });
    void client.invalidateQueries({ queryKey: communityKeys.answers(postId) });
    void client.invalidateQueries({ queryKey: ['community', 'posts'] });
  };
  return {
    answer: useMutation({
      mutationFn: (body: CreateAnswerRequest) => communityEndpoints.answer(postId, body),
      onSuccess: refresh,
    }),
    removePost: useMutation({
      mutationFn: () => communityEndpoints.removePost(postId),
      onSuccess: () => void client.invalidateQueries({ queryKey: ['community', 'posts'] }),
    }),
    removeAnswer: useMutation({ mutationFn: (answerId: string) => communityEndpoints.removeAnswer(answerId), onSuccess: refresh }),
    like: useMutation({ mutationFn: (body: SetLikeRequest) => communityEndpoints.setLike(body), onSuccess: refresh }),
    report: useMutation({ mutationFn: (body: CreateReportRequest) => communityEndpoints.report(body) }),
  };
}
