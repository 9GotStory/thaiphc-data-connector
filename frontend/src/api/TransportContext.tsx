import { createContext, useContext, type ReactNode } from 'react';
import type { GasRpcTransport } from './transport';

const GasTransportContext = createContext<GasRpcTransport | null>(null);

export function GasTransportProvider({
  transport,
  children,
}: {
  transport: GasRpcTransport;
  children: ReactNode;
}) {
  return <GasTransportContext.Provider value={transport}>{children}</GasTransportContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGasTransport(): GasRpcTransport {
  const transport = useContext(GasTransportContext);
  if (!transport) {
    throw new Error('useGasTransport must be used inside GasTransportProvider');
  }
  return transport;
}
