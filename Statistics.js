/* ============================================================
   AquaWatch — 100% Database-Driven Admin Controller
   ============================================================ */

if (sessionStorage.getItem('aquatrack_admin') !== 'true') {
    window.location.href = 'Homepage.html';
}

let dbNodes = [];
let dailyRefills = 0;
let connectionDrops = 0;
let nodeStats = {}; 
let currentActiveNodeView = null; 

let globalHourlyData = Array(13).fill(0); 
let nodeHourlyData = {}; 

let isPlacingPin = false;
let tempPinTop = '50%';
let tempPinLeft = '50%';

document.addEventListener('DOMContentLoaded', async () => {
    initThemeManager();
    initTabManager();
    initCharts();
    
    setTimeout(() => { initPanZoomEngine(); }, 200);
    
    await fetchHistoricalData();
    await fetchInitialNodesFromDB();
});

window.doLogout = function() { 
    sessionStorage.removeItem('aquatrack_admin'); 
    window.location.href = 'Homepage.html'; 
};

// ==========================================
// PERSISTENT DATABASE FETCHING
// ==========================================

function getPHTTimeStr(dateObj = new Date()) {
    return dateObj.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour12: true });
}

async function fetchHistoricalData() {
    if (!window.supabaseClient) return;

    const now = new Date();
    const phtDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila' });
    const phtMidnight = new Date(phtDateStr + " 00:00:00 GMT+0800").toISOString(); 

    const { data: events } = await window.supabaseClient.from('system_events').select('*').gte('created_at', phtMidnight);

    if (events) {
        dailyRefills = 0; connectionDrops = 0;
        events.forEach(e => {
            if (!nodeStats[e.node_id]) nodeStats[e.node_id] = { refills: 0, drops: 0 };
            if (e.event_type === 'REFILL') { dailyRefills++; nodeStats[e.node_id].refills++; }
            if (e.event_type === 'DROP') { connectionDrops++; nodeStats[e.node_id].drops++; }
        });
        document.getElementById('kpi-refills').innerText = dailyRefills;
        document.getElementById('kpi-drops').innerText = connectionDrops;
    }

    const { data: logs } = await window.supabaseClient.from('dispenser_logs').select('*').gte('recorded_at', phtMidnight).order('recorded_at', { ascending: true });
    if (logs && logs.length > 0) { processHourlyChartData(logs); }
}

function processHourlyChartData(logs) {
    globalHourlyData = Array(13).fill(0);
    nodeHourlyData = {};
    let lastWeights = {};

    logs.forEach(log => {
        const date = new Date(log.recorded_at);
        const phtHour = parseInt(date.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }));
        
        if (phtHour >= 6 && phtHour <= 18) {
            const hourIndex = phtHour - 6;
            if (!nodeHourlyData[log.node_id]) nodeHourlyData[log.node_id] = Array(13).fill(0);

            if (lastWeights[log.node_id] !== undefined) {
                const diff = lastWeights[log.node_id] - log.weight_grams;
                if (diff > 0 && diff < 15000) {
                    const litersDispensed = diff / 1000.0;
                    globalHourlyData[hourIndex] += litersDispensed;
                    nodeHourlyData[log.node_id][hourIndex] += litersDispensed;
                }
            }
            lastWeights[log.node_id] = log.weight_grams;
        }
    });

    if (peakChart) { peakChart.data.datasets[0].data = globalHourlyData; peakChart.update(); }
    if (currentActiveNodeView) updateIndividualNodeView();
}

async function logSystemEvent(nodeId, eventType) {
    if (!window.supabaseClient) return;
    await window.supabaseClient.from('system_events').insert([{ node_id: nodeId, event_type: eventType }]);
}

window.exportDataToCSV = async function() {
    if (!window.supabaseClient) { alert("Database connection not established."); return; }
    alert("Compiling Daily Summary Export... Please wait.");
    
    const { data: events, error } = await window.supabaseClient.from('system_events').select('*').order('created_at', { ascending: false });
    if (error || !events || events.length === 0) { alert("Failed to fetch data or no events logged yet."); return; }

    const summaryMap = {};
    events.forEach(e => {
        const dateStr = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); 
        const key = `${dateStr}_${e.node_id}`;
        if (!summaryMap[key]) { summaryMap[key] = { Date: dateStr, Node_ID: `NODE_0${e.node_id}`, Refills: 0, Drops: 0 }; }
        if (e.event_type === 'REFILL') summaryMap[key].Refills++;
        if (e.event_type === 'DROP') summaryMap[key].Drops++;
    });
    
    const summaryArray = Object.values(summaryMap).sort((a,b) => b.Date.localeCompare(a.Date)); 
    const headers = "Date (PHT),Node ID,Total Refills,Connection Drops";
    const csvRows = summaryArray.map(row => `${row.Date},${row.Node_ID},${row.Refills},${row.Drops}`);
    const csvContent = [headers, ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', ''); a.setAttribute('href', url);
    const todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Manila'}); 
    a.setAttribute('download', `AquaWatch_Daily_Summary_${todayStr}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// ==========================================
// SUPABASE LIVE DATA ENGINE
// ==========================================

async function fetchInitialNodesFromDB() {
    if(!window.supabaseClient) return;
    const { data } = await window.supabaseClient.from('dashboard_data').select('*');
    if(!data) return;

    dbNodes = data.map(row => {
        if (!nodeStats[row.node_id]) nodeStats[row.node_id] = { refills: 0, drops: 0 };
        return {
            id: `NODE_0${row.node_id}`, nodeId: row.node_id,
            name: row.node_name || `Dispenser Node ${row.node_id}`,
            location: row.location || 'Campus Setting',
            pinTop: row.pin_top || '50%', pinLeft: row.pin_left || '50%',
            level: row.water_percentage || 0, weight: row.weight_grams || 0,
            status: row.status_label || 'Offline', capacity: row.weight_full || 10000 
        };
    });

    if (dbNodes.length > 0 && !currentActiveNodeView) currentActiveNodeView = dbNodes[0].nodeId;
    updateUI();
}

window.addEventListener('aquawatch_sync', (event) => {
    const liveData = event.detail;
    
    liveData.forEach(incomingNode => {
        let existingNode = dbNodes.find(n => n.nodeId === incomingNode.node_id);
        if (!nodeStats[incomingNode.node_id]) nodeStats[incomingNode.node_id] = { refills: 0, drops: 0 };

        if (existingNode) {
            if (incomingNode.water_percentage > (existingNode.level + 50)) {
                dailyRefills++; nodeStats[incomingNode.node_id].refills++;
                logSystemEvent(incomingNode.node_id, 'REFILL');
                document.getElementById('kpi-refills').innerText = dailyRefills;
            }
            if (existingNode.status !== 'Offline' && incomingNode.status_label === 'Offline') {
                connectionDrops++; nodeStats[incomingNode.node_id].drops++;
                logSystemEvent(incomingNode.node_id, 'DROP');
                document.getElementById('kpi-drops').innerText = connectionDrops;
            }

            existingNode.level = incomingNode.water_percentage; existingNode.weight = incomingNode.weight_grams; existingNode.status = incomingNode.status_label;
            
            if(incomingNode.node_name) existingNode.name = incomingNode.node_name;
            if(incomingNode.location) existingNode.location = incomingNode.location;
            if(incomingNode.pin_top) existingNode.pinTop = incomingNode.pin_top;
            if(incomingNode.pin_left) existingNode.pinLeft = incomingNode.pin_left;
            if(incomingNode.weight_full) existingNode.capacity = incomingNode.weight_full;
        } else {
            dbNodes.push({
                id: `NODE_0${incomingNode.node_id}`, nodeId: incomingNode.node_id,
                name: incomingNode.node_name || `Dispenser Node ${incomingNode.node_id}`, location: incomingNode.location || 'Campus Setting',
                pinTop: incomingNode.pin_top || '50%', pinLeft: incomingNode.pin_left || '50%',
                level: incomingNode.water_percentage || 0, weight: incomingNode.weight_grams || 0,
                status: incomingNode.status_label || 'Offline', capacity: incomingNode.weight_full || 10000
            });
            if (!currentActiveNodeView) currentActiveNodeView = incomingNode.node_id;
        }
    });

    updateUI();
});

function updateUI() {
    updateMasterKPIs();
    renderMapPins();
    renderLiveGrid();
    renderRefillQueue();
    renderDailySummaryTable();
    renderNodeSelector();
    updateIndividualNodeView();
}

function getStatusColorHex(status, level) {
    if (status === 'Offline' || status === 'No_Gallon') return '#64748b'; 
    if (level <= 5 || status === 'Empty') return '#ef4444'; 
    if (level <= 30 || status === 'Low') return '#f59e0b'; 
    return '#10b981'; 
}

function updateMasterKPIs() {
    const total = dbNodes.length;
    const online = dbNodes.filter(n => n.status !== 'Offline').length;
    const empty = dbNodes.filter(n => n.status === 'Empty').length;
    
    const validLevels = dbNodes.filter(n => n.status !== 'Offline' && n.status !== 'No_Gallon');
    const avgPct = validLevels.length > 0 ? Math.round(validLevels.reduce((acc, curr) => acc + curr.level, 0) / validLevels.length) : 0;
    const totalWeight = validLevels.reduce((acc, curr) => acc + curr.weight, 0);

    document.getElementById('kpi-avail').innerText = online + ' / ' + total;
    document.getElementById('kpi-empty').innerText = empty;
    document.getElementById('kpi-availPct').innerText = avgPct + '%';
    document.getElementById('kpi-volume').innerText = totalWeight.toLocaleString() + 'g';
    document.getElementById('sync-time').innerText = getPHTTimeStr();

    updateChartsData(empty, dbNodes.filter(n => n.status==='No_Gallon').length, online, total - online);
}

// ==========================================
// PREDICTIVE LOGIC
// ==========================================

function calculateEstEmptyTime(nodeId, currentLevel) {
    if (currentLevel <= 0) return "--";

    const hourlyData = nodeHourlyData[nodeId] || [];
    const totalDispensedLiters = hourlyData.reduce((a, b) => a + b, 0);
    
    const now = new Date();
    const phtHour = parseInt(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }));
    const hoursElapsed = phtHour - 6; 
    
    if (hoursElapsed <= 0 || totalDispensedLiters <= 0.1) return "-- (Stable)";
    
    const avgLitersPerHour = totalDispensedLiters / hoursElapsed;
    const node = dbNodes.find(n => n.nodeId === nodeId);
    const capacityLiters = (node ? node.capacity : 19000) / 1000.0; 
    const currentLitersLeft = (currentLevel / 100) * capacityLiters;
    
    const hoursLeft = currentLitersLeft / avgLitersPerHour;
    if (hoursLeft > 24) return "> 24 hrs";
    
    const emptyDate = new Date();
    emptyDate.setMinutes(emptyDate.getMinutes() + (hoursLeft * 60));
    return emptyDate.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute:'2-digit' });
}

function renderDailySummaryTable() {
    const tbody = document.getElementById('summary-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    dbNodes.forEach((node) => {
        let tagColor = 'gray';
        if(node.status === 'Empty' || node.status === 'No_Gallon') tagColor = 'red';
        if(node.status === 'Low') tagColor = 'orange';
        if(node.status === 'Full' || node.status === 'Partial') tagColor = 'green';

        const stats = nodeStats[node.nodeId] || { refills: 0, drops: 0 };
        const estTime = (node.status === 'Offline' || node.status === 'No_Gallon') ? '--' : calculateEstEmptyTime(node.nodeId, node.level);

        tbody.innerHTML += `
            <tr>
                <td class="mono text-brand" style="font-weight: 600;">${node.name}</td>
                <td class="mono">${node.status === 'Offline' ? '--' : node.level + '%'}</td>
                <td class="mono">${stats.refills}</td>
                <td class="mono">${stats.drops}</td>
                <td class="mono text-muted">${estTime}</td>
                <td><span style="color:${tagColor}; font-weight:bold; font-size:0.75rem; text-transform:uppercase;">${node.status.replace('_', ' ')}</span></td>
            </tr>`;
    });
}

// ==========================================
// ADD HARDWARE NODE LOGIC (FIXED FK)
// ==========================================
window.openAddNodeModal = function() { document.getElementById('addNodeModal').classList.remove('hidden'); }
window.closeAddNodeModal = function() { document.getElementById('addNodeModal').classList.add('hidden'); }

window.submitNewNode = async function() {
    const id = parseInt(document.getElementById('addNodeId').value);
    const name = document.getElementById('addNodeName').value || `Dispenser Node ${id}`;
    const loc = document.getElementById('addNodeLocation').value || `Campus Setting`;

    if(!id || isNaN(id)) { alert("Please provide a valid numeric Node ID."); return; }
    if(dbNodes.some(n => n.nodeId === id)) { alert("This Node ID already exists in the system."); return; }

    try {
        // Since dashboard_data is a joined view, we must insert into both physical tables.
        const { error: err1 } = await window.supabaseClient.from('system_settings').insert([
            { node_id: id, node_name: name, location: loc, pin_top: '50%', pin_left: '50%', cal_factor: 43.0, update_interval: 2000, weight_empty: 1000, weight_full: 10000 }
        ]);
        if(err1) throw err1;

        const { error: err2 } = await window.supabaseClient.from('live_status').insert([
            { node_id: id, status_label: 'Offline', weight_grams: 0, water_percentage: 0 }
        ]);
        
        // If settings inserted but live_status fails, it's safer to rollback or alert.
        if(err2) {
             console.error("live_status insertion failed. Attempting to reverse order.");
             // Fallback for foreign key order
             await window.supabaseClient.from('system_settings').delete().eq('node_id', id);
             
             const { error: retry1 } = await window.supabaseClient.from('live_status').insert([
                { node_id: id, status_label: 'Offline', weight_grams: 0, water_percentage: 0 }
             ]);
             if(retry1) throw retry1;
             
             const { error: retry2 } = await window.supabaseClient.from('system_settings').insert([
                { node_id: id, node_name: name, location: loc, pin_top: '50%', pin_left: '50%', cal_factor: 43.0, update_interval: 2000, weight_empty: 1000, weight_full: 10000 }
             ]);
             if(retry2) throw retry2;
        }

        closeAddNodeModal();
        alert(`Success! Node ${id} registered to the database.`);
        fetchInitialNodesFromDB(); // Reload nodes
        
    } catch (error) {
        alert("Database Error: " + error.message);
    }
}

// ==========================================
// EDIT PROFILE & INTERACTIVE PIN PLACEMENT
// ==========================================
window.openEditModal = function() {
    if (!currentActiveNodeView) return;
    const node = dbNodes.find(n => n.nodeId === currentActiveNodeView);
    if(!node) return;
    
    document.getElementById('editNodeId').innerText = `NODE_${node.nodeId}`;
    document.getElementById('editNodeName').value = node.name;
    document.getElementById('editNodeLocation').value = node.location;
    
    tempPinTop = node.pinTop;
    tempPinLeft = node.pinLeft;

    if (node.nodeId === 2 || node.nodeId === 3) {
        document.getElementById('btnDeleteNode').style.display = 'none';
    } else {
        document.getElementById('btnDeleteNode').style.display = 'flex';
    }
    
    document.getElementById('editNodeModal').classList.remove('hidden');
}

window.closeEditModal = function() {
    document.getElementById('editNodeModal').classList.add('hidden');
}

window.deleteNode = async function() {
    if (currentActiveNodeView === 2 || currentActiveNodeView === 3) {
        alert("Core infrastructure nodes cannot be deleted."); return;
    }
    if(confirm(`SYSTEM WARNING:\nAre you sure you want to permanently delete Node ${currentActiveNodeView} and all its historical telemetry?`)) {
        await window.supabaseClient.from('system_settings').delete().eq('node_id', currentActiveNodeView);
        await window.supabaseClient.from('live_status').delete().eq('node_id', currentActiveNodeView);
        await window.supabaseClient.from('system_events').delete().eq('node_id', currentActiveNodeView);
        closeEditModal();
        alert("Hardware node securely removed.");
        location.reload(); 
    }
}

window.saveNodeProfile = async function() {
    const name = document.getElementById('editNodeName').value;
    const loc = document.getElementById('editNodeLocation').value;
    
    const { error } = await window.supabaseClient
        .from('system_settings')
        .update({ node_name: name, location: loc, pin_top: tempPinTop, pin_left: tempPinLeft })
        .eq('node_id', currentActiveNodeView);
        
    if(error) { alert("Error saving profile: " + error.message); } 
    else {
        closeEditModal();
        const node = dbNodes.find(n => n.nodeId === currentActiveNodeView);
        if(node) { node.name = name; node.location = loc; node.pinTop = tempPinTop; node.pinLeft = tempPinLeft; }
        updateUI();
    }
}

// ------------------------------------------
// THE MAGIC PLACEMENT ENGINE (IMAGE-BOUNDED)
// ------------------------------------------
window.enterPlacementMode = function() {
    document.getElementById('editNodeModal').classList.add('hidden');
    document.getElementById('placementModeBanner').classList.remove('hidden');
    
    const node = dbNodes.find(n => n.nodeId === currentActiveNodeView);
    document.getElementById('placementNodeName').innerText = node.name;
    
    document.getElementById('nav-live').click();
    document.getElementById('stats-map-container').scrollIntoView({ behavior: 'smooth', block: 'center' });

    const zoomTarget = document.getElementById('stats-zoom-target');
    zoomTarget.classList.add('crosshair-cursor');
    
    const activePin = document.getElementById(`stats-pin-node${currentActiveNodeView}`);
    if (activePin) activePin.classList.add('placement-active');

    const mapImgWrapper = document.getElementById('map-image-wrapper');
    if(mapImgWrapper) mapImgWrapper.addEventListener('click', handleMapClickForPin);
    
    isPlacingPin = true;
}

window.cancelPlacementMode = function() {
    document.getElementById('placementModeBanner').classList.add('hidden');
    
    const zoomTarget = document.getElementById('stats-zoom-target');
    zoomTarget.classList.remove('crosshair-cursor');
    
    const mapImgWrapper = document.getElementById('map-image-wrapper');
    if(mapImgWrapper) mapImgWrapper.removeEventListener('click', handleMapClickForPin);
    
    const activePin = document.getElementById(`stats-pin-node${currentActiveNodeView}`);
    if (activePin) activePin.classList.remove('placement-active');

    isPlacingPin = false;
    document.getElementById('nav-nodes').click();
    document.getElementById('editNodeModal').classList.remove('hidden');
}

function handleMapClickForPin(e) {
    if (!isPlacingPin) return;
    if(e.target.closest('.map-pin')) return; 

    const mapImgWrapper = document.getElementById('map-image-wrapper');
    const rect = mapImgWrapper.getBoundingClientRect();
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;

    tempPinLeft = Math.max(0, Math.min(100, percentX)).toFixed(1) + '%';
    tempPinTop = Math.max(0, Math.min(100, percentY)).toFixed(1) + '%';

    const pin = document.getElementById(`stats-pin-node${currentActiveNodeView}`);
    if (pin) { pin.style.left = tempPinLeft; pin.style.top = tempPinTop; }

    cancelPlacementMode(); 
}

// ==========================================
// INDIVIDUAL NODE ANALYTICS
// ==========================================

window.switchNodeView = function(nodeId) {
    currentActiveNodeView = nodeId;
    renderNodeSelector();
    updateIndividualNodeView();
};

function renderNodeSelector() {
    const container = document.getElementById('nodeSelectorContainer');
    if (!container) return;
    container.innerHTML = '';
    
    dbNodes.forEach(node => {
        const btn = document.createElement('button');
        btn.className = `btn-node ${node.nodeId === currentActiveNodeView ? 'active' : ''}`;
        btn.innerText = node.name;
        btn.onclick = () => window.switchNodeView(node.nodeId);
        container.appendChild(btn);
    });
}

function updateIndividualNodeView() {
    if (!currentActiveNodeView) return;
    const node = dbNodes.find(n => n.nodeId === currentActiveNodeView);
    if (!node) return;

    const stats = nodeStats[node.nodeId] || { refills: 0, drops: 0 };
    const col = getStatusColorHex(node.status, node.level);

    document.getElementById('node-profile-name').innerText = node.name;
    document.getElementById('node-profile-loc').innerText = `Location Base: ${node.location}`;

    document.getElementById('node-stat-status').innerText = node.status.replace('_', ' ');
    document.getElementById('node-stat-status').style.color = col;
    document.getElementById('node-stat-vol').innerText = (node.status === 'Offline') ? '--' : node.level + '%';
    document.getElementById('node-stat-refills').innerText = stats.refills;
    document.getElementById('node-stat-drops').innerText = stats.drops;

    if (nodeTrendChart) {
        nodeTrendChart.data.datasets[0].data = nodeHourlyData[node.nodeId] || Array(13).fill(0);
        nodeTrendChart.update();
    }
}

// ==========================================
// UI RENDERING
// ==========================================

function renderMapPins() {
    const pinContainer = document.getElementById('dynamic-map-pins');
    if (!pinContainer) return;
    pinContainer.innerHTML = ''; 

    dbNodes.forEach(node => {
        const color = getStatusColorHex(node.status, node.level);
        const isCritical = (node.status === "No_Gallon" || (node.status !== "Offline" && node.level <= 5));
        
        const pinHtml = `
            <div class="map-pin ${isCritical ? 'blink-critical' : ''}" 
                 id="stats-pin-node${node.nodeId}" 
                 style="top: ${node.pinTop}; left: ${node.pinLeft}; background-color: ${color};" 
                 onclick="document.getElementById('nav-nodes').click(); window.switchNodeView(${node.nodeId});"
                 title="${node.name} (${node.level}%) - Click to manage">
                <div class="pin-pulse"></div>
            </div>`;
        pinContainer.innerHTML += pinHtml;
    });
}

function renderLiveGrid() {
    const container = document.getElementById('live-grid-container');
    if (!container) return;
    container.innerHTML = '';

    dbNodes.forEach(node => {
        const col = getStatusColorHex(node.status, node.level);
        const card = document.createElement('div');
        card.className = `d-card bento-card status-${node.status}`;
        card.innerHTML = `
            <div class="d-head">
                <span class="d-id mono">${node.name}</span>
                <span class="text-muted text-sm">Cap: ${node.capacity}g</span>
            </div>
            <div class="d-metrics">
                <span class="d-pct mono" style="color: ${col}">${node.status === 'Offline' ? '--' : node.level + '%'}</span>
                <span class="text-muted mono">${node.status === 'Offline' ? '0' : node.weight.toLocaleString()}g</span>
            </div>
            <div class="prog-track">
                <div class="prog-fill" style="width: ${node.status === 'Offline' ? 0 : node.level}%; background-color: ${col}"></div>
            </div>
            <div class="d-foot">
                <span style="color: ${col}; font-weight:600; text-transform:uppercase; font-size:0.75rem;">${node.status.replace('_', ' ')}</span>
                <span class="mono text-muted cursor-pointer" style="text-decoration: underline;" onclick="document.getElementById('nav-nodes').click(); window.switchNodeView(${node.nodeId});">View Stats</span>
            </div>`;
        container.appendChild(card);
    });
}

function renderRefillQueue() {
    const container = document.getElementById('refill-queue-container');
    if (!container) return;
    container.innerHTML = '';
    
    const criticalNodes = dbNodes.filter(n => (n.status === 'Low' || n.status === 'Empty' || n.status === 'No_Gallon') && n.status !== 'Offline').sort((a,b) => a.level - b.level);
    
    if(criticalNodes.length === 0) { 
        container.innerHTML = `<p class="text-muted">No maintenance or refills required at this time.</p>`; return; 
    }

    criticalNodes.forEach(node => {
        const isCritical = node.level <= 5 || node.status === 'No_Gallon';
        container.innerHTML += `
            <div class="queue-item">
                <div>
                    <h4 class="${isCritical ? 'text-rose' : 'text-amber'} mono">${node.name}</h4>
                    <p class="text-sm text-muted mt-2">Level: <strong>${node.level}%</strong> | Load: ${node.weight}g / ${node.capacity}g</p>
                </div>
            </div>`;
    });
}

// ==========================================
// CHART.JS ENGINE
// ==========================================

let donutChart, barChart, peakChart, nodeTrendChart;

function initCharts() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridC = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)';
    const textC = isDark ? '#888888' : '#666666';
    
    Chart.defaults.color = textC; Chart.defaults.font.family = 'Inter'; 
    const hourlyLabels = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    
    donutChart = new Chart(document.getElementById('overviewDonutChart'), { type: 'doughnut', data: { labels: ['Optimal', 'Low Warning', 'Critical / Empty', 'Offline'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#64748b'], borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: textC, padding: 20 } } }, cutout: '75%' } });
    barChart = new Chart(document.getElementById('buildingBarChart'), { type: 'bar', data: { labels: [], datasets: [{ label: 'Active Volume %', data: [], backgroundColor: '#0284c7', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { min: 0, max: 100, grid: { color: gridC } } } } });

    peakChart = new Chart(document.getElementById('peakActivityChart'), {
        type: 'line',
        data: { labels: hourlyLabels, datasets: [{ label: 'Global Volume Dispensed (Liters)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: gridC } } } }
    });

    const ntc = document.getElementById('nodeTrendChart');
    if (ntc) {
        nodeTrendChart = new Chart(ntc, {
            type: 'line',
            data: { labels: hourlyLabels, datasets: [{ label: 'Node Volume Dispensed (Liters)', data: [], borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', borderWidth: 3, tension: 0.4, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: gridC } } } }
        });
    }
}

function updateChartsData(empty, noGal, online, offline) {
    if(!donutChart) return;
    const good = online - (empty + noGal + dbNodes.filter(n => n.status==='Low').length);
    const low = dbNodes.filter(n => n.status==='Low').length;
    donutChart.data.datasets[0].data = [good, low, empty + noGal, offline]; donutChart.update();
    barChart.data.labels = dbNodes.map(n => n.name); barChart.data.datasets[0].data = dbNodes.map(n => n.level); barChart.update();
}

function initMapEngine() {
    const mapContainer = document.getElementById('stats-map-container');
    const zoomTarget = document.getElementById('stats-zoom-target');
    let scale = 1, pointX = 0, pointY = 0, startX, startY;

    function setTransform() { 
        if(zoomTarget && mapContainer) {
            const containerRect = mapContainer.getBoundingClientRect();
            const scaledWidth = containerRect.width * scale;
            const scaledHeight = containerRect.height * scale;

            const minX = Math.min(0, containerRect.width - scaledWidth);
            const minY = Math.min(0, containerRect.height - scaledHeight);

            pointX = Math.max(minX, Math.min(0, pointX));
            pointY = Math.max(minY, Math.min(0, pointY));

            zoomTarget.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`; 
        }
    }

    if(mapContainer) {
        mapContainer.addEventListener('wheel', e => {
            if (window.innerWidth <= 900) return; 
            e.preventDefault();
            const rect = mapContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
            const xs = (mouseX - pointX) / scale; const ys = (mouseY - pointY) / scale;
            if (e.deltaY < 0) scale *= 1.2; else scale /= 1.2;
            scale = Math.max(1, Math.min(scale, 5));
            if (scale === 1) { pointX = 0; pointY = 0; } else { pointX = mouseX - xs * scale; pointY = mouseY - ys * scale; }
            setTransform();
        });

        mapContainer.addEventListener('mousedown', e => {
            if (window.innerWidth <= 900) return; 
            if (e.target.closest('.map-pin') || e.target.closest('button')) return; 
            if (isPlacingPin) return; 
            e.preventDefault(); startX = e.clientX - pointX; startY = e.clientY - pointY; isPanning = true; mapContainer.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', () => { isPanning = false; if(mapContainer) mapContainer.style.cursor = 'grab'; });
        window.addEventListener('mouseleave', () => { isPanning = false; if(mapContainer) mapContainer.style.cursor = 'grab'; });
        window.addEventListener('mousemove', e => {
            if (window.innerWidth <= 900) return; 
            if (!isPanning || isPlacingPin) return; e.preventDefault(); pointX = e.clientX - startX; pointY = e.clientY - startY; setTransform();
        });
    }

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => { 
        const rect = mapContainer.getBoundingClientRect();
        const centerX = rect.width / 2; const centerY = rect.height / 2;
        const xs = (centerX - pointX) / scale; const ys = (centerY - pointY) / scale;
        scale = Math.min(scale * 1.3, 5); 
        pointX = centerX - xs * scale; pointY = centerY - ys * scale;
        setTransform(); 
    });
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => { 
        const rect = mapContainer.getBoundingClientRect();
        const centerX = rect.width / 2; const centerY = rect.height / 2;
        const xs = (centerX - pointX) / scale; const ys = (centerY - pointY) / scale;
        scale = Math.max(scale / 1.3, 1); 
        if (scale === 1) { pointX = 0; pointY = 0; } else { pointX = centerX - xs * scale; pointY = centerY - ys * scale; }
        setTransform(); 
    });
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => { scale = 1; pointX = 0; pointY = 0; setTransform(); });
}

function initTabManager() {
    document.querySelectorAll('.nav-item[data-target]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(button.getAttribute('data-target')).classList.add('active');
            
            const titles = {
                'view-live': 'Active Telemetry Dashboard',
                'view-nodes': 'Individual Node Analytics',
                'view-refill': 'Maintenance Operations',
                'view-logs': 'Daily Operations Summary'
            };
            document.getElementById('page-title').innerText = titles[button.getAttribute('data-target')];
        });
    });
    document.getElementById('mobileToggle')?.addEventListener('click', () => { document.getElementById('navMenu')?.classList.toggle('active'); });
}

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
            if(newTheme === 'dark') { moonIcon.style.display = 'none'; sunIcon.style.display = 'block'; }
            else { moonIcon.style.display = 'block'; sunIcon.style.display = 'none'; }
            location.reload(); 
        });
    }
}