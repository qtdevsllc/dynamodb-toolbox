import type { __MetadataBearer } from '@aws-sdk/client-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand as _ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { AwsStub } from 'aws-sdk-client-mock'
import { mockClient } from 'aws-sdk-client-mock'
import MockDate from 'mockdate'
import type { A } from 'ts-toolbelt'

import type { FormattedItem, SavedItem } from '~/index.js'
import { DynamoDBToolboxError, Entity, Table, item, number, string } from '~/index.js'

import { ScanCommand } from './scanCommand.js'
import type { IScanCommand } from './scanCommand.js'

const dynamoDbClient = new DynamoDBClient({ region: 'eu-west-1' })
const documentClient = DynamoDBDocumentClient.from(dynamoDbClient)
let documentClientMock: AwsStub<object, __MetadataBearer, unknown>

const TestTable = new Table({
  name: 'test-table',
  partitionKey: { type: 'string', name: 'pk' },
  sortKey: { type: 'string', name: 'sk' },
  documentClient
})

const EntityA = new Entity({
  name: 'EntityA',
  schema: item({
    pkA: string().key().savedAs('pk'),
    skA: string().key().savedAs('sk'),
    commonAttribute: string(),
    name: string()
  }),
  table: TestTable
})

const incompleteSavedItemA: Omit<SavedItem<typeof EntityA>, '_et'> = {
  _ct: '2021-09-01T00:00:00.000Z',
  _md: '2021-09-01T00:00:00.000Z',
  pk: 'a',
  sk: 'a',
  name: 'foo',
  commonAttribute: 'bar'
}
const completeSavedItemA: SavedItem<typeof EntityA> = {
  ...incompleteSavedItemA,
  _et: 'EntityA'
}
const formattedItemA: FormattedItem<typeof EntityA> = {
  created: '2021-09-01T00:00:00.000Z',
  modified: '2021-09-01T00:00:00.000Z',
  pkA: 'a',
  skA: 'a',
  name: 'foo',
  commonAttribute: 'bar'
}

const EntityB = new Entity({
  name: 'EntityB',
  schema: item({
    pkB: string().key().savedAs('pk'),
    skB: string().key().savedAs('sk'),
    commonAttribute: string(),
    age: number()
  }),
  table: TestTable
})
const incompleteSavedItemB: Omit<SavedItem<typeof EntityB>, '_et'> = {
  _ct: '2021-09-01T00:00:00.000Z',
  _md: '2021-09-01T00:00:00.000Z',
  pk: 'b',
  sk: 'b',
  age: 42,
  commonAttribute: 'bar'
}
const completeSavedItemB: SavedItem<typeof EntityB> = {
  ...incompleteSavedItemB,
  _et: 'EntityB'
}
const formattedItemB: FormattedItem<typeof EntityB> = {
  created: '2021-09-01T00:00:00.000Z',
  modified: '2021-09-01T00:00:00.000Z',
  pkB: 'b',
  skB: 'b',
  age: 42,
  commonAttribute: 'bar'
}

const invalidItem = {
  pk: 'c',
  sk: 'c'
}

describe('scanCommand', () => {
  beforeAll(() => {
    documentClientMock = mockClient(documentClient)
    MockDate.set(new Date())
  })

  afterAll(() => {
    documentClientMock.restore()
    MockDate.reset()
  })

  beforeEach(() => {
    documentClientMock.reset()
  })

  test('uses entityAttribute for formatting if is provided (even with entityAttrFilter set to false)', async () => {
    documentClientMock.on(_ScanCommand).resolves({
      Items: [completeSavedItemA, completeSavedItemB]
    })

    const cmd = TestTable.build(ScanCommand)
      .entities(EntityA, EntityB)
      .options({ entityAttrFilter: false })

    const assertExtends: A.Extends<typeof cmd, IScanCommand> = 1
    assertExtends

    const { Items } = await TestTable.build(ScanCommand)
      .entities(EntityA, EntityB)
      .options({ entityAttrFilter: false })
      .send()

    expect(Items).toStrictEqual([formattedItemA, formattedItemB])
  })

  test('appends entityAttribute if showEntityAttr is true', async () => {
    documentClientMock.on(_ScanCommand).resolves({
      Items: [completeSavedItemA, completeSavedItemB]
    })

    const { Items } = await TestTable.build(ScanCommand)
      .entities(EntityA, EntityB)
      .options({ entityAttrFilter: false, showEntityAttr: true })
      .send()

    expect(Items).toStrictEqual([
      { entity: EntityA.entityName, ...formattedItemA },
      { entity: EntityB.entityName, ...formattedItemB }
    ])
  })

  test('tries all formatters if entityAttribute misses and throws on invalid items if noEntityMatchBehavior is "THROW" (default)', async () => {
    documentClientMock.on(_ScanCommand).resolves({
      Items: [incompleteSavedItemA, incompleteSavedItemB, invalidItem]
    })

    const invalidCall = async () =>
      await TestTable.build(ScanCommand)
        .entities(EntityA, EntityB)
        .options({ entityAttrFilter: false })
        .send()

    expect(invalidCall).rejects.toThrow(DynamoDBToolboxError)
    expect(invalidCall).rejects.toThrow(
      expect.objectContaining({ code: 'scanCommand.noEntityMatched' })
    )
  })

  test('tries all formatters if entityAttribute misses and omit invalid items if noEntityMatchBehavior is "DISCARD"', async () => {
    documentClientMock.on(_ScanCommand).resolves({
      Items: [incompleteSavedItemA, incompleteSavedItemB, invalidItem]
    })

    const { Items } = await TestTable.build(ScanCommand)
      .entities(EntityA, EntityB)
      .options({ entityAttrFilter: false, noEntityMatchBehavior: 'DISCARD' })
      .send()

    expect(Items).toStrictEqual([formattedItemA, formattedItemB])
  })
})
