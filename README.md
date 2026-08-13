# Life Metrics

A private, mobile-first React frontend for reading and updating daily entries in the `Main` tab of the **Life Metrics** Google Sheet. The app runs entirely in the browser and writes through the Google Sheets API using the signed-in user's permissions.

Submitted days are saved on the current device before they are sent to Google Sheets. After the app has been opened online once, its shell and previously viewed days remain available offline. Any days submitted while disconnected are marked pending and synchronized when connectivity and a valid Google session return; the device's submitted version overwrites the visible fields for that Sheet date.

## Local setup

Requirements: Node.js 22 and a Google Cloud project.

1. In Google Cloud Console, enable the **Google Sheets API**.
2. Configure an OAuth consent screen. If the app remains in testing mode, add every intended Google account as a test user.
3. Create an **OAuth 2.0 Client ID** with application type **Web application**.
4. Add these Authorized JavaScript origins:
   - `http://localhost:5173`
   - Your GitHub Pages origin, such as `https://YOUR-USER.github.io` (origin only; do not include the repository path).
5. Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_SPREADSHEET_ID=your-google-spreadsheet-id
VITE_SHEET_NAME=Main
```

6. Install and run:

```sh
npm install
npm run dev
```

The OAuth client ID and spreadsheet ID are browser configuration, not secrets: Vite embeds them in the production JavaScript. Google Sheet sharing permissions control who can read and write the data. Never add a Google OAuth client secret to this project.

## Sheet contract

The app uses the existing A:T layout:

| Columns | Data |
| --- | --- |
| A | Date |
| B:L | Discomfort, Meditation, Diet, Exercise, Coding/career, Family, Socialising, Panic, Energy, Sleep, Mood |
| M | J (`Y` or `N`) |
| N:Q | Climbing, Work, Cooking, Dating (preserved and hidden by the app) |
| R | Quality of day |
| S | Stories (preserved and hidden by the app) |
| T | Notes |

Existing rows are updated only in B:M, R, and T. A newly selected date is appended as an A:T row, with the hidden fields left blank and the date/dropdown cell structure applied.

All visible daily values are optional except the date. A nonblank score must be a number from 1 through 10. Clicking an already-selected J or quality option clears it.

## Tests and production build

```sh
npm test
npm run build
```

Tests mock the Google APIs and never write to the live Life Metrics spreadsheet.

## GitHub Pages deployment

The workflow in `.github/workflows/deploy.yml` tests and builds the app on Node.js 22, then deploys `dist` from the repository's default branch. The Vite build uses relative asset paths, so it works with project Pages URLs without hard-coding a repository name.

In the GitHub repository:

1. Open **Settings → Secrets and variables → Actions → Variables**.
2. Add `VITE_GOOGLE_CLIENT_ID` and `VITE_SPREADSHEET_ID`.
3. Optionally add `VITE_SHEET_NAME`; it defaults to `Main`.
4. Open **Settings → Pages** and choose **GitHub Actions** as the source.
5. Push to the default branch or run the workflow manually.

If the deployed hostname changes, add its origin to the OAuth client's Authorized JavaScript origins before signing in.
