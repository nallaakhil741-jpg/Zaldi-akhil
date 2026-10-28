# Zaldi Admin data and Firebase setup

The admin console uses Firebase Authentication (email/password) and Cloud Firestore. Without Firebase configuration, it starts in a clearly labeled local demo mode; edits in that mode are held in browser memory and are not persisted.

## Configure Firebase

1. Create a Firebase project and register a web app.
2. Enable **Authentication → Email/Password** and create the administrator account.
3. Configure the web app values in an untracked `.env.local` file:

   ```dotenv
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

4. Assign the account an admin custom claim from a trusted server using the Firebase Admin SDK. The client accepts `admin: true` or `role: "admin"`; do not assign custom claims from client code.
5. Apply restrictive Firestore rules before putting real customer, payment, or driver data in the project. For example:

   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{collection}/{record} {
         allow read, write: if request.auth != null
           && (request.auth.token.admin == true || request.auth.token.role == "admin");
       }
     }
   }
   ```

   This example grants admin access to all documents. Use narrower collection rules and least-privilege claims if different staff roles need different permissions.

6. Restart the Vite development server or rebuild the app so the `VITE_FIREBASE_*` values are loaded.

The browser Firebase configuration is public client configuration, not a secret. Firestore rules and trusted admin claims are the security boundary. Do not put Firebase Admin SDK credentials in this application.

## Live collections

The console subscribes to these Firestore collections and supports adding, editing, deleting, filtering, and CSV export:

| Console area | Collection names |
| --- | --- |
| Bookings and fleet | `orders`, `drivers`, `customers`, `vehicleTypes`, `bookingStatuses` |
| Locations | `cities`, `zones` |
| Finance | `paymentMethods`, `commissions`, `transactions`, `wallets`, `invoices`, `refunds` |
| Administration | `roles`, `permissions`, `supportTickets`, `content`, `systemSettings` |

Documents may omit an `id` field; the document ID is exposed as the record ID in the UI. Fields shown by each management form are stored directly on the document. Firestore permission and listener errors are displayed in the console rather than replaced with demo records.

CSV downloads include only the currently filtered rows. Cell values are quoted and escaped, and values that could be interpreted as spreadsheet formulas are prefixed to reduce CSV-formula injection risk.