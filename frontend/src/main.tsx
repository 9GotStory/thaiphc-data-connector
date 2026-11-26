import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GasTransportProvider } from '@/api/TransportContext';
import { createDefaultGasTransport } from '@/api/transport';
import { App } from '@/App';
import { queryClient } from '@/lib/queryClient';
import '@/index.css';

const transport = createDefaultGasTransport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <GasTransportProvider transport={transport}>
        <App />
      </GasTransportProvider>
    </QueryClientProvider>
  </StrictMode>,
);
