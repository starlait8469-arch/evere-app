const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error("Missing supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
    console.log("Adding Category...");
    const { error: catError } = await supabase.from('categories').upsert(
        { main_category: 'hombre', name: 'Pantalon tropical (PH-01)' },
        { onConflict: 'main_category, name' }
    );

    if (catError) {
        console.error("Error adding category:", catError);
    } else {
        console.log("Category created or already exists.");
    }

    console.log("Preparing items...");
    const colors = ['negro', 'azul', 'gris'];
    const sizes = [];
    for (let i = 36; i <= 70; i += 2) {
        sizes.push(i.toString());
    }

    const items = [];
    for (const c of colors) {
        for (const s of sizes) {
            items.push({
                name: 'PH-01',
                main_category: 'hombre',
                sub_category: 'Pantalon tropical (PH-01)',
                color: c,
                size: s,
                quantity: 0
            });
        }
    }

    console.log(`Inserting ${items.length} items...`);
    const { error } = await supabase.from('inventory').insert(items);
    if (error) {
        console.error("Error inserting items:", error);
    } else {
        console.log("Success! Inserted all pants.");
    }
}

run();
