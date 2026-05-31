/* ============================================================
   AquaWatch — Minimalist UI Controller
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Monochromatic Theme Management
    const themeToggle = document.getElementById('themeToggle');
    const htmlTag = document.documentElement;
    const moonIcon = document.querySelector('.moon-icon');
    const sunIcon = document.querySelector('.sun-icon');

    const savedTheme = localStorage.getItem('aquawatch_theme') || 'dark'; 
    htmlTag.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = htmlTag.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            htmlTag.setAttribute('data-theme', newTheme);
            localStorage.setItem('aquawatch_theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!moonIcon || !sunIcon) return;
        if (theme === 'dark') {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        } else {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        }
    }

    // 2. Mobile Navigation Toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    // 3. Admin Authorization Check & UI Security
    const statisticsNavNode = document.getElementById('statisticsNav');
    const authButton = document.getElementById('authButton');
    
    if (sessionStorage.getItem('aquatrack_admin') === 'true') {
        if (statisticsNavNode) {
            statisticsNavNode.style.display = 'block'; 
        }
        if (authButton) {
            authButton.innerText = "Command Center";
            authButton.onclick = () => window.location.href = 'Statistics.html';
        }
    }

    // 4. Stark Metric Counter Animations
    setTimeout(() => {
        animateMetric(document.getElementById('animN1'), 2);   
        animateMetric(document.getElementById('animN2'), 99);  
        animateMetric(document.getElementById('animN3'), 2);   
        animateMetric(document.getElementById('animN4'), 5);   
    }, 150);
});

function animateMetric(element, targetValue, durationMs = 1200) {
    if (!element) return;
    
    let currentValue = 0;
    const updateFrequency = durationMs / 60; 
    
    const animationTimer = setInterval(() => {
        currentValue += targetValue / 60;
        let roundedValue = Math.min(Math.round(currentValue), targetValue);
        
        element.textContent = roundedValue.toLocaleString();
        
        if (currentValue >= targetValue) { 
            element.textContent = targetValue.toLocaleString(); 
            clearInterval(animationTimer); 
        }
    }, updateFrequency);
}