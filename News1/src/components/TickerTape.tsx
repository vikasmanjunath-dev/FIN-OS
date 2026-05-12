import React from 'react';
import { MarketItem } from '../hooks/useIntelFeed';

interface TickerTapeProps {
  markets: MarketItem[];
}

const TickerTape = ({ markets }: TickerTapeProps) => {
  if (!markets || markets.length === 0) return null;

  const content = markets.map((m, idx) => (
    <span key={idx} className="mr-10">
      <span className="text-white font-bold">{m.name}</span>{' '}
      <span className={m.trend === 'up' ? 'text-[#C7F000]' : 'text-[#ff4757]'}>
        {m.trend === 'up' ? '▲' : '▼'} {m.value}
      </span>
    </span>
  ));

  return (
    <div className="relative z-[1] w-full bg-[#00f3ff]/5 border-b border-[#00f3ff]/15 overflow-hidden py-2.5 mb-10">
      <div className="ticker inline-block whitespace-nowrap font-mono text-xs text-[#888888]">
        <div className="inline-block">{content}</div>
        <div className="inline-block">{content}</div>
      </div>
    </div>
  );
};

export default TickerTape;
