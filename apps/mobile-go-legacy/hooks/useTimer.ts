// @/hooks/useTimer.ts
import { useState, useEffect, useRef } from 'react';

export const useTimer = (interval: number) => {
  const [tick, setTick] = useState(0);
  const savedCallback = useRef<() => void>();

  useEffect(() => {
    const callback = () => setTick(tick => tick + 1);
    savedCallback.current = callback;
  }, []);

  useEffect(() => {
    const tickInterval = setInterval(() => {
      if (savedCallback.current) {
        savedCallback.current();
      }
    }, interval);
    return () => clearInterval(tickInterval);
  }, [interval]);

  return tick;
};
