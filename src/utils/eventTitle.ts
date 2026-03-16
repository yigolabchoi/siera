/**
 * 산행 제목 자동 생성 유틸리티
 * 
 * 형식: "시애라 {N}차 정기산행" 또는 "시애라 {N}차 특별산행"
 */

import { HikingEvent } from '../types';

/**
 * 산행 회차와 유형에 따라 자동 제목을 생성합니다.
 * @param eventNumber 산행 회차 번호
 * @param isSpecial 특별산행 여부
 * @returns 자동 생성된 산행 제목 (예: "시애라 230차 정기산행")
 */
export function generateEventTitle(eventNumber: number, isSpecial: boolean = false, specialType?: string): string {
  if (isSpecial) {
    if (specialType === 'overseas') {
      return `시애라 해외산행 (제${eventNumber}차)`;
    }
    return `시애라 ${eventNumber}차 특별산행`;
  }
  return `시애라 ${eventNumber}차 정기산행`;
}

/**
 * 기존 이벤트 목록에서 다음 회차 번호를 계산합니다.
 * 가장 큰 eventNumber + 1을 반환합니다.
 * @param events 기존 이벤트 목록
 * @returns 다음 회차 번호
 */
export function getNextEventNumber(events: HikingEvent[]): number {
  const maxNumber = events.reduce((max, event) => {
    const num = event.eventNumber ?? 0;
    return num > max ? num : max;
  }, 0);
  
  return maxNumber + 1;
}
