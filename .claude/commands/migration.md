# New Migration

I need a new Supabase migration: $ARGUMENTS

- Create it with `npx supabase migration new <name>` (timestamped filename; older files use 001–012 numbering — don't continue that scheme)
- Never edit existing migrations retroactively — always add a new file
- Enable RLS on any new table (see `supabase/migrations/20260701215852_enable_rls.sql` for the pattern)
- Test with `npm run supabase:db:reset` after writing it
