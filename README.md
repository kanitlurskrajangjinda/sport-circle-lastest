# Sport Circle 🏟️
**An Integrated Online Sports Facility Booking, Equipment Inventory, and Court Management Platform**

🏆 **First Prize Winner (1st Place)** — **DBI Day 2026**, Digital Business Innovation, Maejo University  
🌐 **Live Demo:** [https://sport-circle-website-yh26.onrender.com](https://sport-circle-website-yh26.onrender.com)

---

## 🏆 Achievements & Recognition
<img width="828" height="608" alt="DBI Day 2026 First Prize Award" src="https://github.com/user-attachments/assets/5569702f-2c6a-4085-b6dd-edb22f0e9ffc" />

* **First Prize Winner (🥇 1st Place):** Digital Innovation & System Presentation Competition at **DBI Day 2026**

---

## 📋 Overview
**Sport Circle** is a full-featured web application designed for real-time sports facility booking, court schedule management, sports equipment rental/retail inventory control, and financial reconciliation. Built with Role-Based Access Control (RBAC), the platform supports four distinct user roles—**Customer (User)**, **Facility Owner (Owner)**, **Venue Staff (Staff)**, and **System Administrator (Admin)**—and integrates automated payment slip verification powered by **Google Gemini AI**.

---

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+), Chart.js, Lucide Icons, `html5-qrcode`, `html2pdf.js`, `docx.js`
* **Backend:** Node.js HTTP Server (`server.js`) providing a REST API endpoint (`/api/verify-slip`) powered by the Google Gemini API (`gemini-3.5-flash-lite`)
* **Database & BaaS:** Supabase (PostgreSQL, Authentication, Real-time Subscriptions, Storage)
* **Deployment:** Render (Cloud Web Service)

---

## ✨ Key Features

### 1. Customer Portal (User)
* **Search & Filter Facilities:** Browse sports venues by sport category (Football, Badminton, Basketball, Futsal, Volleyball) and filter by province across Thailand.
* **Real-Time Court Booking & Equipment Add-ons:** View facility photos, amenities, and interactive Google Maps; select dates and hourly time slots in real time; and rent or purchase add-on sports equipment with automatic time-slot stock reservation and deduction.
* **AI Payment Slip Verification & E-Ticket:** Upload bank transfer slips for instant verification of payment authenticity and amount via Google Gemini AI, receiving a digital E-Ticket with a QR Code for venue check-in.
* **Booking History:** Track past and upcoming reservations and real-time check-in statuses at any time.

### 2. Facility Owner & Admin Suite (Owner & Admin)
* **Equipment & Financial Management Dashboard (`equip-dashboard.js`):** A comprehensive 6-tab control center covering Equipment & Retail Inventory, Active Rentals & Returns, Damages/Repairs & Penalty Fees, Cash Shift & Payment Channel Reconciliation, Customer Consolidated Folios, and Visual Analytics.
* **Executive Report Exports:** Instantly export statistical, financial, and inventory summary reports in **PDF** and **DOCX (Microsoft Word)** formats.
* **Multi-Court Matrix Schedule:** Real-time hourly court occupancy matrix supporting walk-in bookings and post-booking equipment add-ons.
* **User & Role Administration:** Manage user roles (Admin, Owner, Staff, User), monitor platform-wide KPIs, and handle customer support tickets.

### 3. Venue Operations & Check-In (Staff)
* **QR Code Check-In Scanner:** Scan customer E-Ticket QR codes using a mobile/device camera or search by phone number, customer name, or booking reference to verify identity and record hourly check-ins.

---

## 📂 Project Structure
* `index.html` : Main single-page application layout containing all views and modals
* `app.js` : Core frontend logic (Authentication, Booking Engine, State Management, UI Rendering, AI Slip Verification)
* `data.js` : Seed data structures and default platform configurations
* `equip-dashboard.js` : Admin facility & equipment management dashboard, cash shift reconciliation, consolidated folios, and PDF/DOCX report generator
* `server.js` : Node.js static file server and `/api/verify-slip` endpoint integrating Google Gemini AI
* `style.css` : Modern, responsive stylesheet with a clean blue-and-white theme
* `package.json` : Project metadata, scripts, and dependencies

---

## 🚀 Local Setup & Installation
1. Install dependencies via Node.js:
   ```bash
   npm install
   ```
2. Set your Google Gemini API key and start the server:
   ```bash
   export GEMINI_API_KEY="your_api_key_here"
   npm start
   ```
3. Open `http://localhost:3000` in your browser.
