import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntelItem } from '../hooks/useIntelFeed';
import NewsCard from './NewsCard';

interface NewsGridProps {
  items: IntelItem[];
  loading: boolean;
}

const NewsGrid = ({ items, loading }: NewsGridProps) => {
  if (loading) {
    return (
      <div className="text-center py-[100px] w-full">
        <div className="font-mono text-xl text-[#00f3ff] tracking-[3px] animate-blink">
          DECRYPTING INCOMING PACKETS...
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-[100px] w-full">
        <div className="font-mono text-xl text-[#888888] tracking-[3px]">
          NO ACTIVE SHARDS FOUND.
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-[1] pb-[150px]">
      <div className="overflow-x-auto overflow-y-hidden custom-scrollbar -mx-10 px-10 pb-6">
        <div 
          className="grid grid-rows-2 lg:grid-rows-3 grid-flow-col auto-cols-[300px] lg:auto-cols-[320px] gap-6 min-h-[50vh] snap-x snap-mandatory"
          style={{ paddingRight: '40px' }}
        >
          <AnimatePresence>
            {items.map((item) => (
              <div key={item.id} className="snap-start h-full">
                <NewsCard item={item} />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default NewsGrid;
