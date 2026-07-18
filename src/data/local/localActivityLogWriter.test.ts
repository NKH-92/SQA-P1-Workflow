import { describe, expect, it } from 'vitest'
import { previewLeader } from '../../demoData'
import { createEmptyAppData } from '../appData'
import { createLocalActivityLogWriter } from './localActivityLogWriter'

describe('createLocalActivityLogWriter', () => {
  it('keeps only the newest 40 preview activity records', async () => {
    let data = createEmptyAppData()
    const writer = createLocalActivityLogWriter((update) => {
      data = typeof update === 'function' ? update(data) : update
    })

    for (let index = 0; index < 41; index += 1) {
      await writer.write({
        actor: previewLeader,
        entityType: 'review_request',
        action: 'updated',
        summary: `활동 ${index}`,
      })
    }

    expect(data.activityLogs).toHaveLength(40)
    expect(data.activityLogs[0]?.summary).toBe('활동 40')
    expect(data.activityLogs[data.activityLogs.length - 1]?.summary).toBe('활동 1')
  })
})
