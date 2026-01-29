import { config } from 'dotenv'
config()

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function setupAutomation() {
  console.log('开始配置自动化规则...\n')

  // 1. 插入源多维表格配置
  console.log('1. 插入源多维表格配置...')
  const { data: sourceBitable, error: sourceError } = await supabase
    .from('bitables')
    .insert({
      app_token: 'SWHybsN9EaBwrAsH92YcLoSanJg',
      name: '源多维表格-设备管理',
      table_ids: ['tblTQIP2byOuW70I']
    })
    .select()
    .single()

  if (sourceError) {
    console.log('源表格可能已存在，尝试查询...')
    const { data: existingSource } = await supabase
      .from('bitables')
      .select('*')
      .eq('app_token', 'SWHybsN9EaBwrAsH92YcLoSanJg')
      .single()
    if (existingSource) {
      console.log('已找到源表格:', existingSource.id)
    }
  } else {
    console.log('源表格创建成功:', sourceBitable.id)
  }

  // 2. 插入目标多维表格配置
  console.log('\n2. 插入目标多维表格配置...')
  const { data: targetBitable, error: targetError } = await supabase
    .from('bitables')
    .insert({
      app_token: 'K2z2bZknLal2u3sH8tOcUs7snih',
      name: '目标多维表格-变更记录',
      table_ids: ['tbl4IkCXeMmJTl6J']
    })
    .select()
    .single()

  if (targetError) {
    console.log('目标表格可能已存在，尝试查询...')
    const { data: existingTarget } = await supabase
      .from('bitables')
      .select('*')
      .eq('app_token', 'K2z2bZknLal2u3sH8tOcUs7snih')
      .single()
    if (existingTarget) {
      console.log('已找到目标表格:', existingTarget.id)
    }
  } else {
    console.log('目标表格创建成功:', targetBitable.id)
  }

  // 3. 查询两个表格的ID
  console.log('\n3. 查询表格ID...')
  const { data: bitables } = await supabase
    .from('bitables')
    .select('*')
    .in('app_token', ['SWHybsN9EaBwrAsH92YcLoSanJg', 'K2z2bZknLal2u3sH8tOcUs7snih'])

  const sourceId = bitables?.find(b => b.app_token === 'SWHybsN9EaBwrAsH92YcLoSanJg')?.id
  const targetId = bitables?.find(b => b.app_token === 'K2z2bZknLal2u3sH8tOcUs7snih')?.id

  console.log('源表格ID:', sourceId)
  console.log('目标表格ID:', targetId)

  if (!sourceId || !targetId) {
    console.log('\n错误: 无法找到必要的bitable配置')
    return
  }

  // 4. 插入自动化规则
  console.log('\n4. 插入自动化规则...')

  // 先检查是否已存在相同规则
  const { data: existingRules } = await supabase
    .from('rules')
    .select('*')
    .eq('name', '设备变更同步')

  if (existingRules && existingRules.length > 0) {
    console.log('规则"设备变更同步"已存在，更新它...')
    await supabase
      .from('rules')
      .update({
        enabled: true,
        bitable_id: sourceId,
        trigger: {
          app_token: 'SWHybsN9EaBwrAsH92YcLoSanJg',
          table_id: 'tblTQIP2byOuW70I',
          actions: ['record_edited'],
          condition: {
            logic: 'AND',
            expressions: [
              { field: '设备码', operator: 'exists' },
              { field: '人员', operator: 'changed' }
            ]
          }
        },
        action: {
          type: 'create_record',
          params: {
            app_token: 'K2z2bZknLal2u3sH8tOcUs7snih',
            table_id: 'tbl4IkCXeMmJTl6J',
            fields: {
              '设备码': '{{fields.设备码}}',
              '人员': '{{fields.人员}}'
            }
          }
        },
        on_failure: 'continue'
      })
      .eq('id', existingRules[0].id)
    console.log('规则更新成功!')
  } else {
    const { error: ruleError } = await supabase
      .from('rules')
      .insert({
        name: '设备变更同步',
        enabled: true,
        bitable_id: sourceId,
        trigger: {
          app_token: 'SWHybsN9EaBwrAsH92YcLoSanJg',
          table_id: 'tblTQIP2byOuW70I',
          actions: ['record_edited'],
          condition: {
            logic: 'AND',
            expressions: [
              { field: '设备码', operator: 'exists' },
              { field: '人员', operator: 'changed' }
            ]
          }
        },
        action: {
          type: 'create_record',
          params: {
            app_token: 'K2z2bZknLal2u3sH8tOcUs7snih',
            table_id: 'tbl4IkCXeMmJTl6J',
            fields: {
              '设备码': '{{fields.设备码}}',
              '人员': '{{fields.人员}}'
            }
          }
        },
        on_failure: 'continue'
      })

    if (ruleError) {
      console.log('插入规则失败:', ruleError)
    } else {
      console.log('规则创建成功!')
    }
  }

  // 5. 验证结果
  console.log('\n5. 验证配置结果...')
  const { data: finalRules } = await supabase
    .from('rules')
    .select('*')
    .eq('name', '设备变更同步')

  if (finalRules && finalRules.length > 0) {
    console.log('\n✅ 自动化规则配置完成!')
    console.log('规则ID:', finalRules[0].id)
    console.log('规则名称:', finalRules[0].name)
    console.log('是否启用:', finalRules[0].enabled)
    console.log('\n触发条件:', JSON.stringify(finalRules[0].trigger, null, 2))
    console.log('\n执行动作:', JSON.stringify(finalRules[0].action, null, 2))
  }

  console.log('\n配置完成，现在可以测试触发事件了!')
}

setupAutomation().catch(console.error)
