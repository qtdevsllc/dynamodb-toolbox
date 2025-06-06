import { TransactGetCommand } from '@aws-sdk/lib-dynamodb'
import type {
  DynamoDBDocumentClient,
  TransactGetCommandInput,
  TransactGetCommandOutput
} from '@aws-sdk/lib-dynamodb'

import { EntityFormatter } from '~/entity/actions/format/index.js'
import type { EntityPaths } from '~/entity/actions/parsePaths/index.js'
import type { FormattedItem } from '~/entity/index.js'
import { DynamoDBToolboxError } from '~/errors/index.js'
import type { CapacityOption } from '~/options/capacity.js'
import { parseCapacityOption } from '~/options/capacity.js'
import { rejectExtraOptions } from '~/options/rejectExtraOptions.js'
import type { DocumentClientOptions } from '~/types/documentClientOptions.js'

import { $options } from './getTransaction/constants.js'
import { GetTransaction } from './getTransaction/getTransaction.js'

type GetTransactionProps = Pick<GetTransaction, 'entity' | $options | 'params'>

export interface ExecuteTransactGetOptions extends DocumentClientOptions {
  documentClient?: DynamoDBDocumentClient
  capacity?: CapacityOption
}

export type ExecuteTransactGetInput =
  | GetTransactionProps[]
  | [ExecuteTransactGetOptions, ...GetTransactionProps[]]

type ExecuteTransactGet = <TRANSACTIONS extends ExecuteTransactGetInput>(
  ..._transactions: TRANSACTIONS
) => Promise<ExecuteTransactGetResponses<TRANSACTIONS>>

export type ExecuteTransactGetResponses<TRANSACTIONS extends ExecuteTransactGetInput> =
  TRANSACTIONS extends GetTransactionProps[]
    ? ExecuteTransactGetResponse<TRANSACTIONS>
    : TRANSACTIONS extends [ExecuteTransactGetOptions, ...infer TRANSACTIONS_TAIL]
      ? TRANSACTIONS_TAIL extends GetTransactionProps[]
        ? ExecuteTransactGetResponse<TRANSACTIONS_TAIL>
        : never
      : never

type ExecuteTransactGetResponse<TRANSACTIONS extends GetTransactionProps[]> = Omit<
  TransactGetCommandOutput,
  'Responses'
> & { Responses?: TransactGetResponses<TRANSACTIONS> }

type TransactGetResponses<
  TRANSACTIONS extends GetTransactionProps[],
  RESPONSES extends unknown[] = []
> = TRANSACTIONS extends [infer TRANSACTIONS_HEAD, ...infer TRANSACTIONS_TAIL]
  ? TRANSACTIONS_HEAD extends GetTransactionProps
    ? TRANSACTIONS_TAIL extends GetTransactionProps[]
      ? TransactGetResponses<
          TRANSACTIONS_TAIL,
          [...RESPONSES, TransactGetResponse<TRANSACTIONS_HEAD>]
        >
      : never
    : never
  : number extends TRANSACTIONS['length']
    ? [
        ...RESPONSES,
        ...(TRANSACTIONS[number] extends infer TRANSACTION
          ? TRANSACTION extends GetTransactionProps
            ? TransactGetResponse<TRANSACTION>
            : never
          : never)[]
      ]
    : RESPONSES extends []
      ? (FormattedItem | undefined)[]
      : RESPONSES

type TransactGetResponse<TRANSACTION extends GetTransactionProps> = {
  Item?: TRANSACTION[$options]['attributes'] extends EntityPaths<TRANSACTION['entity']>[]
    ? FormattedItem<
        TRANSACTION['entity'],
        { attributes: TRANSACTION[$options]['attributes'][number] }
      >
    : FormattedItem<TRANSACTION['entity']>
}

type TransactGetResponseFormatter = <TRANSACTIONS extends GetTransactionProps[]>(
  responses: NonNullable<TransactGetCommandOutput['Responses']>,
  ...transactions: TRANSACTIONS
) => TransactGetResponses<TRANSACTIONS> | undefined

export const formatResponses: TransactGetResponseFormatter = <
  TRANSACTIONS extends GetTransactionProps[]
>(
  responses: NonNullable<TransactGetCommandOutput['Responses']>,
  ...transactions: TRANSACTIONS
) =>
  responses.map(({ Item: item }, index) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const transaction = transactions[index]!
    const transactionEntity = transaction.entity
    const { attributes } = transaction[$options]

    return {
      Item: item
        ? new EntityFormatter(transactionEntity).format(item, attributes ? { attributes } : {})
        : undefined
    }
  }) as TransactGetResponses<TRANSACTIONS>

export const execute: ExecuteTransactGet = async <
  TRANSACTIONS extends GetTransactionProps[] | [ExecuteTransactGetOptions, ...GetTransactionProps[]]
>(
  ..._transactions: TRANSACTIONS
) => {
  const [headTransactionOrOptions = {}, ...tailTransactions] = _transactions

  const transactions = tailTransactions as GetTransactionProps[]
  let options: ExecuteTransactGetOptions = {}

  if (headTransactionOrOptions instanceof GetTransaction) {
    transactions.unshift(headTransactionOrOptions)
  } else {
    options = headTransactionOrOptions as ExecuteTransactGetOptions
  }

  const firstTransaction = transactions[0]
  if (firstTransaction === undefined) {
    throw new DynamoDBToolboxError('actions.incompleteAction', {
      message: 'transactGet incomplete: No GetTransaction supplied'
    })
  }

  const { documentClient, capacity, ...documentClientOptions } = options
  const docClient = documentClient ?? firstTransaction.entity.table.getDocumentClient()

  const { Responses, ...restResponse } = await docClient.send(
    new TransactGetCommand(getCommandInput(transactions, { capacity })),
    documentClientOptions
  )

  if (Responses === undefined) {
    return restResponse as ExecuteTransactGetResponses<TRANSACTIONS>
  }

  return {
    ...restResponse,
    Responses: formatResponses(Responses, ...transactions)
  } as ExecuteTransactGetResponses<TRANSACTIONS>
}

export const getCommandInput = (
  transactions: GetTransactionProps[],
  options: ExecuteTransactGetOptions = {}
): TransactGetCommandInput => {
  const { capacity, ...extraOptions } = options
  rejectExtraOptions(extraOptions)

  return {
    TransactItems: transactions.map(command => command.params()),
    ...(capacity !== undefined ? { ReturnConsumedCapacity: parseCapacityOption(capacity) } : {})
  }
}
