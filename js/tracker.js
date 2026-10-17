document.addEventListener("DOMContentLoaded", () => {
    
    // These fixed points are a visual example only. This page has no market-data provider.
    const createSampleChart = (ctxId, color) => {
        const canvasEl = document.getElementById(ctxId);
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;
        
        const dataPoints = [100, 102, 101, 104, 103, 105, 108, 107, 109, 110];
        
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

        return chart;
    };

    // Initialize Charts
    createSampleChart('niftyChart', 'rgba(79, 124, 255, 1)'); // Blue
    createSampleChart('sensexChart', 'rgba(199, 240, 0, 1)'); // Lime

});
