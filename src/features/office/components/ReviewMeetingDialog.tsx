import { useEffect, useState } from 'react'
import type { AppData, Profile } from '../../../types'
import type { MutateFn } from '../../../app/types'
import type { AppDataUpdater } from '../../../data/repositories/appDataUpdater'
import { OfficeMeetingDialog } from './OfficeMeetingDialog'
import { sceneOccupants } from '../officeLayoutModel'
import { useOfficeController } from '../useOfficeController'
/** 홈과 같은 회의 부품·저장소를 업무 화면에서도 사용한다. */
export function ReviewMeetingDialog({ profile, data, mutate, setData, title, requesterId, onClose }: {
  profile: Profile; data: AppData; mutate: MutateFn; setData: AppDataUpdater
  title: string; requesterId: string; onClose(): void
}) {
  const controller = useOfficeController(profile, data, setData)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <OfficeMeetingDialog profile={profile} meeting={data.officeMeeting} occupants={sceneOccupants(data.officeLayout)} presence={data.memberPresence} now={now}
    initialTitle={title.slice(0, 60)} initialInvitees={[requesterId]} onClose={onClose}
    onStart={input => mutate(() => controller.startMeeting(input), '회의를 열었어요.')}
    onAcknowledge={id => mutate(() => controller.acknowledgeMeeting(id), '회의를 확인했어요.')}
    onEnd={id => mutate(async () => { await controller.endMeeting(id) }, '회의를 마쳤어요.')} />
}
