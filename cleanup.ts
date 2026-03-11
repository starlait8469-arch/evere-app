import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    const { data } = await supabase.from('inventory').select('*');
    const grouped = {};
    data.forEach(d => {
        const k = [d.main_category, d.sub_category, d.color, d.size].map(s => (s || '').trim().toLowerCase()).join('|');
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(d);
    });

    const dups = Object.values(grouped).filter(arr => arr.length > 1);
    console.log(JSON.stringify(dups, null, 2));

    // let's merge them! Delete the one with lower quantity and add its quantity to the other.
    for (const g of dups) {
        g.sort((a, b) => b.quantity - a.quantity);
        const primary = g[0];
        for (let i = 1; i < g.length; i++) {
            const dup = g[i];
            if (dup.quantity > 0) {
                console.log(`Adding ${dup.quantity} to ${primary.id} from ${dup.id}`);
                await supabase.from('inventory').update({ quantity: primary.quantity + dup.quantity }).eq('id', primary.id);
                primary.quantity += dup.quantity;
            }
            console.log(`Deleting duplicate ${dup.id}`);
            await supabase.from('inventory').delete().eq('id', dup.id);
        }
    }
}

main().catch(console.error);
