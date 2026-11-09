# MALAWIAN VIBES — Kupititsa luso patali

This is a starter website for a Malawi music platform with:
- Artist registration and login (Supabase Auth)
- Artist dashboard and song uploads
- MK 3,000 manual payment-reference workflow
- Admin dashboard to verify payments and publish/reject tracks
- Public music discovery page
- Malawi-inspired black, red and green design

## Important payment note
This version does **not** automatically deduct money from an artist's Airtel Money or TNM Mpamba wallet. A normal personal wallet number cannot be charged by a website. The artist sends MK 3,000 to the displayed number, enters the transaction reference, and the admin must check the real wallet statement/message before approving. Never ask artists for their mobile-money PIN or OTP. For automatic payments later, apply for an official merchant/business API or supported payment gateway.

## 1. Create Supabase project
1. Create a project at https://supabase.com/.
2. Open **SQL Editor** and run all of `supabase/schema.sql`.
3. Open **Project Settings → API** and copy the Project URL and anon/public key.
4. Open `config.js` and replace:
   - `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE`
   - `PASTE_YOUR_SUPABASE_ANON_KEY_HERE`
5. Never paste a `service_role` key into this website or share it.

## 2. Make your account the admin
1. Register your own account through the website.
2. In Supabase → SQL Editor, run this command, replacing the email:
   `update public.profiles set role='admin' where email='YOUR_LOGIN_EMAIL';`
3. Log out and log back in. The Admin Dashboard will appear.

Do not give admin access to other accounts.

## 3. Preview the website
Open `index.html` in a browser after configuring Supabase. For production, deploy the folder to Netlify or push its contents to GitHub and connect the repository.

## 4. GitHub upload from a phone
- Extract the ZIP first using your phone's Files app.
- In GitHub repository, choose **Add file → Upload files**.
- Upload the contents of the extracted project folder (index.html, style.css, app.js, config.js, README.md and the `supabase` folder).
- Commit the changes.
- In Netlify, connect the GitHub repository. Since this is a static site, no build command is needed; publish directory is `/` (repository root).

## Contact details configured
- Airtel Money: 0991801460
- TNM Mpamba: 0880 68 10 12
- WhatsApp: +27 67 993 1023

Review all contact and payment details before publishing publicly.


## 5. Supabase connection for the configured project
- `config.js` has been filled with the supplied project URL and publishable key.
- The URL must be the project root (`https://...supabase.co`), not the REST endpoint ending in `/rest/v1/`.
- Run the complete `supabase/schema.sql` in Supabase **SQL Editor** if it has not already been run.
- In **Authentication → Providers → Email**, enable Email sign-in. If email confirmation is enabled, confirm the registration email before logging in.
- In **Authentication → URL Configuration**, add the deployed Netlify URL to the allowed redirect URLs.
- Register your own artist account first. Then run this in SQL Editor with your exact email:
  `update public.profiles set role='admin' where email='YOUR_LOGIN_EMAIL';`
  Log out and back in to refresh the role.
- Never place a Supabase secret key or service_role key in `config.js`.

The auth callback now defers profile loading until Supabase has finished its callback, and missing or unreadable profile records show a diagnostic message.
