/* ============================================================
   AquaWatch — Admin UI & Configuration Controller
   ============================================================ */

let dispensers = [
    { id:'D01', nodeId: 2, name:'Dispenser 1 (Node 2)', location:'Admin Office', level:0, weight:0, status:'Offline', online:false },
    { id:'D02', nodeId: 3, name:'Dispenser 2 (Node 3)', location:'Library',      level:0, weight:0, status:'Offline', online:false }
];
  
let isListRendered = false;
let pendingCalibrationNode = null; 

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. THEME MANAGEMENT
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
            moonIcon.style.display = 'none'; sunIcon.style.display = 'block';
        } else {
            moonIcon.style.display = 'block'; sunIcon.style.display = 'none';
        }
    }

    // 2. MOBILE NAVIGATION
    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');
    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => navMenu.classList.toggle('active'));
    }

    // 3. AUTHENTICATION STATE CHECK
    if (sessionStorage.getItem('aquatrack_admin') === 'true') {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        document.getElementById('authButton').style.display = 'block';
        
        const statisticsNavNode = document.getElementById('statisticsNav');
        if (statisticsNavNode) statisticsNavNode.style.display = 'block';
        
        renderDeviceList();
    }
});

// ============================================================
// AUTHENTICATION ENGINE
// ============================================================

window.doLogin = function() {
    const u = document.getElementById('adminUser').value;
    const p = document.getElementById('adminPass').value;
    
    if (u === 'admin' && p === 'admin') { 
        sessionStorage.setItem('aquatrack_admin', 'true'); 
        location.reload(); 
    } else { 
        alert('Authentication Failed: Invalid Administrator ID or Passkey.'); 
    }
};

window.doLogout = function() { 
    sessionStorage.removeItem('aquatrack_admin'); 
    location.reload(); 
};

// ============================================================
// HARDWARE RENDERING & SUPABASE SYNC
// ============================================================

window.addEventListener('aquawatch_sync', (event) => {
    const data = event.detail;
    if (document.getElementById('adminDashboard')?.style.display === 'block') {
        data.forEach(node => {
            const index = node.node_id === 2 ? 0 : (node.node_id === 3 ? 1 : -1);
            if (index !== -1) {
                dispensers[index].level = node.water_percentage;
                dispensers[index].weight = node.weight_grams;
                dispensers[index].status = node.status_label;
                dispensers[index].online = (node.status_label !== 'Offline');
            }
        });
        renderDeviceList();
    }
});

function renderDeviceList() {
    const list = document.getElementById('adminDeviceList');
    if (!list) return;

    if (!isListRendered) {
        list.innerHTML = '';
        dispensers.forEach((d, index) => {
          const toggleHtml = `<label class="toggle" title="Live nodes dictate their own status"><input type="checkbox" id="device-toggle-${index}" ${d.online ? 'checked' : ''} disabled><span class="slider"></span></label>`;
  
          const row = document.createElement('div');
          row.className = 'device-row';
          row.innerHTML = `
            <div>
                <div class="device-name mono">${d.id} — ${d.name}</div>
                <div class="device-sub text-muted" id="device-sub-${index}">${d.weight.toLocaleString()}g · ${d.level}% · <span class="${d.online ? 'text-main' : ''}">${d.online ? 'Online' : 'Offline'}</span></div>
            </div>
            <div class="device-controls">
                <button class="btn-secondary" onclick="openCalibrationModal(${d.nodeId})">Configure Node</button>
                ${toggleHtml}
            </div>`;
          list.appendChild(row);
        });
        isListRendered = true;
    } else {
        dispensers.forEach((d, index) => {
            const subText = document.getElementById(`device-sub-${index}`);
            if (subText) subText.innerHTML = `${d.weight.toLocaleString()}g · ${d.level}% · <span class="${d.online ? 'text-main' : ''}">${d.online ? 'Online' : 'Offline'}</span>`;
            const toggle = document.getElementById(`device-toggle-${index}`);
            if (toggle) toggle.checked = d.online;
        });
    }
}

// ============================================================
// MODAL & CONFIGURATION LOGIC
// ============================================================

window.openCalibrationModal = async function(nodeId) {
    pendingCalibrationNode = nodeId;
    document.getElementById('calibNodeId').innerText = nodeId;
    
    const { data, error } = await window.supabaseClient.from('system_settings').select('*').eq('node_id', nodeId).single();
    
    if (data && !error) {
        document.getElementById('setCalFactor').value = data.cal_factor;
        document.getElementById('setInterval').value = data.update_interval;
        if(document.getElementById('setEmpty')) document.getElementById('setEmpty').value = data.weight_empty || 1000;
        if(document.getElementById('setFull')) document.getElementById('setFull').value = data.weight_full || 10000;
    }
    
    document.getElementById('calibOverlay').classList.remove('hidden'); 
};

window.closeCalibModal = function() { 
    pendingCalibrationNode = null; 
    document.getElementById('calibOverlay').classList.add('hidden'); 
};

window.autoCalculateFactor = function() {
    if (!pendingCalibrationNode) return;
    const knownWeight = parseFloat(document.getElementById('knownWeight').value);
    if (!knownWeight || knownWeight <= 0) { alert("Please enter a valid known weight."); return; }

    const nodeData = dispensers.find(d => d.nodeId === pendingCalibrationNode);
    if (nodeData) {
        const currentDisplayedWeight = nodeData.weight;
        const currentFactor = parseFloat(document.getElementById('setCalFactor').value);
        if (currentDisplayedWeight <= 0) { alert("The scale is reading 0g. Place the item on the scale, wait for the dashboard to update, and try again."); return; }

        const newFactor = currentFactor * (currentDisplayedWeight / knownWeight);
        document.getElementById('setCalFactor').value = newFactor.toFixed(2);
        document.getElementById('knownWeight').value = '';
    }
};

window.saveSettings = async function() {
    if(!pendingCalibrationNode) return;
    
    const cal = document.getElementById('setCalFactor').value;
    const int = document.getElementById('setInterval').value;
    const emp = document.getElementById('setEmpty') ? document.getElementById('setEmpty').value : 1000.0;
    const ful = document.getElementById('setFull') ? document.getElementById('setFull').value : 10000.0;

    const { error } = await window.supabaseClient
        .from('system_settings')
        .update({ 
            cal_factor: cal, 
            update_interval: int,
            weight_empty: emp,
            weight_full: ful
        })
        .eq('node_id', pendingCalibrationNode);

    if (!error) { 
        closeCalibModal(); 
        setTimeout(() => alert('Configuration deployed! Hardware will apply changes over-the-air instantly.'), 300); 
    } 
    else { 
        alert('Database Error: ' + error.message); 
    }
};

window.executeCalibration = async function() {
    if(!pendingCalibrationNode) return;
    if(confirm("SYSTEM WARNING:\nThe physical dispenser MUST BE COMPLETELY EMPTY (remove the gallon) before clicking OK.\n\nProceed to Force Tare?")) {
        const { error } = await window.supabaseClient
            .from('live_status')
            .update({ pending_command: 'CALIBRATE' })
            .eq('node_id', pendingCalibrationNode);
            
        if (!error) { 
            closeCalibModal(); 
            setTimeout(() => alert('Command queued. The node will tare its offset on the next heartbeat.'), 500); 
        } 
        else { 
            alert('Database Error: ' + error.message); 
        }
    }
};