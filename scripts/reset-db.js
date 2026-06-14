'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MANAGER_EMAIL = process.env.DEV_MANAGER_EMAIL;

const DEV_BARN_ID = '00000000-0000-0000-0000-000000000b41';
const DEV_BARN_SLUG = 'dev-barn';
const DEV_BARN_NAME = 'Dev Barn';

const DEV_TRAINERS = [
  { email: 'trainer1@dev.local', firstName: 'Alex',  lastName: 'Trainer' },
  { email: 'trainer2@dev.local', firstName: 'Blake', lastName: 'Trainer' },
  { email: 'trainer3@dev.local', firstName: 'Casey', lastName: 'Trainer' },
];

const DEV_RIDERS = [
  { email: 'rider1@dev.local', firstName: 'Dana',   lastName: 'Rider', riderName: 'Dana Rider' },
  { email: 'rider2@dev.local', firstName: 'Emery',  lastName: 'Rider', riderName: 'Emery Rider' },
  { email: 'rider3@dev.local', firstName: 'Finley', lastName: 'Rider', riderName: 'Finley Rider' },
];

const DEV_HORSES = ['Apple', 'Butter', 'Clover'];

// Returns a Date set to the given hour (UTC) offset by `days` days from `base`.
function dayOffset(base, days, hour = 10) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function buildLessonDates(now) {
  const dates = [];
  // 10 older than one week: T-17 through T-8
  for (let i = 17; i >= 8; i--) {
    dates.push(dayOffset(now, -i));
  }
  // 10 within past week: T-6 through T-1, morning + afternoon on some days
  const recentSlots = [
    [-6, 9], [-6, 15],
    [-5, 9], [-5, 15],
    [-4, 9], [-4, 15],
    [-3, 9],
    [-2, 9],
    [-1, 9], [-1, 15],
  ];
  for (const [day, hour] of recentSlots) {
    dates.push(dayOffset(now, day, hour));
  }
  // 5 in next week: T+1 through T+5
  for (let i = 1; i <= 5; i++) {
    dates.push(dayOffset(now, i));
  }
  return dates;
}

function mustSucceed(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function run() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Tearing down existing dev fixtures…');

  // Collect dev user IDs before deleting memberships
  const memberships = mustSucceed(
    await supabase.from('barn_memberships').select('user_id').eq('barn_id', DEV_BARN_ID),
    'fetch memberships'
  );
  const devUserIds = (memberships ?? []).map((m) => m.user_id);

  mustSucceed(await supabase.from('lesson_riders').delete().eq('barn_id', DEV_BARN_ID), 'delete lesson_riders');
  mustSucceed(await supabase.from('lesson_horses').delete().eq('barn_id', DEV_BARN_ID), 'delete lesson_horses');
  mustSucceed(await supabase.from('lesson_tiers').delete().eq('barn_id', DEV_BARN_ID), 'delete lesson_tiers');
  mustSucceed(await supabase.from('lessons').delete().eq('barn_id', DEV_BARN_ID), 'delete lessons');
  mustSucceed(await supabase.from('riders').delete().eq('barn_id', DEV_BARN_ID), 'delete riders');
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', DEV_BARN_ID), 'delete horses');
  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', DEV_BARN_ID), 'delete barn_memberships');
  mustSucceed(await supabase.from('seeded_accounts').delete().eq('barn_id', DEV_BARN_ID), 'delete seeded_accounts');
  mustSucceed(await supabase.from('barns').delete().eq('id', DEV_BARN_ID), 'delete barn');

  if (devUserIds.length > 0) {
    mustSucceed(
      await supabase.from('profiles').delete().in('user_id', devUserIds),
      'delete profiles'
    );
    for (const userId of devUserIds) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw new Error(`delete auth user ${userId}: ${error.message}`);
    }
  }

  console.log('Re-seeding dev fixtures…');

  mustSucceed(
    await supabase.from('barns').insert({ id: DEV_BARN_ID, name: DEV_BARN_NAME, slug: DEV_BARN_SLUG }),
    'insert barn'
  );

  mustSucceed(
    await supabase.from('seeded_accounts').insert({
      email: MANAGER_EMAIL,
      role: 'manager',
      barn_id: DEV_BARN_ID,
    }),
    'insert seeded_account'
  );

  // Create trainer auth users
  const trainerIds = [];
  for (const t of DEV_TRAINERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: t.email,
      email_confirm: true,
    });
    if (error) throw new Error(`create trainer ${t.email}: ${error.message}`);
    trainerIds.push(data.user.id);
  }

  // Create rider auth users
  const riderIds = [];
  for (const r of DEV_RIDERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: r.email,
      email_confirm: true,
    });
    if (error) throw new Error(`create rider ${r.email}: ${error.message}`);
    riderIds.push(data.user.id);
  }

  // Profiles for trainers
  mustSucceed(
    await supabase.from('profiles').insert(
      DEV_TRAINERS.map((t, i) => ({
        user_id: trainerIds[i],
        first_name: t.firstName,
        last_name: t.lastName,
      }))
    ),
    'insert trainer profiles'
  );

  // Profiles for riders
  mustSucceed(
    await supabase.from('profiles').insert(
      DEV_RIDERS.map((r, i) => ({
        user_id: riderIds[i],
        first_name: r.firstName,
        last_name: r.lastName,
      }))
    ),
    'insert rider profiles'
  );

  // Barn memberships for trainers
  mustSucceed(
    await supabase.from('barn_memberships').insert(
      trainerIds.map((id) => ({
        user_id: id,
        barn_id: DEV_BARN_ID,
        role: 'trainer',
        status: 'active',
      }))
    ),
    'insert trainer memberships'
  );

  // Barn memberships for riders
  mustSucceed(
    await supabase.from('barn_memberships').insert(
      riderIds.map((id) => ({
        user_id: id,
        barn_id: DEV_BARN_ID,
        role: 'rider',
        status: 'active',
      }))
    ),
    'insert rider memberships'
  );

  // Riders table rows (rider_id stored for lesson linking)
  const riderRowIds = [];
  for (let i = 0; i < DEV_RIDERS.length; i++) {
    const result = mustSucceed(
      await supabase
        .from('riders')
        .insert({ barn_id: DEV_BARN_ID, name: DEV_RIDERS[i].riderName, user_id: riderIds[i] })
        .select('id')
        .single(),
      `insert rider row ${i}`
    );
    riderRowIds.push(result.id);
  }

  // Horses
  const horseIds = [];
  for (const name of DEV_HORSES) {
    const result = mustSucceed(
      await supabase
        .from('horses')
        .insert({ barn_id: DEV_BARN_ID, name })
        .select('id')
        .single(),
      `insert horse ${name}`
    );
    horseIds.push(result.id);
  }

  // 25 lessons
  const lessonDates = buildLessonDates(new Date());

  for (let i = 0; i < lessonDates.length; i++) {
    const instructorId = trainerIds[i % trainerIds.length];
    const horseId = horseIds[i % horseIds.length];
    const riderRowId = riderRowIds[i % riderRowIds.length];

    const lesson = mustSucceed(
      await supabase
        .from('lessons')
        .insert({
          barn_id: DEV_BARN_ID,
          instructor_id: instructorId,
          lesson_at: lessonDates[i].toISOString(),
          lesson_type: 'normal',
          tier_name: 'Custom',
        })
        .select('id')
        .single(),
      `insert lesson ${i}`
    );

    mustSucceed(
      await supabase.from('lesson_horses').insert({
        barn_id: DEV_BARN_ID,
        lesson_id: lesson.id,
        horse_id: horseId,
        exertion_level: 3,
      }),
      `insert lesson_horse ${i}`
    );

    mustSucceed(
      await supabase.from('lesson_riders').insert({
        barn_id: DEV_BARN_ID,
        lesson_id: lesson.id,
        rider_id: riderRowId,
      }),
      `insert lesson_rider ${i}`
    );
  }

  console.log('Done. Dev database reset to known state:');
  console.log(`  Barn:     ${DEV_BARN_NAME} (slug: ${DEV_BARN_SLUG})`);
  console.log(`  Manager:  ${MANAGER_EMAIL} (via seeded_accounts — sign in with Google to activate)`);
  console.log(`  Trainers: ${DEV_TRAINERS.map((t) => t.email).join(', ')}`);
  console.log(`  Riders:   ${DEV_RIDERS.map((r) => r.email).join(', ')}`);
  console.log(`  Horses:   ${DEV_HORSES.join(', ')}`);
  console.log(`  Lessons:  25 (10 older than 1 week, 10 within past week, 5 next week)`);
}

run().catch((err) => {
  console.error('reset-db failed:', err.message);
  process.exit(1);
});
