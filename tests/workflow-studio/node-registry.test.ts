import assert from 'node:assert/strict'
import { createDefaultFormModel } from '../../web/workflow-studio/src/lib/adapter'
import {
  ADDABLE_NODE_CATALOG_ITEMS,
  createNodeCatalogGroups,
  isStepTypeSupported,
  toStepTypeLabel,
  validateFormNodeSchema,
} from '../../web/workflow-studio/src/lib/node-registry'

function testCatalogGroups() {
  const groups = createNodeCatalogGroups(ADDABLE_NODE_CATALOG_ITEMS)
  const categories = groups.map((group) => group.category)

  assert.deepEqual(categories, ['condition', 'action'])
  assert.ok(groups.find((group) => group.category === 'condition')?.items.length)
  assert.ok(groups.find((group) => group.category === 'action')?.items.length)
}

function testStepTypeSupportAndLabels() {
  assert.equal(isStepTypeSupported('condition'), true)
  assert.equal(isStepTypeSupported('action.bitable.create'), true)
  assert.equal(isStepTypeSupported('action.bitable.update'), false)

  assert.equal(toStepTypeLabel('action.bitable.create'), '创建记录')
  assert.equal(toStepTypeLabel('action.bitable.update'), 'action.bitable.update')
}

function testNodeSchemaValidation() {
  const model = createDefaultFormModel()
  const baseErrors = validateFormNodeSchema(model)
  assert.equal(baseErrors.length, 0)

  model.steps[0].id = ''
  model.steps[1].type = 'action.bitable.update'
  model.steps[1].configText = ''

  const errors = validateFormNodeSchema(model)
  assert.ok(errors.some((item) => item.includes('id 不能为空')))
  assert.ok(errors.some((item) => item.includes('类型不受支持')))
  assert.ok(errors.some((item) => item.includes('config 不能为空')))
}

function run() {
  testCatalogGroups()
  testStepTypeSupportAndLabels()
  testNodeSchemaValidation()
  console.log('node registry tests passed')
}

run()
