import React, { useEffect, useRef } from 'react';

const Radar = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 150;
    canvas.height = 150;

    let angle = 0;
    let animationId: number;

    const drawRadar = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 2;
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      
      ctx.strokeStyle = `rgba(${isDark ? '0, 243, 255' : '0, 138, 144'}, 0.3)`;
      ctx.lineWidth = 1;
      
      [0.3, 0.6, 1].forEach(scale => { 
        ctx.beginPath(); 
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2); 
        ctx.stroke(); 
      });
      
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
      
      ctx.save(); 
      ctx.translate(cx, cy); 
      ctx.rotate(angle);
      ctx.beginPath(); 
      ctx.moveTo(0, 0); 
      ctx.arc(0, 0, r, 0, Math.PI / 3); 
      ctx.lineTo(0, 0);
      
      const grad = ctx.createRadialGradient(0,0,0, 0,0,r);
      grad.addColorStop(0, `rgba(${isDark ? '0, 243, 255' : '0, 138, 144'}, 0.6)`);
      grad.addColorStop(1, "transparent");
      
      ctx.fillStyle = grad; 
      ctx.fill(); 
      ctx.restore();
      
      angle += 0.04; 
      animationId = requestAnimationFrame(drawRadar);
    };

    drawRadar();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute right-10 top-2 w-[150px] h-[150px] opacity-60 pointer-events-none"
    />
  );
};

export default Radar;
