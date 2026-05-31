/* ============================================================
   AquaWatch — About Page Minimalist UI Controller
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Monochromatic Theme Management
    const themeToggle = document.getElementById('themeToggle');
    const htmlTag = document.documentElement;
    const moonIcon = document.querySelector('.moon-icon');
    const sunIcon = document.querySelector('.sun-icon');

    // Defaults to dark mode for that premium tech vibe
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
    
    // Check if the user has successfully logged in via Admin.html
    if (sessionStorage.getItem('aquatrack_admin') === 'true') {
        
        // Un-hide the Command Center from the Navigation Bar
        if (statisticsNavNode) {
            statisticsNavNode.style.display = 'block'; 
        }
        
        // Change the Login button to a Command Center shortcut for Admins
        if (authButton) {
            authButton.innerText = "Command Center";
            authButton.onclick = () => window.location.href = 'Statistics.html';
        }
    }
});