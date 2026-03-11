import fs from 'fs';

const url = 'https://wohsstrvdmctgyajiwtg.supabase.co/rest/v1/';
const headers = {
    apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI',
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
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

async function forceCleanup() {
    console.log('Fetching all inventory...');
    const inventory = await api('GET', 'inventory?limit=10000');
    console.log(`Fetched ${inventory.length} items.`);

    // Group by completely normalized strings
    const groups = {};
    for (const item of inventory) {
        if (!item.name || !item.color || !item.size) continue;

        // Use lowercase for grouping to catch all PH-01 variations
        const normName = item.name.toLowerCase().replace(/[\s"']/g, '');
        const normColor = item.color.toLowerCase().replace(/[\s"']/g, '');
        const normSize = item.size.toLowerCase().replace(/[\s"']/g, '');

        const key = `${normName}|${normColor}|${normSize}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    let deletedCount = 0;
    for (const [key, items] of Object.entries(groups)) {
        if (items.length > 1) {
            console.log(`\nFound ${items.length} items for ${key}`);

            // Sort to find best primary
            items.sort((a, b) => b.quantity - a.quantity);
            const primary = items[0];
            const duplicates = items.slice(1);

            let totalQty = primary.quantity;
            for (const dup of duplicates) {
                totalQty += dup.quantity;
                console.log(`  Merging duplicate ${dup.id} (Qty: ${dup.quantity}) into primary ${primary.id}`);
                try {
                    await api('PATCH', `sales_history?inventory_id=eq.${dup.id}`, { inventory_id: primary.id });
                    await api('PATCH', `store_order_items?item_id=eq.${dup.id}`, { item_id: primary.id });
                    await api('DELETE', `inventory?id=eq.${dup.id}`);
                    deletedCount++;
                } catch (e) {
                    console.error(`  Error processing duplicate ${dup.id}:`, e.message);
                }
            }

            // Force the exact unified name and sub_category
            let newName = primary.name.toUpperCase().replace(/['"]/g, '').trim();
            let newSub = primary.sub_category;

            // Apply the user's specific request for PH-01
            if (newName === 'PH-01') {
                newSub = 'Pantalon tropical (PH-01)';
            }

            console.log(`  Updating primary ${primary.id} to Qty: ${totalQty}, Sub: ${newSub}`);
            try {
                await api('PATCH', `inventory?id=eq.${primary.id}`, {
                    quantity: totalQty,
                    name: newName,
                    sub_category: newSub,
                    color: primary.color.trim(),
                    size: primary.size.trim()
                });
            } catch (e) {
                console.error(`  Error updating primary ${primary.id}:`, e.message);
            }
        } else if (items.length === 1) {
            // still fix the subcategory if it's ph-01
            const primary = items[0];
            const newName = primary.name.toUpperCase().replace(/['"]/g, '').trim();
            if (newName === 'PH-01' && primary.sub_category !== 'Pantalon tropical (PH-01)') {
                console.log(`  Updating standalone PH-01 Sub: ${primary.sub_category} -> Pantalon tropical (PH-01)`);
                try {
                    await api('PATCH', `inventory?id=eq.${primary.id}`, {
                        name: 'PH-01',
                        sub_category: 'Pantalon tropical (PH-01)'
                    });
                } catch (e) { }
            }
        }
    }
    console.log(`\nFinished! Deleted ${deletedCount} duplicate rows and unified subcategories.`);
}

forceCleanup().catch(console.error);
