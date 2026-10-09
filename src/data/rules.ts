import type { Config, OptionKey } from './catalog'
import { GROUP_LABELS, optionName, cleanEngraving } from './catalog'

/**
 * Compatibility rules. Each rule states a constraint and how to repair a
 * configuration that breaks it. Repairs never touch the option the customer
 * just changed, so their choice always wins and something else adapts.
 */
export interface Rule {
  id: string
  /** true when the configuration breaks the rule */
  broken: (c: Config) => boolean
  /** ordered repairs: the first one that does not touch `changed` is used */
  repairs: { key: OptionKey; value: string }[]
  reason: string
}

export const RULES: Rule[] = [
  {
    id: 'gold-nib-gold-trim',
    broken: (c) => c.nibMaterial === 'gold18' && (c.trim === 'palladium' || c.trim === 'noir'),
    repairs: [
      { key: 'trim', value: 'gold' },
      { key: 'nibMaterial', value: 'twotone' },
    ],
    reason: 'The 18K gold nib is only fitted to pens with gold-tone trim.',
  },
  {
    id: 'carbon-cool-trim',
    broken: (c) => c.body === 'carbon' && (c.trim === 'gold' || c.trim === 'rose'),
    repairs: [
      { key: 'trim', value: 'palladium' },
      { key: 'body', value: 'ebonite' },
    ],
    reason: 'Carbon fibre is finished with palladium or black trim only.',
  },
  {
    id: 'crystal-no-pvd',
    broken: (c) => c.body === 'crystal' && c.trim === 'noir',
    repairs: [
      { key: 'trim', value: 'palladium' },
      { key: 'body', value: 'ebonite' },
    ],
    reason: 'Black PVD trim is not offered on the crystal demonstrator.',
  },
]

export interface Adjustment {
  rule: string
  key: OptionKey
  from: string
  to: string
  message: string
}

/**
 * Apply a change and resolve every rule it breaks.
 * Returns the repaired config and the list of automatic adjustments.
 */
export function applyChange(prev: Config, patch: Partial<Config>): { config: Config; adjustments: Adjustment[] } {
  let config: Config = { ...prev, ...patch }
  if (patch.engraving) config.engraving = cleanEngraving(config.engraving)
  const changed = new Set(Object.keys(patch) as (keyof Config)[])
  const adjustments: Adjustment[] = []

  for (let pass = 0; pass < 4; pass++) {
    const broken = RULES.filter((r) => r.broken(config))
    if (!broken.length) break
    for (const rule of broken) {
      if (!rule.broken(config)) continue
      const repair = rule.repairs.find((r) => !changed.has(r.key))
      if (!repair) continue
      const from = config[repair.key] as string
      config = { ...config, [repair.key]: repair.value }
      changed.add(repair.key) // never undo a repair in a later pass
      adjustments.push({
        rule: rule.id,
        key: repair.key,
        from,
        to: repair.value,
        message: `${GROUP_LABELS[repair.key]} changed to ${optionName(repair.key, repair.value as never)}. ${rule.reason}`,
      })
    }
  }
  return { config, adjustments }
}

/** What would change automatically if the customer picked this option. */
export function previewAdjustments(cfg: Config, key: OptionKey, value: string): Adjustment[] {
  if (cfg[key] === value) return []
  return applyChange(cfg, { [key]: value } as Partial<Config>).adjustments
}
