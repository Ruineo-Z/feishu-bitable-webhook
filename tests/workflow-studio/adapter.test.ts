import assert from 'node:assert/strict'
import {
  createDefaultFormModel,
  decodeConfigToFormModel,
  encodeFormModel,
  parseConfigJson,
  resolveScopeFromConfig,
  serializeConfig,
} from '../../web/workflow-studio/src/lib/adapter'

function testEncodeVisualModel() {
  const model = createDefaultFormModel()
  model.name = 'A负责人变更同步到B'
  model.appToken = 'app_token_demo'
  model.tableId = 'tbl_demo'
  model.eventTypesText = 'record_updated, update'
  model.configId = 'wf_sync_owner_a_to_b_001'

  const encoded = encodeFormModel(model)

  assert.equal(encoded.scope.type, 'table')
  assert.equal(encoded.scope.appToken, 'app_token_demo')
  assert.equal(encoded.scope.tableId, 'tbl_demo')
  assert.deepEqual(encoded.scope.eventTypes, ['record_updated'])

  assert.equal(encoded.config.id, 'wf_sync_owner_a_to_b_001')
  assert.equal(encoded.config.name, 'A负责人变更同步到B')
  assert.equal(encoded.config.trigger.type, 'lark.bitable.record.changed')
  assert.equal(encoded.config.steps.length, model.steps.length)
}

function testEncodeRejectsUnsupportedStepType() {
  const model = createDefaultFormModel()
  model.name = 'Invalid step type'
  model.appToken = 'app_invalid'
  model.tableId = 'tbl_invalid'
  model.steps[0].type = 'action.bitable.update'

  let caught: unknown = null
  try {
    encodeFormModel(model)
  } catch (error) {
    caught = error
  }

  assert.ok(caught)
  assert.equal((caught as { code?: string }).code, 'MODEL_INVALID')
  assert.match((caught as { message?: string }).message || '', /类型不受支持/)
}

function testDecodeUnsupportedDsl() {
  const unsupportedDsl = {
    id: 'wf_xxx',
    name: '不支持示例',
    trigger: {
      type: 'lark.bitable.record.changed',
      config: {},
    },
    steps: [
      {
        id: 's1',
        type: 'action.custom',
        config: {},
      },
    ],
  }

  const decoded = decodeConfigToFormModel(unsupportedDsl as any, true)
  assert.equal(decoded.supported, false)
  assert.ok(decoded.warning)
  assert.equal(decoded.warning?.code, 'DSL_UNSUPPORTED')
}

function testRoundTripParseSerialize() {
  const model = createDefaultFormModel()
  model.name = 'RoundTrip'
  model.appToken = 'app_token_rt'
  model.tableId = 'tbl_rt'
  model.configId = 'wf_round_trip'

  const encoded = encodeFormModel(model)
  const serialized = serializeConfig(encoded.config)
  const parsed = parseConfigJson(serialized)

  assert.equal(parsed.id, 'wf_round_trip')
  assert.equal(parsed.name, 'RoundTrip')

  const resolvedScope = resolveScopeFromConfig(parsed, {
    appToken: model.appToken,
    tableId: model.tableId,
    eventTypesText: model.eventTypesText,
  })

  assert.equal(resolvedScope.appToken, 'app_token_rt')
  assert.equal(resolvedScope.tableId, 'tbl_rt')
}

function run() {
  testEncodeVisualModel()
  testEncodeRejectsUnsupportedStepType()
  testDecodeUnsupportedDsl()
  testRoundTripParseSerialize()
  console.log('adapter tests passed')
}

run()
