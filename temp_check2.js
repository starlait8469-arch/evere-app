import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://wohsstrvdmctgyajiwtg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI"
);

async function checkDuplicates() {
  const { data: inventory } = await supabase.from("inventory").select("*");
  
  const invGroups = {};
  inventory?.forEach(item => {
    const key = [
      item.main_category?.trim().toLowerCase(),
      item.sub_category?.trim().toLowerCase(),
      item.color?.trim().toLowerCase(),
      item.size?.trim().toLowerCase()
    ].join("|");

    if (!invGroups[key]) invGroups[key] = [];
    invGroups[key].push(item);
  });

  const invDups = Object.values(invGroups).filter(g => g.length > 1);
  console.log("Inventory Possible Duplicates (ignoring name, case/spaces):", invDups.length, "groups");
  
  invDups.forEach(group => {
    console.log("--- Duplicate Group ---");
    group.forEach(i => console.log(`ID: ${i.id}, Name: "${i.name}", Sub: "${i.sub_category}", Color: "${i.color}", Size: "${i.size}", Qty: ${i.quantity}`));
  });
}

checkDuplicates();
