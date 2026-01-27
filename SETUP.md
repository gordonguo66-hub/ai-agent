# Setup Guide

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Note:** `CREDENTIALS_ENCRYPTION_KEY` will be **auto-generated** on first run! Check your `.env.local` after starting the dev server.

### How to Get Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Navigate to **Project Settings** > **API**
3. Copy the following:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Database Setup

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste it into the SQL Editor
5. Click **Run** (or press Cmd/Ctrl + Enter)

This will create:
- All necessary tables (profiles, strategies, paper_runs, arena_entries, posts, comments)
- Row Level Security (RLS) policies
- A trigger to automatically create profiles when users sign up

## Installation & Running

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000)

## Manual Supabase Steps

After running the SQL schema:

1. **Enable Email Auth** (if not already enabled):
   - Go to **Authentication** > **Providers**
   - Ensure **Email** provider is enabled
   - Configure email templates if needed

2. **Verify RLS is enabled**:
   - Go to **Table Editor**
   - Check that all tables show "RLS enabled" badge

## Testing the App

1. **Sign Up**: Go to `/auth` and create an account
2. **Create Strategy**: Navigate to `/strategy/new` and create your first strategy
3. **Run Paper Trading**: From dashboard, click "Run Paper" on a strategy
4. **View Results**: See the equity curve and metrics on the run detail page
5. **Join Arena**: Click "Join Arena" on a run to add it to the leaderboard
6. **Community**: Create posts and comments in `/community`

## Troubleshooting

### "Unauthorized" errors
- Check that your `.env.local` file has correct Supabase credentials
- Verify RLS policies are set up correctly in Supabase

### Database connection issues
- Ensure Supabase project is active (not paused)
- Check that the SQL schema was run successfully
- Verify table names match exactly (case-sensitive)

### Auth redirects not working
- Clear browser cookies
- Check that middleware.ts is in the root directory
- Verify Supabase auth settings allow email/password signup

## Project Structure

```
AI Agent/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── auth/              # Authentication page
│   ├── dashboard/         # User dashboard
│   ├── strategy/          # Strategy creation
│   ├── arena/             # Leaderboard (public)
│   └── community/         # Community posts
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── ...               # Feature components
├── lib/                  # Utilities
│   ├── supabase/        # Supabase clients
│   └── ai/              # AI intent schema stub
├── supabase/
│   └── schema.sql       # Database schema
└── middleware.ts        # Route protection
```

## Notes

- Paper trading is **simulated** and deterministic (same strategy = same results)
- API keys are stored as plaintext for MVP (field named `api_key_ciphertext` for future encryption)
- AI model calls are **stubbed** - no actual API calls are made
- All routes except `/` and `/auth` require authentication (enforced by middleware)
