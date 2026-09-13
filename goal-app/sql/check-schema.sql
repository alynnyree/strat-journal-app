-- Paste this whole thing into the Supabase SQL Editor and press Run.
--
-- It only READS. It changes nothing and writes nothing.
--
-- The purpose is to show the real column names of the three tables the morning
-- brief reads, so the guessing can stop. Send the result back to Claude.

-- 1. The column names.
select
  table_name,
  ordinal_position as column_position,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('app_settings', 'trading_rules', 'protocol_items')
order by table_name, ordinal_position;

-- 2. The settings, so the chat id row can be confirmed.
--    Run this one separately if the editor only shows you one result.
-- select * from app_settings;

-- 3. The rules and the checklist, so the grouping value can be confirmed.
--    "trading_open" is what the brief looks for on protocol_items.
-- select * from trading_rules;
-- select * from protocol_items;
