import { QueryClient } from '@tanstack/react-query';

/**
 * Global TanStack Query defaults tuned for Google Apps Script HtmlService:
 * - No automatic window-focus refetches (manual refresh only on Dashboard).
 * - Zero automatic retries on mutations (No Auto-Retry for non-ACID Sheets writes).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
