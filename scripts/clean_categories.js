const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wohsstrvdmctgyajiwtg.supabase.co';

// I need to use the exact anon key from the project, but since it's hard to read .env without dotenv, I'll just write a quick script that reads .env.local manually
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const anonKeyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const serviceRoleMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabaseKey = (serviceRoleMatch && serviceRoleMatch[1]) || (anonKeyMatch && anonKeyMatch[1]) || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanCategories() {
    console.log("Fetching categories for hombre...");
    const { data: categories, error } = await supabase
        .from('categories')
        .select('*')
        .eq('main_category', 'hombre');

    if (error) {
        console.error("Error fetching categories:", error);
        return;
    }

    const duplicates = categories.filter(c => c.name.toLowerCase().includes('tropical') && c.name.toLowerCase().includes('ph-01'));
    console.log("Found related categories:", duplicates.map(d => ({ id: d.id, name: d.name })));

    const toKeep = duplicates.find(c => c.name === 'Pantalon tropical (PH-01)');

    if (!toKeep) {
        console.log("Could not find the exact match 'Pantalon tropical (PH-01)' to keep.");

        // Let's print all to see
        console.log("All matching names:", duplicates.map(d => d.name));
        return;
    }

    const toDeleteIds = duplicates.filter(c => c.id !== toKeep.id).map(c => c.id);
    console.log("IDs to delete:", toDeleteIds);

    if (toDeleteIds.length > 0) {
        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .in('id', toDeleteIds);

        if (deleteError) {
            console.error("Error deleting categories:", deleteError);
        } else {
            console.log("Successfully deleted duplicate categories.");
        }
    } else {
        console.log("No duplicates found to delete.");
    }
}

cleanCategories();
