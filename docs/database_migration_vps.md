# PostgreSQL Database Migration Guide (Supabase to VPS)

This guide details how to install PostgreSQL directly on your VPS, migrate your existing database schema and records from Supabase, and switch the application configuration to run entirely on the VPS.

---

## 🔒 Security Best Practice
Because your Express API backend and PostgreSQL database run on the **same VPS**, the database does **NOT** need to listen to external network connections. It should only listen to `localhost` (127.0.0.1). This keeps your database completely private and immune to external scans or attacks.

---

## 🛠️ Step 1: Install PostgreSQL on the VPS
Log into your VPS terminal as `root` and run the following commands:

```bash
# Update package list and install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Verify PostgreSQL is running
sudo systemctl status postgresql
```

---

## 🔑 Step 2: Create a Local Database and User
We need to create a dedicated database and a secure user for the application.

1. **Switch to the postgres system user and open the shell:**
   ```bash
   sudo -i -u postgres psql
   ```

2. **Run these SQL queries (replace `YourSecurePasswordHere` with a strong password):**
   ```sql
   -- 1. Create the database
   CREATE DATABASE rison_db;

   -- 2. Create the application user
   CREATE USER rison_user WITH PASSWORD 'YourSecurePasswordHere';

   -- 3. Grant full privileges
   GRANT ALL PRIVILEGES ON DATABASE rison_db TO rison_user;
   ALTER DATABASE rison_db OWNER TO rison_user;

   -- 4. Connect to the new database to grant public schema permissions
   \c rison_db;
   GRANT ALL ON SCHEMA public TO rison_user;

   -- 5. Exit the psql shell
   \q
   ```

3. **Return to the root user:**
   ```bash
   exit
   ```

---

## 📥 Step 3: Dump Current Data from Supabase
Now we will back up your live data from Supabase. Run this command on your VPS (or any terminal that has postgres installed):

```bash
# Export the entire database schema and data to a file
pg_dump "postgresql://postgres.oqftsxdjhobstsljflov:Yogesh%408865@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" > /tmp/supabase_backup.sql
```

---

## 📤 Step 4: Import Data into VPS PostgreSQL
Now, restore the backup file directly into your newly created local database:

```bash
# Import the file into your local VPS database
psql -U rison_user -d rison_db -h localhost -f /tmp/supabase_backup.sql
```
*Note: If it asks for a password, enter the password you created in Step 2 (`YourSecurePasswordHere`).*

---

## ⚙️ Step 5: Update the Application Configuration
Now we need to tell your backend Express API to talk to the local database instead of Supabase.

1. **Open the environment file:**
   ```bash
   nano /var/www/resume-screening-app/.env
   ```

2. **Update the `DATABASE_URL` line:**
   ```env
   # Replace the old Supabase URL with this:
   DATABASE_URL=postgresql://rison_user:YourSecurePasswordHere@localhost:5432/rison_db
   ```

3. **Save and close the file:**
   * Press `Ctrl + O` and `Enter` to save.
   * Press `Ctrl + X` to exit.

---

## 🔄 Step 6: Restart the Backend Services
To load the new database settings, restart your PM2 application processes:

```bash
# Restart both backend API and workers
pm2 restart all
```

---

## 🧹 Step 7: Cleanup
Delete the temporary backup file for security:
```bash
rm /tmp/supabase_backup.sql
```

You are now successfully running your PostgreSQL database completely locally on your VPS!
