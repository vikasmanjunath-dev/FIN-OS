document.addEventListener("DOMContentLoaded", () => {
  
  // =========================
  // 1. DYNAMIC PATH DRAWING (THE LINE)
  // =========================
  const pathLine = document.getElementById('pathLine');
  const pathLineFill = document.getElementById('pathLineFill');
  const nodes = document.querySelectorAll('.level-node');
  const journeyContainer = document.querySelector('.journey-container');

  function updatePath() {
    if (!nodes.length || !journeyContainer) return;

    let pathD = "";
    // Get the center X of the container
    const startX = journeyContainer.offsetWidth / 2;
    
    nodes.forEach((node, index) => {
      // Calculate Y position relative to the container
      // This ensures the dots connect perfectly regardless of screen size
      const nodeY = node.offsetTop + (node.offsetHeight / 2);
      
      if (index === 0) {
        pathD += `M ${startX} ${nodeY} `;
      } else {
        pathD += `L ${startX} ${nodeY} `;
      }
    });

    pathLine.setAttribute('d', pathD);
    pathLineFill.setAttribute('d', pathD);
    
    // Reset stroke for animation
    const length = pathLine.getTotalLength();
    pathLineFill.style.strokeDasharray = length;
    pathLineFill.style.strokeDashoffset = length; 
  }

  // Draw immediately and update on resize
  setTimeout(updatePath, 100);
  window.addEventListener('resize', updatePath);


  // =========================
  // 2. BULLETPROOF CARD REVEAL (INTERSECTION OBSERVER)
  // =========================
  // This replaces the old scroll math. It watches for elements appearing on screen.
  
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const node = entry.target;
        const card = node.querySelector('.level-card');
        const marker = node.querySelector('.node-marker');

        // Reveal Animation
        if(card) {
          card.style.opacity = "1";
          card.style.transform = "translateY(0)";
        }
        
        // Highlight Marker
        if(marker) {
          marker.style.background = 'var(--accent)';
          marker.style.color = '#000';
          marker.style.boxShadow = '0 0 20px var(--accent)';
        }
        
        // Stop watching once revealed (keeps it visible)
        cardObserver.unobserve(node);
      }
    });
  }, {
    threshold: 0.15, // Trigger when 15% of the card is visible
    rootMargin: "0px 0px -50px 0px" // Offset slightly for better effect
  });

  // Initialize: Hide cards & Attach Observer
  nodes.forEach(node => {
    const card = node.querySelector('.level-card');
    if(card) {
      card.style.opacity = "0";
      card.style.transform = "translateY(40px)";
      card.style.transition = "all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)";
    }
    cardObserver.observe(node);
  });


  // =========================
  // 3. LINE FILL ANIMATION (SCROLL SYNC)
  // =========================
  const scrollContainer = document.querySelector('.main') || window;

  function syncLine() {
    const containerHeight = document.body.scrollHeight;
    // Use the main container's scroll position if available, else window
    const scrollTop = scrollContainer.scrollTop || window.scrollY;
    const viewHeight = window.innerHeight;
    
    // Calculate percentage scrolled
    const scrollPercent = (scrollTop + viewHeight * 0.5) / containerHeight;
    
    const length = pathLine.getTotalLength();
    if(length > 0) {
      const drawLength = length * Math.min(scrollPercent * 1.5, 1);
      pathLineFill.style.strokeDashoffset = length - drawLength;
    }
  }

  // Attach listener to both potential scroll sources to be safe
  if (document.querySelector('.main')) {
    document.querySelector('.main').addEventListener('scroll', syncLine);
  }
  window.addEventListener('scroll', syncLine);
  
  // Trigger once on load
  setTimeout(syncLine, 200);


  // =========================
  // 4. MINI CHART (Cash Flow)
  // =========================
  const canvas = document.getElementById('flowChart');
  if (canvas) {
      const ctx = canvas.getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['In', 'Out'],
          datasets: [{
            data: [100, 98],
            backgroundColor: ['#C7F000', '#ff4757'],
            borderRadius: 4,
            barThickness: 20
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { display: false }, y: { display: false, max: 120 } },
          layout: { padding: 0 }
        }
      });
  }

});