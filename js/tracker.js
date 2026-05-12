document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. SIMULATED LIVE CHARTS (NIFTY & SENSEX) ---
    // We create a "heartbeat" chart that updates every few seconds to look like live trading data.

    const createLiveChart = (ctxId, color) => {
        const ctx = document.getElementById(ctxId).getContext('2d');
        
        // Initial fake data
        let dataPoints = [100, 102, 101, 104, 103, 105, 108, 107, 109, 110];
        
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(10).fill(''),
                datasets: [{
                    data: dataPoints,
                    borderColor: color,
                    borderWidth: 2,
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                        gradient.addColorStop(0, color.replace('1)', '0.5)')); // Opacity 0.5
                        gradient.addColorStop(1, 'rgba(0,0,0,0)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.4, // Smooth curves
                    pointRadius: 0 // Hide points for clean look
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                animation: { duration: 1000 }
            }
        });

        // Simulate "Live" updates
        setInterval(() => {
            const lastVal = dataPoints[dataPoints.length - 1];
            // Random movement between -2 and +2
            const move = (Math.random() - 0.5) * 4; 
            const newVal = lastVal + move;

            // Update Chart Data
            dataPoints.shift(); // Remove first
            dataPoints.push(newVal); // Add new
            
            chart.data.datasets[0].data = dataPoints;
            chart.update();

            // Update Text Price Number briefly to match direction
            const priceId = ctxId === 'niftyChart' ? 'niftyPrice' : 'sensexPrice';
            const priceEl = document.getElementById(priceId);
            
            // Format number nicely
            // This is just visual fluff, logic doesn't need to be perfect
            let currentPrice = parseFloat(priceEl.innerText.replace(/,/g, ''));
            let newPrice = currentPrice + (move * 10);
            priceEl.innerText = newPrice.toLocaleString('en-IN', {maximumFractionDigits: 2});
            
            // Color flash
            priceEl.style.color = move > 0 ? '#C7F000' : '#ff4757';
            setTimeout(() => { priceEl.style.color = '#fff'; }, 500);

        }, 2000); // Update every 2 seconds
    };

    // Initialize Charts
    createLiveChart('niftyChart', 'rgba(79, 124, 255, 1)'); // Blue
    createLiveChart('sensexChart', 'rgba(199, 240, 0, 1)'); // Lime

});