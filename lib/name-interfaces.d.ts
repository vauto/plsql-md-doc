export interface ItemName<TItemName extends ItemName<TItemName>> {

  get text(): string
  get value(): string
  get length(): number

  equals(other: TItemName): boolean
  localeCompare(other: TItemName): number
}

