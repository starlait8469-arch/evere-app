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
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return text ? JSON.parse(text) : null;
}

async function run() {
    console.log("Fetching categories...");
    const cats = await api('GET', 'categories?select=name,price');
    const priceMap = {};
    cats.forEach(c => {
        if (c.name) priceMap[c.name.toUpperCase()] = c.price;
    });

    console.log("Fetching sales_history with 0 or null price...");
    const sales = await api('GET', 'sales_history?unit_price=eq.0&select=id,inventory(name,sub_category,main_category)');
    let salesUpdated = 0;
    for (const sh of sales) {
        if (!sh.inventory) continue;
        const key = (sh.inventory.sub_category || sh.inventory.main_category || sh.inventory.name || '').toUpperCase();
        const correctPrice = priceMap[key] || 0;
        if (correctPrice > 0) {
            console.log(`Patching sales_history ${sh.id} [${key}] with price: ${correctPrice}`);
            await api('PATCH', `sales_history?id=eq.${sh.id}`, { unit_price: correctPrice });
            salesUpdated++;
        }
    }

    console.log("Fetching store_deliveries_history with 0 or null price...");
    const deliveries = await api('GET', 'store_deliveries_history?unit_price=eq.0&select=id,store_order_items(main_category,sub_category)');
    let deliveriesUpdated = 0;
    for (const dh of deliveries) {
        if (!dh.store_order_items) continue;
        const key = (dh.store_order_items.sub_category || dh.store_order_items.main_category || '').toUpperCase();
        const correctPrice = priceMap[key] || 0;
        if (correctPrice > 0) {
            console.log(`Patching store_deliveries_history ${dh.id} [${key}] with price: ${correctPrice}`);
            await api('PATCH', `store_deliveries_history?id=eq.${dh.id}`, { unit_price: correctPrice });
            deliveriesUpdated++;
        }
    }

    console.log(`Done! Patched ${salesUpdated} sales and ${deliveriesUpdated} deliveries.`);
}

run().catch(console.error);
