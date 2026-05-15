import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://wohsstrvdmctgyajiwtg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI"
);

async function fix() {
  const { data: inv, error: err1 } = await supabase.from("inventory").select("id, sub_category");
  if (err1) throw err1;

  const { data: cats, error: err2 } = await supabase.from("categories").select("name");
  if (err2) throw err2;

  // Create lowercase -> proper case mapping
  const map = {};
  cats.forEach(c => {
    map[c.name.toLowerCase()] = c.name;
  });

  let updatedCount = 0;
  for (const item of inv) {
    if (!item.sub_category) continue;
    const lower = item.sub_category.toLowerCase();
    const correct = map[lower];

    if (correct && correct !== item.sub_category) {
      console.log(`Fixing ID ${item.id}: "${item.sub_category}" -> "${correct}"`);
      await supabase.from("inventory").update({ sub_category: correct }).eq("id", item.id);
      updatedCount++;
    }
  }

  console.log(`Fixed ${updatedCount} items.`);
}
fix();
