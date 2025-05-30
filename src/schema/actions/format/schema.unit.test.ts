import { DynamoDBToolboxError } from '~/errors/index.js'
import { string } from '~/schema/index.js'

import * as primitiveSchemaFormatterModule from './primitive.js'
import { schemaFormatter } from './schema.js'

const primitiveSchemaFormatter = vi.spyOn(
  primitiveSchemaFormatterModule,
  'primitiveSchemaFormatter'
)

const strAttr = string()
const optStrAttr = string().optional()

describe('schemaFormatter', () => {
  beforeEach(() => {
    primitiveSchemaFormatter.mockClear()
  })

  test('throws an error if value is missing and required', () => {
    const invalidCall = () => schemaFormatter(strAttr, undefined).next()

    expect(invalidCall).toThrow(DynamoDBToolboxError)
    expect(invalidCall).toThrow(expect.objectContaining({ code: 'formatter.missingAttribute' }))
  })

  test('returns/yields undefined if value is missing and not required', () => {
    const formatter = schemaFormatter(optStrAttr, undefined)

    const { value: transformedValue } = formatter.next()
    expect(transformedValue).toBeUndefined()

    const { done, value: formattedValue } = formatter.next()
    expect(done).toBe(true)
    expect(formattedValue).toBeUndefined()
  })

  test('applies expected formatter on input otherwise (and pass options)', () => {
    const options = { valuePath: ['root'] }
    const formatter = schemaFormatter(strAttr, 'foo', options)

    const { value: transformedValue } = formatter.next()
    expect(transformedValue).toStrictEqual('foo')

    expect(primitiveSchemaFormatter).toHaveBeenCalledOnce()
    expect(primitiveSchemaFormatter).toHaveBeenCalledWith(strAttr, 'foo', options)

    const { done, value: formattedValue } = formatter.next()
    expect(done).toBe(true)
    expect(formattedValue).toStrictEqual('foo')
  })

  test('does not transform if transform is false', () => {
    const options = { transform: false }
    const formatter = schemaFormatter(strAttr, 'foo', options)

    const { done, value: formattedValue } = formatter.next()
    expect(done).toBe(true)
    expect(formattedValue).toStrictEqual('foo')

    expect(primitiveSchemaFormatter).toHaveBeenCalledOnce()
    expect(primitiveSchemaFormatter).toHaveBeenCalledWith(strAttr, 'foo', options)
  })
})
