import React from 'react';
import { motion } from 'framer-motion';

export type Category = 'all' | 'crypto' | 'stocks' | 'macro';
export type TimeRange = 'all' | '4' | '12' | '24';

interface FilterDockProps {
  activeCat: Category;
  setActiveCat: (c: Category) => void;
  activeImpact: boolean;
  setActiveImpact: (i: boolean) => void;
  activeTime: TimeRange;
  setActiveTime: (t: TimeRange) => void;
}

const FilterDock = ({ activeCat, setActiveCat, activeImpact, setActiveImpact, activeTime, setActiveTime }: FilterDockProps) => {
  return (
    <motion.div 
      initial={{ y: 100, opacity: 0, x: '-50%' }}
      animate={{ y: 0, opacity: 1, x: '-50%' }}
      transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      className="fixed bottom-8 left-1/2 bg-[#0a0e17]/85 backdrop-blur-[25px] border border-white/10 rounded-2xl p-3 flex flex-col gap-2.5 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_0_0_1px_rgba(255,255,255,0.05)] w-max"
    >
      <div className="flex gap-2.5 items-center justify-center">
        {(['all', 'crypto', 'stocks', 'macro'] as Category[]).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`bg-transparent border-none font-mono text-xs font-bold tracking-[1px] px-5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 ${activeCat === cat ? 'bg-white text-[#030508] shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'text-[#888888] hover:bg-white/5 hover:text-white'}`}
          >
            {cat === 'stocks' ? 'EQUITY' : cat === 'all' ? 'ALL SHARDS' : cat.toUpperCase()}
          </button>
        ))}
      </div>
      
      <div className="flex gap-2.5 items-center justify-center bg-black/20 p-1.5 rounded-xl border border-white/5">
        <button
          onClick={() => setActiveImpact(!activeImpact)}
          className={`bg-transparent border border-transparent font-mono text-xs font-bold tracking-[1px] px-5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 ${activeImpact ? 'bg-[#ff4757]/15 border-[#ff4757] text-[#ff4757]' : 'text-[#888888] hover:bg-white/5 hover:text-white'}`}
        >
          🔥 HIGH IMPACT
        </button>
        
        <div className="w-[1px] h-5 bg-[#00f3ff]/15 mx-1"></div>
        
        <select 
          value={activeTime}
          onChange={(e) => setActiveTime(e.target.value as TimeRange)}
          className="bg-white/5 text-white border border-[#00f3ff]/15 px-4 py-2 rounded-lg font-mono text-xs cursor-pointer outline-none hover:bg-white/10 transition-colors"
        >
          <option value="all">🕒 ANY TIME</option>
          <option value="4">🕒 LAST 4 HOURS</option>
          <option value="12">🕒 LAST 12 HOURS</option>
          <option value="24">🕒 LAST 24 HOURS</option>
        </select>
      </div>
    </motion.div>
  );
};

export default FilterDock;
