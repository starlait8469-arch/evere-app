const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wohsstrvdmctgyajiwtg.supabase.co';
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const anonKeyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const serviceRoleMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
const supabaseKey = (serviceRoleMatch && serviceRoleMatch[1]) || (anonKeyMatch && anonKeyMatch[1]) || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function unifySubCategories() {
    const targetName = 'Pantalon tropical (PH-01)';
    const variations = ['Pantalon tropical (Ph-01)', 'Pantalon Tropical (PH-01)', 'Pantalon tropical (PH-01)'];

    // Unify in inventory
    const { data: invData, error: invError } = await supabase
        .from('inventory')
        .update({ sub_category: targetName })
        .in('sub_category', variations)
        .eq('main_category', 'hombre');

    if (invError) console.error("Error updating inventory:", invError);
    else console.log("Inventory unified.");

    // Unify in production_orders
    const { data: prodData, error: prodError } = await supabase
        .from('production_orders')
        .update({ sub_category: targetName })
        .in('sub_category', variations)
        .eq('main_category', 'hombre');

    if (prodError) console.error("Error updating production_orders:", prodError);
    else console.log("Production orders unified.");

    // Unify in store_order_items
    const { data: storeData, error: storeError } = await supabase
        .from('store_order_items')
        .update({ sub_category: targetName })
        .in('sub_category', variations)
        .eq('main_category', 'hombre');

    if (storeError) console.error("Error updating store_order_items:", storeError);
    else console.log("Store order items unified.");
}

unifySubCategories();
