import { client } from '../../src/client.ts'
import { fieldMappingsDb } from '../../src/db/field-mappings.ts'
import { BitableCreatePlugin } from '../../src/workflow/plugins/bitable-create.ts'
import { BitableDeletePlugin } from '../../src/workflow/plugins/bitable-delete.ts'

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
      }
    },
    toContain(expected: string) {
      if (!String(actual).includes(expected)) {
        throw new Error(`Expected to contain "${expected}" but got ${JSON.stringify(actual)}`)
      }
    },
  }
}

async function test(name: string, fn: () => Promise<void>) {
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
  console.log('Workflow Bitable Plugins Tests\n')

  const appTableRecord = (client as any).bitable.v1.appTableRecord
  const originalCreate = appTableRecord.create
  const originalSearch = appTableRecord.search
  const originalDelete = appTableRecord.delete

  const originalGetIdToNameMap = fieldMappingsDb.getIdToNameMap
  const originalGetNameToIdMap = fieldMappingsDb.getNameToIdMap

  try {
    await test('create 插件：字段映射成功并调用飞书创建接口', async () => {
      let capturedPayload: any = null

      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        负责人: 'fldOwner',
      })

      appTableRecord.create = async (payload: any) => {
        capturedPayload = payload
        return {
          code: 0,
          data: {
            record: {
              record_id: 'rec_created_1',
            },
          },
        }
      }

      const plugin = new BitableCreatePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          fields: {
            fldOwner: [{ id: 'ou_xxx' }],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(capturedPayload.data.fields['负责人'][0].id).toBe('ou_xxx')
      expect(result.output?.code).toBe('OK')
    })

    await test('create 插件：缺少必要参数返回校验错误', async () => {
      const plugin = new BitableCreatePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          table_id: 'tbl1',
          fields: { 标题: '测试' },
        },
      )

      expect(result.success).toBe(false)
      expect(result.output?.code).toBe('VALIDATION_ERROR')
    })

    await test('create 插件：映射缺失时返回显式错误', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({})
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({})

      const plugin = new BitableCreatePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          fields: {
            fldUnknown: 'value',
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.output?.code).toBe('FIELD_MAPPING_MISSING')
      expect(result.error || '').toContain('Missing field mapping')
    })

    await test('delete 插件：可按过滤条件查找并删除记录', async () => {
      let searchCalled = false
      let deleteCalled = false

      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldStatus: '状态',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        状态: 'fldStatus',
      })

      appTableRecord.search = async (payload: any) => {
        searchCalled = true
        expect(payload.data.filter.conditions[0].field_name).toBe('状态')
        return {
          code: 0,
          data: {
            items: [{ record_id: 'rec_target_1' }],
          },
        }
      }

      appTableRecord.delete = async (payload: any) => {
        deleteCalled = true
        expect(payload.path.record_id).toBe('rec_target_1')
        return { code: 0, data: { deleted: true } }
      }

      const plugin = new BitableDeletePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [{ field_name: 'fldStatus', operator: 'is', value: ['待处理'] }],
          },
        },
      )

      expect(searchCalled).toBe(true)
      expect(deleteCalled).toBe(true)
      expect(result.success).toBe(true)
      expect(result.output?.code).toBe('OK')
    })
  } finally {
    appTableRecord.create = originalCreate
    appTableRecord.search = originalSearch
    appTableRecord.delete = originalDelete

    ;(fieldMappingsDb as any).getIdToNameMap = originalGetIdToNameMap
    ;(fieldMappingsDb as any).getNameToIdMap = originalGetNameToIdMap
  }

  console.log('\nAll workflow bitable plugin tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
