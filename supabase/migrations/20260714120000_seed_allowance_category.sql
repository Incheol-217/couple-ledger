-- 거래 입력의 지출 카테고리에 '용돈'이 항상 있도록, 모든 household에
-- '용돈' 지출 카테고리를 한 번만 넣어줘요. 이미 있으면 넣지 않아요(멱등).

insert into public.categories (household_id, name, type, display_order)
select
  h.id,
  '용돈',
  'expense'::public.category_type,
  coalesce(
    (
      select max(c.display_order)
      from public.categories c
      where c.household_id = h.id
        and c.type = 'expense'
    ),
    0
  ) + 1
from public.households h
where not exists (
  select 1
  from public.categories c
  where c.household_id = h.id
    and c.type = 'expense'
    and c.name = '용돈'
);
