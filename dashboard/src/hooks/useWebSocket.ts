import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';

export function useWebSocket(url: string) {
  const { setConnected, updateMetrics, addTransaction } = useStore();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (url === 'mock') {
      setConnected(true);
      const interval = setInterval(() => {
        updateMetrics({
          activeUsers: Math.floor(1000 + Math.random() * 500),
          fraudAlerts: Math.floor(Math.random() * 20)
        });
        addTransaction({
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          amount: Math.floor(Math.random() * 2000) + 100
        });
      }, 3000);
      return () => clearInterval(interval);
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'METRICS') {
          updateMetrics({
            activeUsers: data.activeUsers,
            fraudAlerts: data.fraudAlerts,
          });
        } else if (data.type === 'TRANSACTION') {
          addTransaction({
            time: new Date().toLocaleTimeString(),
            amount: data.amount
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [url, setConnected, updateMetrics, addTransaction]);

  return wsRef.current;
}
