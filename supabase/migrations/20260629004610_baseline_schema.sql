-- Consolidated baseline (#657): enums, tables, constraints, indexes, and seed
-- data for everything through v2.0.2. Replaces the 93 files now archived at
-- supabase/migrations_archive/ (history kept there, not deleted). Content was
-- derived by replaying the full archived history on a throwaway Postgres
-- instance and diffing the result against this baseline with migra until the
-- diff was empty — see supabase/migrations_archive/README.md.

CREATE TYPE public.horse_document_type AS ENUM (
    'insurance_binder',
    'coggins',
    'shot_record',
    'contract',
    'other'
);

CREATE TYPE public.lesson_type AS ENUM (
    'normal',
    'group'
);

CREATE TYPE public.payment_type_enum AS ENUM (
    'venmo',
    'zelle',
    'cash',
    'check',
    'freshbooks'
);

CREATE TYPE public.rider_document_type AS ENUM (
    'liability_waiver',
    'lease_agreement',
    'boarding_contract',
    'other'
);

CREATE TYPE public.trainer_document_type AS ENUM (
    'instructor_contract',
    'other'
);

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    instructor_id uuid,
    fee numeric,
    lesson_at timestamp with time zone NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    lesson_type public.lesson_type DEFAULT 'normal'::public.lesson_type NOT NULL,
    jumping boolean DEFAULT false NOT NULL,
    payment_type public.payment_type_enum,
    tier_name text DEFAULT 'Custom'::text NOT NULL
);

CREATE TABLE public.barn_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    barn_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    can_instruct boolean DEFAULT false NOT NULL,
    profile_id uuid NOT NULL,
    invite_token uuid,
    CONSTRAINT barn_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text])))
);

CREATE TABLE public.barns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.horse_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    horse_id uuid NOT NULL,
    record_type public.horse_document_type NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.horses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    unavailability_reason text
);

CREATE TABLE public.lesson_horses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    horse_id uuid NOT NULL,
    exertion_level smallint DEFAULT 3 NOT NULL,
    horse_notes text,
    CONSTRAINT lesson_horses_exertion_level_check CHECK (((exertion_level >= 1) AND (exertion_level <= 5)))
);

CREATE TABLE public.lesson_riders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    rider_id uuid NOT NULL,
    rider_notes text,
    private_notes text
);

CREATE TABLE public.lesson_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    name text NOT NULL,
    price numeric(10,2),
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_exertion_level smallint,
    default_jumping boolean,
    CONSTRAINT lesson_tiers_default_exertion_level_check CHECK (((default_exertion_level >= 1) AND (default_exertion_level <= 5)))
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    barn_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
    user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    phone text,
    emergency_contact_name text,
    emergency_contact_phone text,
    is_managed boolean DEFAULT false NOT NULL
);

CREATE TABLE public.rider_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    rider_id uuid NOT NULL,
    record_type public.rider_document_type NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.roles (
    name text NOT NULL,
    CONSTRAINT roles_name_check CHECK ((name = ANY (ARRAY['manager'::text, 'trainer'::text, 'rider'::text])))
);

CREATE TABLE public.seeded_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    barn_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.trainer_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    barn_id uuid NOT NULL,
    trainer_id uuid NOT NULL,
    record_type public.trainer_document_type NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_user_id_barn_id_key UNIQUE NULLS NOT DISTINCT (user_id, barn_id);

ALTER TABLE ONLY public.barns
    ADD CONSTRAINT barns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.barns
    ADD CONSTRAINT barns_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.horse_documents
    ADD CONSTRAINT horse_documents_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.horse_documents
    ADD CONSTRAINT horse_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.horses
    ADD CONSTRAINT horses_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.horses
    ADD CONSTRAINT horses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lesson_horses
    ADD CONSTRAINT lesson_horses_lesson_id_horse_id_key UNIQUE (lesson_id, horse_id);

ALTER TABLE ONLY public.lesson_horses
    ADD CONSTRAINT lesson_horses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lesson_riders
    ADD CONSTRAINT lesson_riders_lesson_id_rider_id_key UNIQUE (lesson_id, rider_id);

ALTER TABLE ONLY public.lesson_riders
    ADD CONSTRAINT lesson_riders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lesson_tiers
    ADD CONSTRAINT lesson_tiers_barn_id_id_unique UNIQUE (barn_id, id);

ALTER TABLE ONLY public.lesson_tiers
    ADD CONSTRAINT lesson_tiers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_barn_id_type_key UNIQUE (user_id, barn_id, type);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

ALTER TABLE ONLY public.rider_documents
    ADD CONSTRAINT rider_documents_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.rider_documents
    ADD CONSTRAINT rider_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.seeded_accounts
    ADD CONSTRAINT seeded_accounts_email_key UNIQUE (email);

ALTER TABLE ONLY public.seeded_accounts
    ADD CONSTRAINT seeded_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trainer_documents
    ADD CONSTRAINT trainer_documents_barn_id_id_key UNIQUE (barn_id, id);

ALTER TABLE ONLY public.trainer_documents
    ADD CONSTRAINT trainer_documents_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX barn_memberships_invite_token_unique ON public.barn_memberships USING btree (invite_token) WHERE (invite_token IS NOT NULL);

CREATE UNIQUE INDEX profiles_email_unique ON public.profiles USING btree (email) WHERE (email IS NOT NULL);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name);

ALTER TABLE ONLY public.barn_memberships
    ADD CONSTRAINT barn_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.horse_documents
    ADD CONSTRAINT horse_documents_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.horse_documents
    ADD CONSTRAINT horse_documents_barn_id_horse_id_fkey FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses(barn_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.horses
    ADD CONSTRAINT horses_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_horses
    ADD CONSTRAINT lesson_horses_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_horses
    ADD CONSTRAINT lesson_horses_barn_id_horse_id_fkey FOREIGN KEY (barn_id, horse_id) REFERENCES public.horses(barn_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_horses
    ADD CONSTRAINT lesson_horses_barn_id_lesson_id_fkey FOREIGN KEY (barn_id, lesson_id) REFERENCES public.lessons(barn_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_riders
    ADD CONSTRAINT lesson_riders_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_riders
    ADD CONSTRAINT lesson_riders_barn_id_lesson_id_fkey FOREIGN KEY (barn_id, lesson_id) REFERENCES public.lessons(barn_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_riders
    ADD CONSTRAINT lesson_riders_barn_id_rider_id_fkey FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships(barn_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lesson_tiers
    ADD CONSTRAINT lesson_tiers_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id);

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rider_documents
    ADD CONSTRAINT rider_documents_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rider_documents
    ADD CONSTRAINT rider_documents_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.seeded_accounts
    ADD CONSTRAINT seeded_accounts_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.seeded_accounts
    ADD CONSTRAINT seeded_accounts_role_fkey FOREIGN KEY (role) REFERENCES public.roles(name);

ALTER TABLE ONLY public.trainer_documents
    ADD CONSTRAINT trainer_documents_barn_id_fkey FOREIGN KEY (barn_id) REFERENCES public.barns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trainer_documents
    ADD CONSTRAINT trainer_documents_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Seed data (admin role was collapsed in a later historical migration; not carried forward)
INSERT INTO public.roles (name) VALUES ('manager'), ('trainer'), ('rider');

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
