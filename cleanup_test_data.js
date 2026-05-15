import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://wohsstrvdmctgyajiwtg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvaHNzdHJ2ZG1jdGd5YWppd3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU1Mzg2OCwiZXhwIjoyMDg4MTI5ODY4fQ.4eCL46vBa0GZA0XHLAGEs6U4mnbsI9cI5aFcsyspZoI"
);

async function cleanup() {
  console.log("🧹 긴급 복구: 시뮬레이션으로 인해 생성된 데이터 삭제 시작...");

  // 첫 번째 테스트 시작이 현지 시각 3시 58분(18:58 UTC)이었으므로,
  // 넉넉하게 현지 시각 3시 55분(18:55 UTC) 이후에 생성된 데이터를 삭제 타겟으로 잡습니다.
  const targetTime = "2026-03-30T18:55:00.000Z";

  try {
    // 1. 테스트 기간 동안 새롭게 '생성된' 재고(inventory) 내역 완전 삭제
    console.log(`\n1) ${targetTime} 이후로 '신규 생성된' 가짜 재고 목록 삭제 중...`);
    const { data: invDelete, error: invErr } = await supabase
      .from("inventory")
      .delete()
      .gte("created_at", targetTime);
      
    if (invErr) {
      console.error("재고 삭제 실패:", invErr);
    } else {
      console.log("✅ 신규 생성된 가짜 재고 데이터 삭제 완료.");
    }

    // 2. 테스트 기간 동안 생성된 가짜 생산 지시(production_orders) 및 잔여물 삭제
    console.log(`\n2) ${targetTime} 이후로 생성된 가짜 생산 지시 내역 삭제 중...`);
    const { data: poDelete, error: poErr } = await supabase
      .from("production_orders")
      .delete()
      .gte("created_at", targetTime);

    if (poErr) {
      console.error("생산 지시 삭제 실패:", poErr);
    } else {
      console.log("✅ 가짜 생산 지시 데이터 찌꺼기 삭제 완료.");
    }

    // 3. 테스트 기간 동안 '수량이 뻥튀기된(업데이트된)' 기존 재고 목록 안내
    console.log(`\n3) 테스트로 인해 수량이 뻥튀기된 기존 재고 탐색 중...`);
    const { data: updatedInv, error: upErr } = await supabase
      .from("inventory")
      .select("id, name, color, size, quantity")
      .gte("updated_at", targetTime);

    if (upErr) {
      console.error("업데이트된 재고 탐색 실패:", upErr);
    } else if (updatedInv && updatedInv.length > 0) {
      console.log(`\n⚠️ 주의: 아래 ${updatedInv.length}개의 항목은 기존부터 존재하던 고객님의 '진짜 재고'입니다.`);
      console.log(`하지만 테스트 봇이 이곳에 수백~수천 개의 수량을 더해버렸습니다.`);
      console.log(`시스템 상 이전 정확한 숫자가 기록되지 않아 자동 차감이 불가능하므로, 번거로우시겠지만 관리자 페이지나 앱에서 수동으로 원래 아시던 수량으로 수정해 주셔야 합니다.\n`);
      
      updatedInv.forEach(i => {
         console.log(`- [${i.name}] 색상: ${i.color}, 사이즈: ${i.size} => 현재 비정상 수량: ${i.quantity}개`);
      });
    } else {
        console.log("업데이트된 비정상 재고가 발견되지 않았습니다.");
    }

    console.log("\n✅ 긴급 정리 스크립트 실행이 종료되었습니다.");
    
  } catch (err) {
    console.error("스크립트 실행 중 에러 발생:", err);
  }
}

cleanup();
