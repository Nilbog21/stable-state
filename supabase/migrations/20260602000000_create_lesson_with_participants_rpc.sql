create or replace function create_lesson_with_participants(
  p_barn_id         uuid,
  p_instructor_id   uuid,
  p_lesson_at       timestamptz,
  p_fee             numeric,
  p_horse_ids       uuid[],
  p_exertion_levels smallint[],
  p_rider_id        uuid
)
returns lessons
language plpgsql
security invoker
as $$
declare
  v_lesson lessons;
begin
  insert into lessons (barn_id, instructor_id, lesson_at, fee)
  values (p_barn_id, p_instructor_id, p_lesson_at, p_fee)
  returning * into v_lesson;

  insert into lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  select v_lesson.id, h, p_barn_id, e
  from unnest(p_horse_ids, p_exertion_levels) as t(h uuid, e smallint);

  insert into lesson_riders (lesson_id, rider_id, barn_id)
  values (v_lesson.id, p_rider_id, p_barn_id);

  return v_lesson;
end;
$$;
