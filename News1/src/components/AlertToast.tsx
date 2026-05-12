import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IntelItem } from '../hooks/useIntelFeed';
import { X } from 'lucide-react';

interface AlertToastProps {
  alerts: IntelItem[];
  onRemove: (id: string) => void;
}

const AlertToast: React.FC<AlertToastProps> = ({ alerts, onRemove }) => {
  return (
    <div className="fixed top-6 right-6 z-[1000] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {alerts.map((alert) => (
          <ToastItem key={alert.id} alert={alert} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
};

interface ToastItemProps {
  alert: IntelItem;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ alert, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(alert.id);
    }, 8000);
    return () => clearTimeout(timer);
  }, [alert.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 400 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 400, scale: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="pointer-events-auto bg-[#0a0e17]/95 backdrop-blur-md border border-[#ff4757] shadow-[0_10px_40px_rgba(255,71,87,0.2)] p-4 rounded-xl w-[320px] flex flex-col gap-2"
    >
      <div className="flex justify-between items-center">
        <div className="font-mono text-[0.65rem] font-extrabold text-[#ff4757] uppercase tracking-[2px] flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-[#ff4757] rounded-full animate-blink"></div>
          High Impact Alert
        </div>
        <button 
          onClick={() => onRemove(alert.id)}
          className="bg-transparent border-none text-[#888888] hover:text-white cursor-pointer transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <h4 className="font-manrope font-bold text-sm leading-tight text-white m-0">
        {alert.title}
      </h4>
      <div className="flex justify-between items-center mt-1">
        <span className="font-mono text-[0.7rem] text-[#888888]">{alert.source}</span>
      </div>
    </motion.div>
  );
};

export default AlertToast;
