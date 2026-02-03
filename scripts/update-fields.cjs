const Lark = require("@larksuiteoapi/node-sdk");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const client = new Lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const tables = [
  { app_token: "KaWjbBvGeaG0Fus5bwWcKLsJnfb", table_id: "tbl6VxIEVkc1eY3S", db_id: "627606f8-b565-4f8b-985b-592c9f049520" },
  { app_token: "KaWjbBvGeaG0Fus5bwWcKLsJnfb", table_id: "tblhV7wQW9uqdkMd", db_id: "4a6b1243-3c9f-4285-856e-3102843321ee" }
];

async function main() {
  for (const table of tables) {
    console.log("\n=== 更新 " + table.table_id + " ===");
    const res = await client.bitable.v1.appTableField.list({
      path: { app_token: table.app_token, table_id: table.table_id }
    });
    const fields = res.data?.items || [];
    const mappings = {};
    for (const f of fields) {
      mappings[f.field_id] = f.field_name;
    }

    const { error } = await supabase
      .from("bitables")
      .update({ field_mappings: mappings, updated_at: new Date().toISOString() })
      .eq("id", table.db_id);

    if (error) {
      console.error("Error updating " + table.table_id + ":", error);
    } else {
      console.log("Updated " + fields.length + " fields for " + table.table_id);
    }
  }
}
main();
