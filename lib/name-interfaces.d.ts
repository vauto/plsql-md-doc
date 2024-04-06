import { TokenFormat } from "./token-interfaces"

export type ItemNameFormat = TokenFormat | 'FILE'

export interface ItemName<TItemName extends ItemName<TItemName>> {

  get text(): string
  get value(): string
  get length(): number

  equals(other: TItemName): boolean
  localeCompare(other: TItemName): number

  /**
   * @param format How to format as a string.
   * @returns {string}
   */
  toString(format?: ItemNameFormat = '')
}

