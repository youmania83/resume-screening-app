// src/test/deactivateHrEmailInDb.ts
import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function main() {
  console.log("🔒 Deactivating and clearing HR Manager Email in PostgreSQL database...");

  const res = await queryGlobal(
    `UPDATE email_configs 
     SET hr_manager_email = NULL, 
         updated_at = NOW();`
  );
  console.log(`✅ Updated ${res.rowCount} email configuration record(s) in database (hr_manager_email cleared).`);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
