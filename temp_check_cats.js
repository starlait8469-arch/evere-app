import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://wohsstrvdmctgyajiwtg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI"
);

async function check() {
  const { data: inv } = await supabase.from("inventory").select("main_category, sub_category");
  const uniquePairs = new Set();
  const rawSubs = new Set();
  
  inv.forEach(i => {
    const s = i.sub_category;
    const m = i.main_category;
    uniquePairs.add(`${m} | "${s}" (len:${s.length})`);
    rawSubs.add(s);
  });
  
  console.log("Unique Main -> Sub pairs in inventory:");
  console.log([...uniquePairs].sort().join("\n"));
  
  console.log("\nRaw sub_categories in Set (dropdown shows these):");
  console.log([...rawSubs].sort().join("\n"));
  
  // also check categories table
  const { data: cats } = await supabase.from("categories").select("main_category, name");
  const catPairs = new Set();
  cats.forEach(c => {
    catPairs.add(`${c.main_category} | "${c.name}" (len:${c.name.length})`);
  });
  console.log("\nUnique Main -> Sub pairs in Categories table:");
  console.log([...catPairs].sort().join("\n"));
}
check();
