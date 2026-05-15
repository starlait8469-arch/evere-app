import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://wohsstrvdmctgyajiwtg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI"
);

async function checkDuplicates() {
  console.log("Fetching categories...");
  const { data: categories } = await supabase.from("categories").select("*");
  const catSet = new Set();
  const catDups = [];
  categories?.forEach(c => {
    const key = `${c.main_category}|${c.name.trim().toLowerCase()}`;
    if (catSet.has(key)) {
      catDups.push(c);
    } else {
      catSet.add(key);
    }
  });

  console.log("Category Possible Duplicates (ignoring case/spaces):", catDups.length);
  if (catDups.length) console.log(catDups);

  console.log("Fetching inventory...");
  const { data: inventory } = await supabase.from("inventory").select("*");
  
  const invGroups = {};
  inventory?.forEach(item => {
    const key = [
      item.main_category?.trim().toLowerCase(),
      item.sub_category?.trim().toLowerCase(),
      item.name?.trim().toLowerCase(),
      item.color?.trim().toLowerCase(),
      item.size?.trim().toLowerCase()
    ].join("|");

    if (!invGroups[key]) invGroups[key] = [];
    invGroups[key].push(item);
  });

  const invDups = Object.values(invGroups).filter(g => g.length > 1);
  console.log("Inventory Possible Duplicates (ignoring case/spaces):", invDups.length, "groups");
  
  invDups.slice(0, 5).forEach(group => {
    console.log("--- Duplicate Group ---");
    group.forEach(i => console.log(`ID: ${i.id}, Name: "${i.name}", Sub: "${i.sub_category}", Color: "${i.color}", Size: "${i.size}", Qty: ${i.quantity}`));
  });

  // check if there are exact duplicates
  const exactGroups = {};
  inventory?.forEach(item => {
     const key = [
      item.main_category,
      item.sub_category,
      item.name,
      item.color,
      item.size
    ].join("|");
    if (!exactGroups[key]) exactGroups[key] = [];
    exactGroups[key].push(item);
  });
  
  const exactDups = Object.values(exactGroups).filter(g => g.length > 1);
  console.log("\nExact Duplicates:", exactDups.length, "groups");
  exactDups.slice(0, 5).forEach(group => {
    console.log("--- Exact Group ---");
    group.forEach(i => console.log(`ID: ${i.id}, Name: "${i.name}", Sub: "${i.sub_category}", Color: "${i.color}", Size: "${i.size}", Qty: ${i.quantity}`));
  });

}

checkDuplicates();
