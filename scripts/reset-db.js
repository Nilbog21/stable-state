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

const DEV_PENDING_RIDER = { email: 'pending1@dev.local', firstName: 'Quinn', lastName: 'Pending' };

const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'];

const DEV_TIER_NAME = 'Normal Tier';
const DEV_TIER_PRICE = 100;
const DEV_TIER_2_NAME = 'Premium Tier';
const DEV_TIER_2_PRICE = 150;

// Returns a Date set to the given hour (UTC) offset by `days` days from `base`.
function dayOffset(base, days, hour = 10) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function buildLessonDates(now) {
  const dates = [];
  // 3 lessons each in the 3 months prior to the current month
  for (let m = 3; m >= 1; m--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    dates.push(dayOffset(monthStart, 4));
    dates.push(dayOffset(monthStart, 11));
    dates.push(dayOffset(monthStart, 18));
  }
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

function getLessonVariation(i, tier1, tier2) {
  const useTier1 = i % 2 === 0;
  return {
    fee: useTier1 ? tier1.price : tier2.price,
    tierName: useTier1 ? tier1.name : tier2.name,
    jumping: useTier1,
    exertionLevel: (i % 5) + 1,
  };
}

// ~80% paid: every 5th lesson is unpaid; distribute paid slots evenly across all payment types
function getPaymentType(i, isPast) {
  if (!isPast) return null;
  if (i % 5 === 4) return null;
  return PAYMENT_TYPES[(i - Math.floor(i / 5)) % PAYMENT_TYPES.length];
}

function mustSucceed(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!MANAGER_EMAIL) throw new Error('DEV_MANAGER_EMAIL is required');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Tearing down existing dev fixtures…');

  // Collect dev user IDs via barn_memberships
  const memberships = mustSucceed(
    await supabase.from('barn_memberships').select('user_id').eq('barn_id', DEV_BARN_ID),
    'fetch memberships'
  );
  const devUserIdSet = new Set((memberships ?? []).map((m) => m.user_id));

  // Also sweep for orphaned dev auth users not captured via barn_memberships
  // (left behind if a previous run failed after creating auth users but before inserting memberships)
  const devEmails = new Set([
    ...DEV_TRAINERS.map((t) => t.email),
    ...DEV_RIDERS.map((r) => r.email),
    DEV_PENDING_RIDER.email,
  ]);
  let listPage = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: listPage, perPage: 50 });
    if (listErr) throw new Error(`list auth users: ${listErr.message}`);
    if (!listData) throw new Error('list auth users: no data returned');
    for (const user of listData.users) {
      if (devEmails.has(user.email)) devUserIdSet.add(user.id);
    }
    hasMore = listData.users.length === 50;
    listPage++;
  }
  const devUserIds = [...devUserIdSet];

  mustSucceed(
    await supabase.rpc('teardown_dev_barn_lessons', { p_barn_id: DEV_BARN_ID }),
    'delete lessons and participants'
  );
  mustSucceed(await supabase.from('lesson_tiers').delete().eq('barn_id', DEV_BARN_ID), 'delete lesson_tiers');
  mustSucceed(await supabase.from('riders').delete().eq('barn_id', DEV_BARN_ID), 'delete riders');
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', DEV_BARN_ID), 'delete horses');
  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', DEV_BARN_ID), 'delete barn_memberships');
  mustSucceed(await supabase.from('profiles').delete().eq('email', MANAGER_EMAIL), 'delete manager profile');
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

  const now = new Date();
  const barnCreatedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString();

  mustSucceed(
    await supabase.from('barns').insert({ id: DEV_BARN_ID, name: DEV_BARN_NAME, slug: DEV_BARN_SLUG, created_at: barnCreatedAt }),
    'insert barn'
  );

  mustSucceed(
    await supabase.from('profiles').insert({
      email: MANAGER_EMAIL,
      first_name: 'Dev',
      last_name: 'Manager',
      role: 'manager',
      barn_id: DEV_BARN_ID,
    }),
    'insert manager profile'
  );

  mustSucceed(
    await supabase.from('lesson_tiers').insert({
      barn_id: DEV_BARN_ID,
      name: DEV_TIER_NAME,
      price: DEV_TIER_PRICE,
      is_default: true,
      is_active: true,
    }),
    'insert lesson tier'
  );

  mustSucceed(
    await supabase.from('lesson_tiers').insert({
      barn_id: DEV_BARN_ID,
      name: DEV_TIER_2_NAME,
      price: DEV_TIER_2_PRICE,
      is_default: false,
      is_active: true,
    }),
    'insert lesson tier 2'
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

  // Pending member (no seeded_accounts row — must not auto-activate)
  const { data: pendingData, error: pendingErr } = await supabase.auth.admin.createUser({
    email: DEV_PENDING_RIDER.email,
    email_confirm: true,
  });
  if (pendingErr) throw new Error(`create pending rider: ${pendingErr.message}`);
  const pendingUserId = pendingData.user.id;

  mustSucceed(
    await supabase.from('profiles').insert({
      user_id: pendingUserId,
      first_name: DEV_PENDING_RIDER.firstName,
      last_name: DEV_PENDING_RIDER.lastName,
    }),
    'insert pending rider profile'
  );

  mustSucceed(
    await supabase.from('barn_memberships').insert({
      user_id: pendingUserId,
      barn_id: DEV_BARN_ID,
      role: 'rider',
      status: 'pending',
    }),
    'insert pending rider membership'
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

  // 34 lessons
  const lessonDates = buildLessonDates(now);
  const tier1 = { name: DEV_TIER_NAME, price: DEV_TIER_PRICE };
  const tier2 = { name: DEV_TIER_2_NAME, price: DEV_TIER_2_PRICE };

  for (let i = 0; i < lessonDates.length; i++) {
    const instructorId = trainerIds[i % trainerIds.length];
    const horseId = horseIds[i % horseIds.length];
    const riderRowId = riderRowIds[i % riderRowIds.length];
    const { fee, jumping, exertionLevel } = getLessonVariation(i, tier1, tier2);

    mustSucceed(
      await supabase.rpc('create_lesson_with_participants', {
        p_barn_id: DEV_BARN_ID,
        p_instructor_id: instructorId,
        p_lesson_at: lessonDates[i].toISOString(),
        p_fee: fee,
        p_horse_ids: [horseId],
        p_exertion_levels: [exertionLevel],
        p_rider_ids: [riderRowId],
        p_lesson_type: 'normal',
        p_jumping: jumping,
      }),
      `insert lesson ${i}`
    );
  }

  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_NAME })
      .eq('barn_id', DEV_BARN_ID).eq('fee', DEV_TIER_PRICE),
    'update lesson tier names tier 1'
  );
  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_2_NAME })
      .eq('barn_id', DEV_BARN_ID).eq('fee', DEV_TIER_2_PRICE),
    'update lesson tier names tier 2'
  );

  const pastLessons = mustSucceed(
    await supabase
      .from('lessons')
      .select('id')
      .eq('barn_id', DEV_BARN_ID)
      .lt('lesson_at', now.toISOString())
      .order('lesson_at', { ascending: true }),
    'fetch past lessons'
  );

  const ptGroups = {};
  for (let i = 0; i < pastLessons.length; i++) {
    const pt = getPaymentType(i, true);
    if (pt) { (ptGroups[pt] ??= []).push(pastLessons[i].id); }
  }
  for (const [pt, ids] of Object.entries(ptGroups)) {
    mustSucceed(
      await supabase.from('lessons').update({ payment_type: pt }).eq('barn_id', DEV_BARN_ID).in('id', ids),
      `update payment_type ${pt}`
    );
  }

  const paidCount = pastLessons.filter((_, i) => getPaymentType(i, true) !== null).length;

  console.log('Done. Dev database reset to known state:');
  console.log(`  Barn:     ${DEV_BARN_NAME} (slug: ${DEV_BARN_SLUG})`);
  console.log(`  Manager:  ${MANAGER_EMAIL} (pre-seeded profile — sign in with Google to activate)`);
  console.log(`  Trainers: ${DEV_TRAINERS.map((t) => t.email).join(', ')}`);
  console.log(`  Riders:   ${DEV_RIDERS.map((r) => r.email).join(', ')}`);
  console.log(`  Pending:  ${DEV_PENDING_RIDER.email} (${DEV_PENDING_RIDER.firstName} ${DEV_PENDING_RIDER.lastName}, awaiting approval)`);
  console.log(`  Horses:   ${DEV_HORSES.join(', ')}`);
  console.log(`  Tiers:    ${DEV_TIER_NAME} ($${DEV_TIER_PRICE}, default), ${DEV_TIER_2_NAME} ($${DEV_TIER_2_PRICE})`);
  console.log(`  Lessons:  34 (9 across prior 3 months, 10 older than 1 week, 10 within past week, 5 next week) — alternating tiers, jumping, exertion 1–5; ~${paidCount} of ${pastLessons.length} past lessons marked paid`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('reset-db failed:', err.message);
    process.exit(1);
  });
} else {
  module.exports = { buildLessonDates, mustSucceed, getLessonVariation, DEV_PENDING_RIDER, getPaymentType, PAYMENT_TYPES };
}
