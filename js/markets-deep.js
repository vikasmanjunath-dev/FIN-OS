document.addEventListener("DOMContentLoaded", () => {
  
  const container = document.getElementById('scrollContainer');
  const progressBar = document.getElementById('progressBar');
  const tocLinks = document.querySelectorAll('.toc-link');
  const chapters = document.querySelectorAll('.chapter');

  // 1. PROGRESS BAR LOGIC
  container.addEventListener('scroll', () => {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    const scrolled = (scrollTop / scrollHeight) * 100;
    
    progressBar.style.width = scrolled + "%";

    // 2. ACTIVE CHAPTER HIGHLIGHT
    chapters.forEach(chapter => {
      const rect = chapter.getBoundingClientRect();
      const id = chapter.getAttribute('id');
      
      // If chapter is in the middle of the screen
      if(rect.top >= 0 && rect.top < window.innerHeight * 0.5) {
        
        // Update TOC
        tocLinks.forEach(link => {
          link.classList.remove('active');
          if(link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          }
        });

        // Focus Effect
        chapters.forEach(c => c.style.opacity = '0.3'); // Dim others
        chapter.style.opacity = '1'; // Highlight current
      }
    });
  });

  // 3. SMOOTH SCROLL FOR TOC LINKS
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);
      
      targetSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  });

});