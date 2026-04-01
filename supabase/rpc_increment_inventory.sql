-- 재고 변동(동시성) 문제를 해결하기 위한 RPC 함수
-- 기존 quantity에 delta 값만큼 더해줍니다 (차감할 경우 음수 delta 사용)
create or replace function increment_inventory(row_id uuid, delta integer)
returns integer as $$
declare
  new_quantity integer;
begin
  update public.inventory
  set quantity = quantity + delta
  where id = row_id
  returning quantity into new_quantity;

  return new_quantity;
end;
$$ language plpgsql;
