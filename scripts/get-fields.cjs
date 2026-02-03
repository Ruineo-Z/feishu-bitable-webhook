const Lark = require("@larksuiteoapi/node-sdk");
require("dotenv").config();

const client = new Lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
});

const tables = [
  { app_token: "KaWjbBvGeaG0Fus5bwWcKLsJnfb", table_id: "tbl6VxIEVkc1eY3S" },
  { app_token: "KaWjbBvGeaG0Fus5bwWcKLsJnfb", table_id: "tblhV7wQW9uqdkMd" }
];

async function main() {
  for (const table of tables) {
    console.log("\n=== " + table.table_id + " ===");
    const res = await client.bitable.v1.appTableField.list({
      path: { app_token: table.app_token, table_id: table.table_id }
    });
    const fields = res.data?.items || [];
    for (const f of fields) {
      console.log(f.field_id + ": " + f.field_name + " (type: " + f.field_type + ")");
    }
    console.log("Total: " + fields.length + " fields");
  }
}
main();
