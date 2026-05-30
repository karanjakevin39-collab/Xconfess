/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ConfessionFeed } from "../ConfessionFeed";
import { useConfessionsQuery } from "../../../lib/hooks/useConfessionsQuery";
import { usePaginationState } from "../../../lib/hooks/usePaginationState";

// Mock the hooks
jest.mock("../../../lib/hooks/useConfessionsQuery");
jest.mock("../../../lib/hooks/usePaginationState");

// Mock components that might cause issues in simple tests
jest.mock("../ConfessionCard", () => ({
  ConfessionCard: ({ confession }: any) => <div data-testid="confession-card">{confession.content}</div>,
}));

jest.mock("../LoadingSkeleton", () => ({
  ConfessionFeedSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}));

jest.mock("../../common/ErrorState", () => ({
  __esModule: true,
  default: ({ error }: any) => <div data-testid="error-state">{error}</div>,
}));

describe("ConfessionFeed Pagination", () => {
  const mockSetPage = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    (usePaginationState as jest.Mock).mockReturnValue({
      page: 1,
      setPage: mockSetPage,
      limit: 10,
    });
  });

  it("should render confessions and pagination when data is available", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: {
        confessions: [{ id: "1", content: "Confession 1" }, { id: "2", content: "Confession 2" }],
        total: 50,
        hasMore: true,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    expect(screen.getAllByTestId("confession-card")).toHaveLength(2);
    expect(screen.getByText("Confession 1")).toBeInTheDocument();
    expect(screen.getByText("Confession 2")).toBeInTheDocument();
    
    // Check pagination controls
    expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 5")).toBeInTheDocument();
  });

  it("should call setPage when clicking next button", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: {
        confessions: [{ id: "1", content: "Confession 1" }],
        total: 50,
        hasMore: true,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    const nextButton = screen.getByLabelText("Go to next page");
    fireEvent.click(nextButton);

    expect(mockSetPage).toHaveBeenCalledWith(2);
  });

  it("should call setPage when clicking a page number", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: {
        confessions: [{ id: "1", content: "Confession 1" }],
        total: 50,
        hasMore: true,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    const page3Button = screen.getByText("3");
    fireEvent.click(page3Button);

    expect(mockSetPage).toHaveBeenCalledWith(3);
  });

  it("should disable previous button on first page", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: {
        confessions: [{ id: "1", content: "Confession 1" }],
        total: 50,
        hasMore: true,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    const prevButton = screen.getByLabelText("Go to previous page");
    expect(prevButton).toHaveClass("pointer-events-none");
    expect(prevButton).toHaveClass("opacity-50");
  });

  it("should disable next button on last page", () => {
    (usePaginationState as jest.Mock).mockReturnValue({
      page: 5,
      setPage: mockSetPage,
      limit: 10,
    });

    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: {
        confessions: [{ id: "1", content: "Confession 1" }],
        total: 50,
        hasMore: false,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    const nextButton = screen.getByLabelText("Go to next page");
    expect(nextButton).toHaveClass("pointer-events-none");
    expect(nextButton).toHaveClass("opacity-50");
  });

  it("should show loading skeleton when isLoading is true", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("should show error state when error occurs", () => {
    (useConfessionsQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      error: new Error("Network Error"),
      refetch: jest.fn(),
    });

    render(<ConfessionFeed />);

    expect(screen.getByTestId("error-state")).toHaveTextContent("Network Error");
  });
});
