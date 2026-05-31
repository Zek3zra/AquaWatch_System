/* ============================================================
   AquaWatch — Dynamic Map Controller (Public View)
   ============================================================ */

let dbNodes = [];
let activeNode = null;

document.addEventListener('DOMContentLoaded', async () => {
    initThemeManager();
    initMobileNav();
    initAdminCheck();
    
    // Slight delay ensures the image loads its dimensions before scaling
    setTimeout(() => { initPanZoomEngine(); }, 200);
    
    await fetchInitialNodesFromDB();
});

// ==========================================
// SUPABASE DYNAMIC DATA ENGINE
// ==========================================

async function fetchInitialNodesFromDB() {
    if(!window.supabaseClient) return;
    const { data } = await window.supabaseClient.from('dashboard_data').select('*');
    if(!data) return;

    dbNodes = data.map(row => {
        return {
            id: `NODE_0${row.node_id}`, nodeId: row.node_id,
            name: row.node_name || `Dispenser Node ${row.node_id}`,
            location: row.location || 'Campus Setting',
            pinTop: row.pin_top || '50%', pinLeft: row.pin_left || '50%',
            level: row.water_percentage || 0, weight: row.weight_grams || 0,
            status: row.status_label || 'Offline'
        };
    });

    renderDynamicUI();
}

window.addEventListener('aquawatch_sync', (event) => {
    const liveData = event.detail;
    
    liveData.forEach(incomingNode => {
        let existingNode = dbNodes.find(n => n.nodeId === incomingNode.node_id);

        if (existingNode) {
            existingNode.level = incomingNode.water_percentage; 
            existingNode.weight = incomingNode.weight_grams; 
            existingNode.status = incomingNode.status_label;
            
            if(incomingNode.node_name) existingNode.name = incomingNode.node_name;
            if(incomingNode.pin_top) existingNode.pinTop = incomingNode.pin_top;
            if(incomingNode.pin_left) existingNode.pinLeft = incomingNode.pin_left;
        } else {
            dbNodes.push({
                id: `NODE_0${incomingNode.node_id}`, nodeId: incomingNode.node_id,
                name: incomingNode.node_name || `Dispenser Node ${incomingNode.node_id}`, 
                pinTop: incomingNode.pin_top || '50%', pinLeft: incomingNode.pin_left || '50%',
                level: incomingNode.water_percentage || 0, weight: incomingNode.weight_grams || 0,
                status: incomingNode.status_label || 'Offline'
            });
        }
    });

    renderDynamicUI();
});

function getStatusColor(status, pct) {
    if (status === "Offline") return "#64748b";       
    if (status === "No_Gallon" || pct <= 5) return "#ef4444"; 
    if (pct >= 6 && pct <= 30) return "#f59e0b";      
    return "#10b981"; 
}

function renderDynamicUI() {
    renderMapPins();
    renderAccordions();
}

function renderMapPins() {
    const pinContainer = document.getElementById('dynamic-map-pins');
    if (!pinContainer) return;
    pinContainer.innerHTML = ''; 

    dbNodes.forEach(node => {
        const color = getStatusColor(node.status, node.level);
        const isCritical = (node.status === "No_Gallon" || (node.status !== "Offline" && node.level <= 5));
        
        const pinHtml = `
            <div class="map-pin ${isCritical ? 'blink-critical' : ''} ${activeNode === node.nodeId ? 'highlight' : ''}" 
                 id="pin-${node.nodeId}" 
                 style="top: ${node.pinTop}; left: ${node.pinLeft}; background-color: ${color};" 
                 onclick="toggleDetails(${node.nodeId})"
                 title="${node.name} (${node.level}%)">
                <div class="pin-pulse"></div>
            </div>`;
        pinContainer.innerHTML += pinHtml;
    });
}

function renderAccordions() {
    const accordionContainer = document.getElementById('dynamic-accordions');
    if (!accordionContainer) return;
    accordionContainer.innerHTML = ''; 

    dbNodes.forEach(node => {
        const color = getStatusColor(node.status, node.level);
        const isCritical = (node.status === "No_Gallon" || (node.status !== "Offline" && node.level <= 5));
        
        const cardHtml = `
            <div class="accordion-item ${activeNode === node.nodeId ? 'active' : ''}" id="item-${node.nodeId}">
                <div class="accordion-header" onclick="toggleDetails(${node.nodeId})">
                    <div class="header-title">
                        <span class="status-indicator ${isCritical ? 'blink-critical' : ''}" id="indicator-${node.nodeId}" style="background-color: ${color}"></span>
                        ${node.name}
                    </div>
                    <svg class="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="accordion-body">
                    <div class="data-row">
                        <span class="label">Hardware Topology</span> 
                        <span class="badge" style="background-color: ${color}; color: ${node.status === 'Offline' || node.status === 'No_Gallon' || node.level <= 30 ? '#fff' : '#000'}">
                            ${node.status.replace('_', ' ')}
                        </span>
                    </div>
                    <div class="data-row">
                        <span class="label">Calculated Volumetric Load</span> 
                        <strong class="metric-highlight mono">${node.status === 'Offline' ? '--' : node.level}%</strong>
                    </div>
                    <div class="data-row">
                        <span class="label">Active Mass Weight</span> 
                        <span class="mono">${node.status === 'Offline' ? '--' : node.weight.toLocaleString()} g</span>
                    </div>
                </div>
            </div>`;
        accordionContainer.innerHTML += cardHtml;
    });
}

window.toggleDetails = function(nodeId) {
    activeNode = (activeNode === nodeId) ? null : nodeId;
    renderDynamicUI(); 
};

// ============================================================
// FLAWLESS PAN & ZOOM ENGINE (ZERO DEADSPACE)
// ============================================================
function initPanZoomEngine() {
    const mapContainer = document.getElementById('map-container');
    const zoomTarget = document.getElementById('zoom-target');
    let scale = 1, pointX = 0, pointY = 0, startX, startY, isPanning = false;

    if(!mapContainer || !zoomTarget) return;

    function setTransform() { 
        const containerRect = mapContainer.getBoundingClientRect();
        const scaledWidth = containerRect.width * scale;
        const scaledHeight = containerRect.height * scale;

        const minX = Math.min(0, containerRect.width - scaledWidth);
        const minY = Math.min(0, containerRect.height - scaledHeight);

        pointX = Math.max(minX, Math.min(0, pointX));
        pointY = Math.max(minY, Math.min(0, pointY));

        zoomTarget.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`; 
    }

    setTransform();

    mapContainer.addEventListener('wheel', e => {
        if (window.innerWidth <= 900) return; 
        e.preventDefault();
        
        const rect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const xs = (mouseX - pointX) / scale;
        const ys = (mouseY - pointY) / scale;
        
        if (e.deltaY < 0) scale *= 1.2; else scale /= 1.2;
        scale = Math.max(1, Math.min(scale, 5));
        
        if (scale === 1) { 
            pointX = 0; pointY = 0; 
        } else { 
            pointX = mouseX - xs * scale; pointY = mouseY - ys * scale; 
        }
        setTransform();
    });

    mapContainer.addEventListener('mousedown', e => {
        if (window.innerWidth <= 900) return; 
        if (e.target.closest('.map-pin') || e.target.closest('button')) return; 
        e.preventDefault(); startX = e.clientX - pointX; startY = e.clientY - pointY; isPanning = true; mapContainer.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => { isPanning = false; mapContainer.style.cursor = 'grab'; });
    window.addEventListener('mouseleave', () => { isPanning = false; mapContainer.style.cursor = 'grab'; });
    window.addEventListener('mousemove', e => {
        if (window.innerWidth <= 900) return; 
        if (!isPanning) return; e.preventDefault(); pointX = e.clientX - startX; pointY = e.clientY - startY; setTransform();
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => { 
        const rect = mapContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const xs = (centerX - pointX) / scale; 
        const ys = (centerY - pointY) / scale;
        
        scale = Math.min(scale * 1.3, 5); 
        pointX = centerX - xs * scale; 
        pointY = centerY - ys * scale;
        setTransform(); 
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => { 
        const rect = mapContainer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const xs = (centerX - pointX) / scale; 
        const ys = (centerY - pointY) / scale;

        scale = Math.max(scale / 1.3, 1); 
        if (scale === 1) { pointX = 0; pointY = 0; } 
        else { pointX = centerX - xs * scale; pointY = centerY - ys * scale; }
        setTransform(); 
    });

    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => { scale = 1; pointX = 0; pointY = 0; setTransform(); });
}

// ==========================================
// UI & SECURITY MANAGERS
// ==========================================
function initThemeManager() {
    const themeToggle = document.getElementById('themeToggle');
    const htmlTag = document.documentElement;
    const moonIcon = document.querySelector('.moon-icon');
    const sunIcon = document.querySelector('.sun-icon');
    const savedTheme = localStorage.getItem('aquawatch_theme') || 'dark';
    htmlTag.setAttribute('data-theme', savedTheme);
    if(savedTheme === 'dark') { if(moonIcon) moonIcon.style.display = 'none'; if(sunIcon) sunIcon.style.display = 'block'; }
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const newTheme = htmlTag.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            htmlTag.setAttribute('data-theme', newTheme);
            localStorage.setItem('aquawatch_theme', newTheme);
            if(newTheme === 'dark') { moonIcon.style.display = 'none'; sunIcon.style.display = 'block'; } else { moonIcon.style.display = 'block'; sunIcon.style.display = 'none'; }
        });
    }
}

function initMobileNav() {
    document.getElementById('mobileToggle')?.addEventListener('click', () => { document.getElementById('navMenu')?.classList.toggle('active'); });
}

function initAdminCheck() {
    if (sessionStorage.getItem('aquatrack_admin') === 'true') {
        document.getElementById('statisticsNav').style.display = 'block';
    }
}