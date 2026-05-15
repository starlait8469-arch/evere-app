const SUPABASE_URL = "https://wohsstrvdmctgyajiwtg.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI";

async function test() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/production_slips`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      slip_type: "sewing",
      factory_name: "test",
      slip_date: "2026-03-19",
      orders: [{ id: "test-order" }]
    })
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test();
