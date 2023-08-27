create extension if not exists "pgtap" with schema "extensions";


create table "public"."follow" (
    "id" bigint generated by default as identity not null,
    "created_at" timestamp with time zone not null default now(),
    "path" text not null,
    "image" text not null,
    "manga_name" text not null,
    "manga_id" bigint not null,
    "user_id" uuid not null default auth.uid()
);


alter table "public"."follow" enable row level security;

create table "public"."history" (
    "id" bigint generated by default as identity not null,
    "created_at" timestamp with time zone not null default now(),
    "name" text not null,
    "poster" text not null,
    "path" text not null,
    "manga_id" bigint not null,
    "ch_id" bigint not null,
    "ch_name" text not null,
    "ch_path" text not null,
    "user_id" uuid not null default auth.uid()
);


alter table "public"."history" enable row level security;

CREATE UNIQUE INDEX follow_pkey ON public.follow USING btree (id);

CREATE UNIQUE INDEX history_pkey ON public.history USING btree (id);

alter table "public"."follow" add constraint "follow_pkey" PRIMARY KEY using index "follow_pkey";

alter table "public"."history" add constraint "history_pkey" PRIMARY KEY using index "history_pkey";

alter table "public"."follow" add constraint "follow_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."follow" validate constraint "follow_user_id_fkey";

alter table "public"."history" add constraint "history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."history" validate constraint "history_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_history_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    history_row RECORD;
BEGIN
    SELECT * INTO history_row FROM history WHERE user_id = NEW.user_id ORDER BY created_at DESC LIMIT 1;
    IF history_row IS NOT NULL AND date(history_row.created_at) = date(NEW.created_at) AND history_row.manga_id = NEW.manga_id THEN
        UPDATE history SET created_at = NEW.created_at, name = NEW.name, poster = NEW.poster, path = NEW.path, ch_id = NEW.ch_id, ch_name = NEW.ch_name, ch_path = NEW.ch_path WHERE id = history_row.id;
        RETURN NULL;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;

create policy "Enable ALL access for only user_id"
on "public"."follow"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "Enable ALL access for only `user_id`"
on "public"."history"
as permissive
for all
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


CREATE TRIGGER check_history_insert BEFORE INSERT ON public.history FOR EACH STATEMENT EXECUTE FUNCTION check_history_insert();
ALTER TABLE "public"."history" ENABLE ALWAYS TRIGGER "check_history_insert";


