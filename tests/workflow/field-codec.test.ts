import {
  decodeFieldValue,
  encodeFieldValueForFilter,
  encodeFieldValueForWrite,
  FieldCodecError,
} from '../../src/workflow/codec/index.ts'

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
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value but got ${JSON.stringify(actual)}`)
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
  console.log('Workflow Field Codec Tests\n')

  await test('decode: 文本字段富文本数组 -> 字符串', () => {
    const decoded = decodeFieldValue(
      [{ type: 'text', text: '当前机构' }, { type: 'text', text: 'A' }],
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '账号当前昵称',
        rawFieldType: '1',
      },
    )

    expect(decoded.value).toBe('当前机构A')
  })

  await test('write: 人员字段编码为 [{id}]', () => {
    const encoded = encodeFieldValueForWrite(
      { open_id: 'ou_xxx' },
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '第一负责人',
        rawFieldType: '11',
      },
    )

    expect(Array.isArray(encoded.value)).toBe(true)
    expect((encoded.value as Array<{ id: string }>)[0].id).toBe('ou_xxx')
  })

  await test('write: 人员字段非法值抛出 FieldCodecError', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForWrite(
        { text: '张三' },
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '第一负责人',
          rawFieldType: '11',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
    expect((caught as FieldCodecError).details.field).toBe('第一负责人')
  })

  await test('filter: 文本字段过滤值自动转字符串数组', () => {
    const encoded = encodeFieldValueForFilter(
      [{ type: 'text', text: '当前机构' }],
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '账号当前昵称',
        rawFieldType: 'text',
        operator: 'is',
      },
    )

    expect(Array.isArray(encoded.value)).toBe(true)
    expect((encoded.value as string[])[0]).toBe('当前机构')
  })

  await test('write: 数字字段支持字符串转 number', () => {
    const encoded = encodeFieldValueForWrite(
      '123.45',
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '评分',
        rawFieldType: '2',
      },
    )

    expect(encoded.value).toBe(123.45)
  })

  await test('write: 超链接字段编码为 {text,link}', () => {
    const encoded = encodeFieldValueForWrite(
      {
        text: '飞书',
        link: 'https://www.feishu.cn',
      },
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '主页链接',
        rawFieldType: '15',
      },
    )

    expect(encoded.value).toEqual({
      text: '飞书',
      link: 'https://www.feishu.cn',
    })
  })

  await test('write: 附件字段支持 token 数组', () => {
    const encoded = encodeFieldValueForWrite(
      ['file_token_1', 'file_token_2'],
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '附件',
        rawFieldType: '17',
      },
    )

    expect(encoded.value).toEqual([
      { file_token: 'file_token_1' },
      { file_token: 'file_token_2' },
    ])
  })

  await test('filter: 人员字段编码为 id 字符串数组', () => {
    const encoded = encodeFieldValueForFilter(
      [{ id: 'ou_xxx' }],
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '第一负责人',
        rawFieldType: '11',
        operator: 'is',
      },
    )

    expect(encoded.value).toEqual(['ou_xxx'])
  })

  await test('filter: 日期字段编码为 ExactDate 结构', () => {
    const encoded = encodeFieldValueForFilter(
      1702449755000,
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '更新时间',
        rawFieldType: '5',
        operator: 'is',
      },
    )

    expect(encoded.value).toEqual(['ExactDate', '1702449755000'])
  })

  await test('filter: isEmpty 自动编码为空数组', () => {
    const encoded = encodeFieldValueForFilter(
      undefined,
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '附件',
        rawFieldType: '17',
        operator: 'isEmpty',
      },
    )

    expect(encoded.value).toEqual([])
  })

  await test('filter: 复选框字段不支持 contains 操作符', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        'true',
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '是否有效',
          rawFieldType: '7',
          operator: 'contains',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('filter: 日期字段不支持 isNot 操作符', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        1702449755000,
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '更新时间',
          rawFieldType: '5',
          operator: 'isNot',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('filter: 附件字段仅支持 isEmpty/isNotEmpty', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        ['file_token_1'],
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '附件',
          rawFieldType: '17',
          operator: 'is',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('filter: 暂不支持 like/in 操作符', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        '关键词',
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '标题',
          rawFieldType: '1',
          operator: 'like',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('filter: 公式字段不支持筛选', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        '100',
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '公式字段',
          rawFieldType: '20',
          operator: 'is',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('filter: unknown 类型可从对象中推断 id 值', () => {
    const encoded = encodeFieldValueForFilter(
      [{ id: 'ou_test_1' }],
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '未知字段',
        rawFieldType: 'unknown_type',
        operator: 'is',
      },
    )

    expect(encoded.value).toEqual(['ou_test_1'])
    expect(encoded.warnings.length > 0).toBeTruthy()
  })

  await test('filter: 未解析模板变量会直接抛错', () => {
    let caught: unknown = null
    try {
      encodeFieldValueForFilter(
        '${trigger.record.beforeFields.账号第一负责人.0.id}',
        {
          appToken: 'app1',
          tableId: 'tbl1',
          fieldName: '第一负责人',
          rawFieldType: '11',
          operator: 'is',
        },
      )
    } catch (error) {
      caught = error
    }

    expect(caught instanceof FieldCodecError).toBe(true)
  })

  await test('unknown: 未知类型走 fallback 并产生 warning', () => {
    const encoded = encodeFieldValueForWrite(
      'hello',
      {
        appToken: 'app1',
        tableId: 'tbl1',
        fieldName: '自定义字段',
        rawFieldType: 'mystery_type',
      },
    )

    expect(encoded.value).toBe('hello')
    expect(encoded.warnings.length > 0).toBeTruthy()
  })

  console.log('\nAll workflow field codec tests passed!')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
