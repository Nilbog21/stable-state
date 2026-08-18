-- #1004: single overwritable profile picture, mirrors horses.photo_path (#1002).
ALTER TABLE public.profiles ADD COLUMN photo_path text;
