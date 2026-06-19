'use strict';

const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function mustSucceed(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function resolveBarnId(supabase, slug) {
  const { data, error } = await supabase
    .from('barns')
    .select('id')
    .eq('slug', slug)
    .single();
  if (error || !data) throw new Error(`Barn slug not found: "${slug}"`);
  return data.id;
}

async function seedProfile(supabase, { email, firstName, lastName, barnId }) {
  mustSucceed(
    await supabase.from('profiles').insert({
      email,
      first_name: firstName,
      last_name: lastName,
      barn_id: barnId,
      role: 'manager',
    }),
    'insert profile'
  );
}

function prompt(rl, question) {
  return new Promise((resolve, reject) => {
    rl.question(question, resolve);
    rl.once('close', () => reject(new Error('Input closed unexpectedly')));
  });
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const email = (await prompt(rl, 'Email: ')).trim();
  const firstName = (await prompt(rl, 'First name: ')).trim();
  const lastName = (await prompt(rl, 'Last name: ')).trim();
  const slug = (await prompt(rl, 'Barn slug: ')).trim();

  rl.close();

  const barnId = await resolveBarnId(supabase, slug);
  await seedProfile(supabase, { email, firstName, lastName, barnId });

  console.log(`\nSeeded ${firstName} ${lastName} <${email}> as manager for barn "${slug}".`);
  console.log('They can sign in with Google to activate their account.');
  console.log('Note: to enable instructor access after sign-in, toggle "Can instruct" in barn Settings → Members.');
}

if (require.main === module) {
  run().catch((err) => {
    console.error('seed-account failed:', err.message);
    process.exit(1);
  });
} else {
  module.exports = { mustSucceed, resolveBarnId, seedProfile };
}
