import { client } from '../../src/client.ts'
import { fieldMappingsDb } from '../../src/db/field-mappings.ts'
import { BitableCreatePlugin } from '../../src/workflow/plugins/bitable-create.ts'
import { BitableDeletePlugin } from '../../src/workflow/plugins/bitable-delete.ts'
import { BitableQueryPlugin } from '../../src/workflow/plugins/bitable-query.ts'

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
  const originalGetFieldTypeMaps = fieldMappingsDb.getFieldTypeMaps

  try {
    await test('create 插件：字段映射成功并调用飞书创建接口', async () => {
      let capturedPayload: any = null

      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        负责人: 'fldOwner',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldOwner: '11' },
        fieldTypeByName: { 负责人: '11' },
        source: 'runtime-cache',
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

    await test('create 插件：文本字段自动转换为字符串', async () => {
      let capturedPayload: any = null

      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldNick: '账号当前昵称',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        账号当前昵称: 'fldNick',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldNick: '1' },
        fieldTypeByName: { 账号当前昵称: '1' },
        source: 'runtime-cache',
      })

      appTableRecord.create = async (payload: any) => {
        capturedPayload = payload
        return {
          code: 0,
          data: {
            record: {
              record_id: 'rec_created_text',
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
            账号当前昵称: [{ type: 'text', text: '当前机构' }],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(capturedPayload.data.fields['账号当前昵称']).toBe('当前机构')
    })

    await test('create 插件：人员字段非法值返回 codec 诊断错误', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '第一负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        第一负责人: 'fldOwner',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldOwner: '11' },
        fieldTypeByName: { 第一负责人: '11' },
        source: 'runtime-cache',
      })

      const plugin = new BitableCreatePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          fields: {
            第一负责人: { text: '张三' },
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.output?.code).toBe('FIELD_CODEC_ENCODE_FAILED')
      expect(result.output?.details?.field).toBe('第一负责人')
      expect(result.output?.details?.expected_shape).toContain('id')
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
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: {},
        fieldTypeByName: {},
        source: 'runtime-cache',
      })

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
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldStatus: '1' },
        fieldTypeByName: { 状态: '1' },
        source: 'runtime-cache',
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

    await test('query 插件：过滤值按文本字段自动转换', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldNick: '账号当前昵称',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        账号当前昵称: 'fldNick',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldNick: '1' },
        fieldTypeByName: { 账号当前昵称: '1' },
        source: 'runtime-cache',
      })

      appTableRecord.search = async (payload: any) => {
        expect(payload.data.filter.conditions[0].value[0]).toBe('当前机构')
        return {
          code: 0,
          data: {
            items: [],
            total: 0,
            has_more: false,
            page_token: '',
          },
        }
      }

      const plugin = new BitableQueryPlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '账号当前昵称',
                operator: 'is',
                value: [{ type: 'text', text: '当前机构' }],
              },
            ],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(result.output?.code).toBe('OK')
    })

    await test('query 插件：非空操作符遇到空过滤值时跳过查询并返回空结果', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '第一负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        第一负责人: 'fldOwner',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldOwner: '11' },
        fieldTypeByName: { 第一负责人: '11' },
        source: 'runtime-cache',
      })

      appTableRecord.search = async () => {
        throw new Error('search should not be called when filter value is missing')
      }

      const plugin = new BitableQueryPlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '第一负责人',
                operator: 'is',
                value: '',
              },
            ],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(result.output?.code).toBe('OK')
      expect(result.output?.data?.reason).toBe('filter_value_missing')
      expect(result.output?.data?.records).toEqual([])
    })

    await test('query 插件：不支持的过滤操作符返回 codec 错误', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldNick: '账号当前昵称',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        账号当前昵称: 'fldNick',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldNick: '1' },
        fieldTypeByName: { 账号当前昵称: '1' },
        source: 'runtime-cache',
      })

      const plugin = new BitableQueryPlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '账号当前昵称',
                operator: 'like',
                value: '关键词',
              },
            ],
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.output?.code).toBe('FIELD_CODEC_ENCODE_FAILED')
    })

    await test('delete 插件：isEmpty 条件自动补 []', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldAttach: '附件',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        附件: 'fldAttach',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldAttach: '17' },
        fieldTypeByName: { 附件: '17' },
        source: 'runtime-cache',
      })

      appTableRecord.search = async (payload: any) => {
        expect(payload.data.filter.conditions[0].value).toEqual([])
        return {
          code: 0,
          data: {
            items: [{ record_id: 'rec_attach_1' }],
          },
        }
      }

      appTableRecord.delete = async () => ({ code: 0, data: { deleted: true } })

      const plugin = new BitableDeletePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '附件',
                operator: 'isEmpty',
              },
            ],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(result.output?.code).toBe('OK')
    })

    await test('create 插件：群组字段编码为 [{id}]', async () => {
      let capturedPayload: any = null

      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldGroup: '销售群组',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        销售群组: 'fldGroup',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldGroup: '23' },
        fieldTypeByName: { 销售群组: '23' },
        source: 'runtime-cache',
      })

      appTableRecord.create = async (payload: any) => {
        capturedPayload = payload
        return {
          code: 0,
          data: {
            record: {
              record_id: 'rec_group_1',
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
            销售群组: { id: 'oc_group_1' },
          },
        },
      )

      expect(result.success).toBe(true)
      expect(capturedPayload.data.fields['销售群组']).toEqual([{ id: 'oc_group_1' }])
    })

    await test('delete 插件：非空操作符遇到空过滤值时跳过删除并返回成功', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '第一负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        第一负责人: 'fldOwner',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldOwner: '11' },
        fieldTypeByName: { 第一负责人: '11' },
        source: 'runtime-cache',
      })

      appTableRecord.search = async () => {
        throw new Error('search should not be called when filter value is missing')
      }

      appTableRecord.delete = async () => {
        throw new Error('delete should not be called when filter value is missing')
      }

      const plugin = new BitableDeletePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '第一负责人',
                operator: 'is',
                value: '',
              },
            ],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(result.output?.code).toBe('OK')
      expect(result.output?.data?.deleted).toBe(false)
      expect(result.output?.data?.reason).toBe('filter_value_missing')
    })

    await test('delete 插件：保留飞书 SDK 错误上下文', async () => {
      ;(fieldMappingsDb as any).getIdToNameMap = async () => ({
        fldOwner: '第一负责人',
      })
      ;(fieldMappingsDb as any).getNameToIdMap = async () => ({
        第一负责人: 'fldOwner',
      })
      ;(fieldMappingsDb as any).getFieldTypeMaps = async () => ({
        fieldTypeById: { fldOwner: '11' },
        fieldTypeByName: { 第一负责人: '11' },
        source: 'runtime-cache',
      })

      appTableRecord.search = async () => {
        throw [
          new Error('Request failed with status code 400'),
          {
            code: 9499,
            msg: 'Invalid parameter type in json',
            log_id: 'test-log-id',
          },
        ]
      }

      const plugin = new BitableDeletePlugin()
      const result = await plugin.execute(
        { trigger: {}, steps: {} },
        {
          app_token: 'app1',
          table_id: 'tbl1',
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '第一负责人',
                operator: 'is',
                value: 'ou_xxx',
              },
            ],
          },
        },
      )

      expect(result.success).toBe(false)
      expect(result.output?.code).toBe('FEISHU_API_ERROR')
      expect(result.output?.details?.code).toBe(9499)
      expect(result.output?.details?.log_id).toBe('test-log-id')
    })
  } finally {
    appTableRecord.create = originalCreate
    appTableRecord.search = originalSearch
    appTableRecord.delete = originalDelete

    ;(fieldMappingsDb as any).getIdToNameMap = originalGetIdToNameMap
    ;(fieldMappingsDb as any).getNameToIdMap = originalGetNameToIdMap
    ;(fieldMappingsDb as any).getFieldTypeMaps = originalGetFieldTypeMaps
  }

  console.log('\nAll workflow bitable plugin tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
