export type Org = readonly [bigint, string, bigint, bigint]

export type OrgObject = {
  parentOrg: bigint
  name: string
  baseRate: bigint
  perLevelMarkup: bigint
}

export function orgTupleToObject(raw: unknown): OrgObject | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [parentOrg, name, baseRate, perLevelMarkup] = raw as unknown as Org
  if (
    typeof parentOrg !== 'bigint' ||
    typeof name !== 'string' ||
    typeof baseRate !== 'bigint' ||
    typeof perLevelMarkup !== 'bigint'
  ) {
    return null
  }
  return {
    parentOrg,
    name,
    baseRate,
    perLevelMarkup,
  }
}
