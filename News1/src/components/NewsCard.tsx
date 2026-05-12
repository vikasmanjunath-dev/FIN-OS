import React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { IntelItem } from '../hooks/useIntelFeed';
import { ArrowRight } from 'lucide-react';

interface NewsCardProps {
  item: IntelItem;
}

const timeAgo = (timestamp: number) => {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  const hrs = Math.floor(seconds / 3600);
  if (hrs > 24) return Math.floor(hrs / 24) + "d ago";
  if (hrs > 0) return hrs + "h ago";
  const mins = Math.floor(seconds / 60);
  if (mins > 0) return mins + "m ago";
  return "Just now";
};

const NewsCard = ({ item }: NewsCardProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["12deg", "-12deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-12deg", "12deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const typeColorClass = {
    crypto: 'bg-[#B026FF] shadow-[0_0_15px_#B026FF]',
    stocks: 'bg-[#00F3FF] shadow-[0_0_15px_#00F3FF]',
    macro: 'bg-[#C7F000] shadow-[0_0_15px_#C7F000]'
  }[item.type] || 'bg-gray-500';

  const tagBorderColorClass = {
    crypto: 'border-[#B026FF]/30 text-[#B026FF]',
    stocks: 'border-[#00F3FF]/30 text-[#00F3FF]',
    macro: 'border-[#C7F000]/30 text-[#C7F000]'
  }[item.type] || 'border-gray-500 text-gray-400';

  return (
    <motion.a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col justify-between bg-[#0a0e17]/60 backdrop-blur-xl border border-[#00f3ff]/15 rounded-xl p-4 no-underline text-white preserve-3d h-full"
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
      }}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      layout
    >
      <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl transition-all duration-300 ${typeColorClass}`}></div>
      
      <div>
        <div className="flex justify-between items-center font-mono text-[10px] text-[#888888] mb-3">
          <div className="flex gap-2 items-center">
            <span className={`px-2 py-0.5 rounded bg-white/5 border tracking-[1px] uppercase ${tagBorderColorClass}`}>
              {item.type}
            </span>
            {item.high_impact && (
              <span className="bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/40 px-1.5 py-0.5 rounded font-extrabold animate-pulse">
                🔥 HIGH IMPACT
              </span>
            )}
          </div>
          <span>{timeAgo(item.timestamp)}</span>
        </div>

        <h3 className="text-sm leading-snug font-bold m-0 mb-3 font-manrope line-clamp-3">
          {item.title}
        </h3>
      </div>

      <div className="flex justify-between items-center border-t border-dashed border-[#00f3ff]/15 pt-3 mt-auto">
        <span className="font-extrabold text-[10px] text-[#888888] uppercase truncate max-w-[150px]">{item.source}</span>
        <span className="font-mono font-extrabold text-[10px] text-white transition-transform duration-300 group-hover:translate-x-2 flex items-center gap-1.5 shrink-0">
          DECRYPT <ArrowRight size={12} />
        </span>
      </div>
    </motion.a>
  );
};

export default NewsCard;
