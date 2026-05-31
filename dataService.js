// dataService.js - True WebSocket Engine (30-Second Tolerance)

const dbClient = window.supabaseClient;
let cachedData = []; 

// 1. Initial Fetch
async function bootDatabase() {
    if (!dbClient) return;
    try {
        const { data, error } = await dbClient.from('dashboard_data').select('*');
        if (error || !data) return;
        cachedData = data;
        window.dispatchEvent(new CustomEvent('aquawatch_sync', { detail: cachedData }));
    } catch (err) {
        console.error("Boot error:", err);
    }
}

bootDatabase();

// 2. Realtime Updates
dbClient.channel('dispenser-telemetry')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_status' }, (payload) => {
        const nodeIndex = cachedData.findIndex(n => n.node_id === payload.new.node_id);
        if (nodeIndex !== -1) {
            cachedData[nodeIndex].weight_grams = payload.new.weight_grams;
            cachedData[nodeIndex].water_percentage = payload.new.water_percentage;
            cachedData[nodeIndex].status_label = payload.new.status_label;
            cachedData[nodeIndex].last_updated = payload.new.last_updated;
            window.dispatchEvent(new CustomEvent('aquawatch_sync', { detail: cachedData }));
        }
    })
    .subscribe();

// 3. 30-Second Offline Watchdog
setInterval(() => {
    let UI_Needs_Update = false;
    const now = new Date().getTime();

    cachedData.forEach(node => {
        const lastUpdated = new Date(node.last_updated).getTime();
        const secondsPassed = (now - lastUpdated) / 1000;

        if (secondsPassed > 30 && node.status_label !== 'Offline') {
            node.status_label = 'Offline';
            node.water_percentage = 0;
            node.weight_grams = 0;
            UI_Needs_Update = true;
        }
    });

    if (UI_Needs_Update) {
        window.dispatchEvent(new CustomEvent('aquawatch_sync', { detail: cachedData }));
    }
}, 2000);