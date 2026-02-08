# Dota 2 Match Announcer (Cloudflare Worker)

This is a refactored version of the Dota 2 Match Announcer, implemented as a Cloudflare Worker using TypeScript. It leverages Cloudflare's D1 for database persistence, KV for caching/state, and cron triggers for scheduled polling.

## Prerequisites

- Node.js (LTS recommended)
- npm or yarn
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd dota-match-announcer
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables (Secrets)**

    You need to set the `TELEGRAM_BOT_TOKEN` and `PANDASCORE_TOKEN` as secrets in your Cloudflare Worker.

    ```bash
    wrangler secret put TELEGRAM_BOT_TOKEN
    wrangler secret put PANDASCORE_TOKEN
    ```
    (Enter your tokens when prompted)

4.  **Create D1 Database**

    Create a D1 database for your worker. Note the `database_id` returned.

    ```bash
    wrangler d1 create dota-match-announcer
    ```

    After creation, update your `wrangler.toml` file with the `database_id` for the `dota-match-announcer` D1 binding. For example:

    ```toml
    [[d1_databases]]
    binding = "D1"
    database_name = "dota-match-announcer"
    database_id = "<YOUR_D1_DATABASE_ID>" # Paste the ID here
    migrations_dir = "src/db/migrations"
    ```

    Then, apply the schema:
    ```bash
    wrangler d1 migrations apply dota-match-announcer --local
    wrangler d1 migrations apply dota-match-announcer --remote
    ```

5.  **Create KV Namespace**

    Create a KV namespace for your worker. Note the `id` returned.

    ```bash
    wrangler kv namespace create NOTIFICATIONS_KV
    ```

    After creation, update your `wrangler.toml` file with the `id` for the `NOTIFICATIONS_KV` binding. For example:

    ```toml
    [[kv_namespaces]]
    binding = "NOTIFICATIONS_KV"
    id = "<YOUR_KV_NAMESPACE_ID>" # Paste the ID here
    preview_id = "<YOUR_KV_NAMESPACE_ID>" # Use the same ID for preview
    ```

## Local Development

1.  **Create a `.dev.vars` file:**

    This file will hold environment variables for local development. It should NOT be committed to version control.

    ```
    TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
    PANDASCORE_TOKEN="YOUR_PANDASCORE_TOKEN"
    ```

2.  **Start the development server:**
    ```bash
    npm start
    ```
    Wrangler will open a local development server. You can test your Telegram webhook by sending POST requests to `http://localhost:8787/telegram-webhook` with Telegram update objects.

    For D1 local development, Wrangler will set up a local SQLite database.

## Deployment

### Manual Deployment

To deploy your worker to Cloudflare manually:

```bash
npm run deploy
```

### Automated Deployment (CI/CD)

The project includes a GitHub Actions workflow (`.github/workflows/ci.yml`) that automatically:

1. **Runs linting** - Validates code quality with ESLint
2. **Runs tests** - Executes the test suite
3. **Applies database migrations** - Automatically applies any new D1 migrations to production
4. **Deploys to Cloudflare Workers** - Deploys the latest code to production

**Deployment triggers:**
- Automatically deploys on push to the `main` branch
- Only deploys if all tests pass

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token (for deployment and migrations)
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `PANDASCORE_TOKEN` - Your PandaScore API token

To set up these secrets:
1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add each secret with the appropriate value

## Project Structure (New)

-   `src/index.ts`: Main entry point for the Cloudflare Worker, handling HTTP requests and cron triggers.
-   `src/bot/index.ts`: Telegraf bot instance and primary update handler.
-   `src/bot/commands/`: Individual command handlers (e.g., `start.ts`, `help.ts`).
-   `src/bot/callbacks/`: Callback query handlers for interactive menus.
-   `src/db/`: D1 database schema definitions and interaction logic.
-   `src/pandascore/`: Client for interacting with the PandaScore API.
-   `src/cron/`: Logic for the scheduled match polling task.
-   `wrangler.toml`: Cloudflare Worker configuration.
-   `tsconfig.json`: TypeScript configuration.
-   `package.json`: Project dependencies and scripts.

## Functionality Breakdown (Refactor Goals)

-   **Telegram Bot:** Reimplement existing commands (`/start`, `/help`, `/myteams`, `/searchteam`) and callback query handling using Telegraf.
-   **PandaScore Integration:** Migrate the logic for fetching match data and searching teams to the new `src/pandascore` module.
-   **User Subscriptions:** Store user and team subscription data in Cloudflare D1.
-   **Match Polling:** The cron trigger will initiate polling for upcoming matches from PandaScore.
-   **Notifications:** Send Telegram notifications for new matches based on subscriptions. Use Cloudflare KV to track sent notifications to prevent duplicates.
-   **Webhooks (Optional):** While polling is the primary method for match updates via cron, the worker can still expose an endpoint for PandaScore webhooks if desired.

This README will be updated as the refactoring progresses.
