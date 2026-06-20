/* ═══════════════════════════════════════════════════════════════
   PREMIUM LANDING PAGE JS LOGIC
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. SCROLL REVEALS ── (one-shot: unobserve after animating in)
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('active');
      if (entry.target.classList.contains('diagram-container')) {
        const path = entry.target.querySelector('.path-line');
        if (path) path.classList.add('draw');
      }
      // Stop tracking this element — it has already animated
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  const revealEls = document.querySelectorAll('.reveal, .diagram-container');
  revealEls.forEach(el => revealObserver.observe(el));

  // Disconnect entirely if no elements (or if page is torn down)
  if (!revealEls.length) revealObserver.disconnect();

  // ── 2. 3D BENTO HOVER + GLOW ──
  const bentoCards = document.querySelectorAll('.bento-card');
  bentoCards.forEach(card => {
    const onMove = e => {
      const rect    = card.getBoundingClientRect();
      const x       = e.clientX - rect.left;
      const y       = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
      const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -5;
      const rotateY = ((x - rect.width  / 2) / (rect.width  / 2)) *  5;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02,1.02,1.02)`;
    };
    const onLeave = () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    };
    card.addEventListener('mousemove',  onMove);
    card.addEventListener('mouseleave', onLeave);
  });

  // ── 3. HERO CANVAS PARTICLES ──
  const canvas = document.getElementById('hero-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width, height, rafId;

    const mouse = { x: -1000, y: -1000 };

    const onMouseMove = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('mousemove', onMouseMove);

    const onResize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    onResize();

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x  = Math.random() * width;
        this.y  = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.baseSize = Math.random() * 1.5 + 0.5;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0) this.x = width;
        if (this.x > width)  this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
        const dx = mouse.x - this.x, dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < 150) {
          const force = (150 - dist) / 150;
          this.x -= (dx / dist) * force * 2;
          this.y -= (dy / dist) * force * 2;
        }
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.baseSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      }
    }

    const particles = Array.from({ length: 150 }, () => new Particle());

    function animate() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(p => { p.update(); p.draw(); });
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 15000) {
            ctx.strokeStyle = `rgba(204,255,0,${0.15 - d2 / 100000})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      rafId = requestAnimationFrame(animate);
    }
    animate();

    // Pause RAF when tab is hidden, resume when visible — saves CPU/battery
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        rafId = requestAnimationFrame(animate);
      }
    });

    // Clean up if the landing page element is ever removed from DOM
    const cleanup = new MutationObserver(() => {
      if (!document.body.contains(canvas)) {
        cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize',    onResize);
        cleanup.disconnect();
      }
    });
    cleanup.observe(document.body, { childList: true, subtree: false });
  }

});
