import { config } from 'dotenv'
import * as Lark from '@larksuiteoapi/node-sdk'

config()

const baseConfig = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
}

const client = new Lark.Client({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info,
})

const wsClient = new Lark.WSClient({
  ...baseConfig,
  loggerLevel: Lark.LoggerLevel.info,
})

async function getRecordDetail(fileToken: string, tableId: string, recordId: string) {
  try {
    const res = await client.bitable.v1.appTableRecord.get({
      path: {
        app_token: fileToken,
        table_id: tableId,
        record_id: recordId,
      },
    })
    return res.data?.record
  } catch (error) {
    console.error('[查询记录详情失败]', error)
    return null
  }
}

async function getTableInfo(fileToken: string, tableId: string) {
  try {
    const res = await client.bitable.v1.appTable.get({
      path: {
        app_token: fileToken,
        table_id: tableId,
      },
    })
    return res.data?.table
  } catch (error) {
    console.error('[获取表信息失败]', error)
    return null
  }
}

export const startEventListener = async () => {
  try {
    console.log('[飞书] 正在启动长连接...')

    wsClient.start({
      eventDispatcher: new Lark.EventDispatcher({}).register({
        'drive.file.bitable_record_changed_v1': async (data: any) => {
          console.log('\n========== 多维表格记录变更 ==========')
          console.log('操作类型:', data.action_list?.[0]?.action)
          console.log('记录ID:', data.action_list?.[0]?.record_id)
          console.log('表ID:', data.table_id)
          console.log('文件Token:', data.file_token)
          console.log('操作人:', data.operator_id?.open_id)

          const recordId = data.action_list?.[0]?.record_id
          if (recordId) {
            const record = await getRecordDetail(data.file_token, data.table_id, recordId)
            if (record) {
              console.log('\n记录详情:')
              console.log(JSON.stringify(record, null, 2))
            }
          }
        },
        'drive.file.bitable_record_changed_v2': async (data: any) => {
          console.log('\n========== 多维表格记录变更 v2 ==========')
          console.log('操作类型:', data.action_list?.[0]?.action)
          console.log('记录ID:', data.action_list?.[0]?.record_id)
          console.log('表ID:', data.table_id)
          console.log('文件Token:', data.file_token)

          const recordId = data.action_list?.[0]?.record_id
          if (recordId) {
            const record = await getRecordDetail(data.file_token, data.table_id, recordId)
            if (record) {
              console.log('\n记录详情:')
              console.log(JSON.stringify(record, null, 2))
            }
          }
        },
      }),
    })

    console.log('[飞书] 长连接事件监听已启动')
  } catch (error) {
    console.error('[飞书] 启动事件监听失败:', error)
    throw error
  }
}

export default client
