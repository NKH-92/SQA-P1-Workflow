import { createRepositoryContext, type RepositoryContext } from '../../data'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { AppData, Profile } from '../../types'

/**
 * 한 번의 저장에서 여러 쓰기를 차례로 부르는 경우(여러 적용 업무 완료, 담당자 교체 후 업무 넘기기)를 위한 저장소 문맥.
 * 미리보기(로컬) 저장소는 문맥의 data 스냅숏을 읽어 다음 상태를 계산하는데, React 상태는 다음 렌더에서야 바뀐다.
 * 그래서 같은 문맥으로 두 번째 쓰기를 하면 첫 번째 결과를 모른 채 덮어쓴다. 이 문맥은 자기 쓰기를 스냅숏에 바로 반영해
 * 연속 호출이 앞선 결과 위에서 계산되게 한다. 원격 저장소는 서버가 기준이라 동작이 바뀌지 않는다.
 */
export function createSequentialRepositoryContext(
  profile: Profile,
  data: AppData,
  setData: AppDataUpdater,
): RepositoryContext {
  let latest = data
  const context = createRepositoryContext(profile, data, (update) => {
    latest = typeof update === 'function' ? update(latest) : update
    context.data = latest
    setData(update)
  })
  return context
}
