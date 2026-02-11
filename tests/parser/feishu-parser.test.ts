import { parseFeishuEvent } from '../../src/parser/feishu-parser.ts'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toEqual(expected: unknown) {
      const actualJson = JSON.stringify(actual)
      const expectedJson = JSON.stringify(expected)
      if (actualJson !== expectedJson) {
        throw new Error(`Expected ${expectedJson} but got ${actualJson}`)
      }
    },
  }
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.log(`✗ ${name}`)
    console.error(error)
    process.exit(1)
  }
}

async function run() {
  console.log('Feishu Event Parser Tests\n')

  await test('人员字段: user.user_id.open_id 结构可正确提取', () => {
    const event = parseFeishuEvent({
      event_type: 'drive.file.bitable_record_changed_v1',
      event_id: 'evt1',
      file_token: 'app1',
      table_id: 'tbl1',
      action_list: [
        {
          action: 'record_edited',
          record_id: 'rec1',
          before_value: [
            {
              field_id: 'fldOwner',
              field_identity_value: {
                users: [
                  {
                    user_id: {
                      open_id: 'ou_old',
                    },
                  },
                ],
              },
              field_value: '',
            },
          ],
          after_value: [],
        },
      ],
    })

    expect(event.beforeFields['fldOwner']).toEqual([{ id: 'ou_old' }])
  })

  await test('人员字段: user.id 结构可正确提取', () => {
    const event = parseFeishuEvent({
      event_type: 'drive.file.bitable_record_changed_v1',
      event_id: 'evt2',
      file_token: 'app1',
      table_id: 'tbl1',
      action_list: [
        {
          action: 'record_edited',
          record_id: 'rec1',
          before_value: [
            {
              field_id: 'fldOwner',
              field_identity_value: {
                users: [
                  {
                    id: 'ou_from_id',
                  },
                ],
              },
              field_value: '',
            },
          ],
          after_value: [],
        },
      ],
    })

    expect(event.beforeFields['fldOwner']).toEqual([{ id: 'ou_from_id' }])
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})

