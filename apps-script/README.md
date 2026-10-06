# 🚀 Google Apps Script Backend Setup (3 Minutes)

This script connects your 5 Google Sheets directly to the VTS Tracker Web App and sends automatic morning email alerts for devices needing recharge.

---

### Step 1: Open Google Apps Script
1. Go to **[https://script.google.com](https://script.google.com)** or inside any of your Google Sheets click **Extensions > Apps Script**.
2. Click **New project** (name it `VTS Tracker Backend`).

---

### Step 2: Paste the Code
1. Open the file `Code.gs` in the editor.
2. Select everything and replace it with the code from **`apps-script/Code.gs`** in this project.
3. Check `CONFIG.ADMIN_EMAIL` on line 36 and change it to your email where you want to receive daily alert reports.
4. Click **Save** (💾 icon or Ctrl+S).

---

### Step 3: Deploy as Web App
1. Click the blue **Deploy** button at top right $\rightarrow$ **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `VTS Tracker API v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Important: This lets the web app read & write)*
4. Click **Deploy**.
5. Grant permissions when prompted (**Authorize access** $\rightarrow$ choose your Google account $\rightarrow$ Advanced $\rightarrow$ Go to VTS Tracker Backend (unsafe) $\rightarrow$ Allow).
6. Copy the **Web App URL** (e.g., `https://script.google.com/macros/s/.../exec`).

---

### Step 4: Connect to your Web App
1. Open the VTS Tracker Web App.
2. Click the **Settings** / Gear icon in the sidebar or top bar.
3. Paste the **Web App URL** and click **Save & Test Connection**.
4. That's it! Your live fleet of 937+ devices will sync in real time.

---

### Step 5 (Optional): Set Daily 8:00 AM Email Trigger
1. In the Apps Script editor, click the **Triggers** icon (alarm clock ⏰ on the left sidebar).
2. Click **+ Add Trigger** (bottom right).
3. Set:
   - Function to run: `sendDailyExpiryEmail`
   - Event source: **Time-driven**
   - Type of time based trigger: **Day timer**
   - Time of day: **8am to 9am**
4. Click **Save**. You will now receive daily automated emails!

