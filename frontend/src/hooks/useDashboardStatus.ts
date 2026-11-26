import { useQuery } from '@tanstack/react-query';
import { useGasTransport } from '@/api/TransportContext';
import type { DashboardStatusData } from '@/api/types';

export const DASHBOARD_STATUS_QUERY_KEY = ['dashboardStatus'] as const;

export function useDashboardStatus() {
  const transport = useGasTransport();
  return useQuery<DashboardStatusData>({
    queryKey: DASHBOARD_STATUS_QUERY_KEY,
    queryFn: () => transport.getDashboardStatus(),
  });
}
