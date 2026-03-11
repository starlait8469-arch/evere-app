const url = 'https://wohsstrvdmctgyajiwtg.supabase.co/rest/v1/';
const headers = {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI',
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI',
    'Content-Type': 'application/json'
};

async function api(method, path, body = null) {
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url + path, options);
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
        throw new Error(`API Error ${res.status} on ${method} ${path}: ${await res.text()}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function run() {
    console.log('Fetching PH-01 inventory...');
    const data = await api('GET', 'inventory?name=eq.PH-01&limit=5000');
    console.log(`Fetched ${data.length} items`);
    const items = data.map(d => ({ id: d.id, color: d.color, size: d.size, qty: d.quantity }));

    // find exact pairs
    const seen = new Map();
    const toDelete = [];
    items.forEach(i => {
        const key = i.color + '|' + i.size;
        if (seen.has(key)) {
            const other = seen.get(key);
            if (other.qty >= i.qty) {
                toDelete.push(i);
            } else {
                toDelete.push(other);
                seen.set(key, i);
            }
        } else {
            seen.set(key, i);
        }
    });

    console.log('Total items fetched:', items.length);
    console.log('Unique pairs to keep:', seen.size);
    console.log('Items strictly grouped as exact duplicates:', toDelete.length);

    for (const d of toDelete) {
        console.log(`\nDeleting duplicate ${d.id} (Color: ${d.color}, Size: ${d.size}, Qty: ${d.qty})`);
        // Transfer foreign keys to primary record
        const primaryId = seen.get(d.color + '|' + d.size).id;
        try {
            console.log(`  Transferring sales_history from ${d.id} to ${primaryId}`);
            await api('PATCH', `sales_history?inventory_id=eq.${d.id}`, { inventory_id: primaryId });
            console.log(`  Transferring store_order_items from ${d.id} to ${primaryId}`);
            await api('PATCH', `store_order_items?item_id=eq.${d.id}`, { item_id: primaryId });

            // delete 
            console.log(`  Strict deleting row ${d.id}`);
            await api('DELETE', `inventory?id=eq.${d.id}`);
        } catch (e) {
            console.error('  Failed cleanly deleting', e);
        }
    }
    console.log('Done.');
}
run();
