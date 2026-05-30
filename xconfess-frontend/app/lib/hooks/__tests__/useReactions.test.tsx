import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import { useReactions } from "@/app/lib/hooks/useReactions";
import type {
  GetConfessionByIdResult,
  GetConfessionsResult,
} from "@/app/lib/api/confessions";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { addReaction } from "@/app/lib/api/reactions";

jest.mock("@/app/lib/api/reactions", () => ({
  addReaction: jest.fn(),
}));

const mockAddReaction = addReaction as jest.MockedFunction<typeof addReaction>;

function buildConfession(reactions = { like: 2, love: 1 }) {
  return {
    id: "confession-1",
    content: "Test confession",
    createdAt: "2026-04-23T00:00:00.000Z",
    viewCount: 9,
    commentCount: 2,
    reactions,
    author: {
      id: "anonymous",
      username: "Anonymous",
    },
  };
}

function createTestHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}

function seedConfessionCache(queryClient: QueryClient) {
  const listKey = queryKeys.confessions.list({});
  const detailKey = queryKeys.confessions.detail("confession-1");

  queryClient.setQueryData<InfiniteData<GetConfessionsResult>>(listKey, {
    pageParams: [1],
    pages: [
      {
        confessions: [buildConfession()],
        hasMore: false,
        page: 1,
      },
    ],
  });

  queryClient.setQueryData<GetConfessionByIdResult>(detailKey, {
    ...buildConfession(),
  });

  return { listKey, detailKey };
}

describe("useReactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("patches feed/detail caches immediately and avoids broad invalidation when server returns counts", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey, detailKey } = seedConfessionCache(queryClient);
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");

    let resolveReaction:
      | ((value: Awaited<ReturnType<typeof addReaction>>) => void)
      | undefined;
    const reactionPromise = new Promise<Awaited<ReturnType<typeof addReaction>>>(
      (resolve) => {
        resolveReaction = resolve;
      },
    );

    mockAddReaction.mockReturnValue(reactionPromise);

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      void result.current.addReaction("confession-1", "like");
      await Promise.resolve();
    });

    await waitFor(() => {
      const optimisticList =
        queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
      const optimisticDetail =
        queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

      expect(optimisticList?.pages[0].confessions[0].reactions.like).toBe(3);
      expect(optimisticDetail?.reactions.like).toBe(3);
      expect(result.current.optimisticState?.counts.like).toBe(3);
    });

    await act(async () => {
      resolveReaction?.({
        ok: true,
        data: {
          success: true,
          reactions: { like: 3, love: 1 },
        },
      });
      await reactionPromise;
    });

    await waitFor(() => {
      expect(result.current.optimisticState).toBe(null);
    });

    const settledList = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    const settledDetail = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

    expect(settledList?.pages[0].confessions[0].reactions.like).toBe(3);
    expect(settledDetail?.reactions.like).toBe(3);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("rolls back cache updates when the reaction API returns an application error", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey, detailKey } = seedConfessionCache(queryClient);

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: {
        message: "Reaction failed",
        code: "API_ERROR",
      },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    let response: Awaited<ReturnType<typeof result.current.addReaction>> | undefined;
    await act(async () => {
      response = await result.current.addReaction("confession-1", "love");
    });

    const rolledBackList = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    const rolledBackDetail = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);

    expect(response).toEqual({
      ok: false,
      error: {
        message: "Reaction failed",
        code: "MUTATION_ERROR",
      },
    });
    expect(rolledBackList?.pages[0].confessions[0].reactions).toEqual({
      like: 2,
      love: 1,
    });
    expect(rolledBackDetail?.reactions).toEqual({
      like: 2,
      love: 1,
    });
    expect(result.current.optimisticState).toBe(null);
    expect(result.current.error?.message).toBe("Reaction failed");
  });

  it("rolls back the feed list cache when the reaction API fails (feed surface)", async () => {
    const { queryClient, wrapper } = createTestHarness();

    // Seed only the list cache — simulates a user reacting from the feed page
    // without having previously visited the detail page.
    const listKey = queryKeys.confessions.list({});
    queryClient.setQueryData<InfiniteData<GetConfessionsResult>>(listKey, {
      pageParams: [1],
      pages: [{ confessions: [buildConfession()], hasMore: false, page: 1 }],
    });

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Server error", code: "API_ERROR" },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "like");
    });

    const rolledBack = queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);
    expect(rolledBack?.pages[0].confessions[0].reactions).toEqual({ like: 2, love: 1 });
    expect(result.current.optimisticState).toBeNull();
    expect(result.current.error?.message).toBe("Server error");
  });

  it("rolls back the detail cache when the reaction API fails (detail surface)", async () => {
    const { queryClient, wrapper } = createTestHarness();

    // Seed only the detail cache — simulates a user reacting from the
    // confession detail page without the feed being loaded in memory.
    const detailKey = queryKeys.confessions.detail("confession-1");
    queryClient.setQueryData<GetConfessionByIdResult>(detailKey, { ...buildConfession() });

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Server error", code: "API_ERROR" },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "love");
    });

    const rolledBack = queryClient.getQueryData<GetConfessionByIdResult>(detailKey);
    expect(rolledBack?.reactions).toEqual({ like: 2, love: 1 });
    expect(result.current.optimisticState).toBeNull();
    expect(result.current.error?.message).toBe("Server error");
  });

  it("shows rate limit error with retryAfter seconds available", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey } = seedConfessionCache(queryClient);

    mockAddReaction.mockResolvedValue({
      ok: false,
      error: { message: "Too many requests", code: "TOO_MANY_REQUESTS", retryAfter: 30 },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 } }),
      { wrapper },
    );

    let response: Awaited<ReturnType<typeof result.current.addReaction>> | undefined;
    await act(async () => {
      response = await result.current.addReaction("confession-1", "like");
    });

    expect(response?.error.retryAfter).toBe(30);
    expect(listKey).toBeDefined();
  });

  it("does not optimistically update when user already has the same reaction type", async () => {
    const { queryClient, wrapper } = createTestHarness();
    const { listKey } = seedConfessionCache(queryClient);

    // Backend returns existing reaction (success, but no count change)
    mockAddReaction.mockResolvedValue({
      ok: true,
      data: { success: true, reactions: { like: 2, love: 1 } },
    });

    const { result } = renderHook(
      () => useReactions({ initialCounts: { like: 2, love: 1 }, initialUserReaction: "like" }),
      { wrapper },
    );

    await act(async () => {
      await result.current.addReaction("confession-1", "like");
    });

    const optimisticList =
      queryClient.getQueryData<InfiniteData<GetConfessionsResult>>(listKey);

    // Count should NOT have been incremented (user already had this reaction)
    // The hook skips optimistic update for already-reacted cases
    expect(optimisticList?.pages[0].confessions[0].reactions.like).toBe(2);
    expect(result.current.optimisticState).toBeNull();
  });
});
