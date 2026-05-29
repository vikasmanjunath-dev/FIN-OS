import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntelItem } from '../hooks/useIntelFeed';
import NewsCard from './NewsCard';
import type { UserContext } from '../hooks/useUserContext';

interface NewsGridProps {
  items:    IntelItem[];   // filtered/visible items
  allItems: IntelItem[];   // full unfiltered feed — passed to Arya for cross-reference
  loading:  boolean;
  userCtx:  UserContext;
}

const NewsGrid = ({ items, allItems, loading, userCtx }: NewsGridProps) => {
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
      <div className="text-center py-[100px] w-full flex flex-col items-center gap-3">
        <div className="font-mono text-xl text-[#888888] tracking-[3px]">
          NO ACTIVE SHARDS FOUND.
        </div>
        <div className="font-mono text-xs text-[#555555]">
          Try changing the category or time filter below.
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
                <NewsCard item={item} allItems={allItems} userCtx={userCtx} />
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default NewsGrid;
