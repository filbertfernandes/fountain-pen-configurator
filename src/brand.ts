/**
 * Every piece of brand copy lives here so the house can be renamed in one place.
 * Wheeler & Rawson is a fictional maker created for this portfolio piece.
 */
export const BRAND = {
  name: 'Wheeler & Rawson',
  short: 'W&R',
  monogram: 'W&R',
  descriptor: 'Fine Writing Instruments',
  established: 1899,
  city: 'Providence, Rhode Island',
  workshop: 'Benefit Street Workshop',
  email: 'atelier@wheeler-rawson.example',
  product: {
    id: 'meridian',
    name: 'The Meridian',
    model: 'Meridian No. 9',
    sku: 'WR-MER9',
  },
  demoNotice:
    'Wheeler & Rawson is a fictional maker. This is a portfolio demonstration — nothing is sold and no payment is taken.',
} as const

/** The real author of this portfolio piece. */
export const AUTHOR = {
  name: 'Filbert Fernandes',
  url: 'https://filbert-fernandes-portfolio.vercel.app/',
}

export const SITE = {
  title: `${BRAND.name} — ${BRAND.product.name} fountain pen`,
  description:
    'Configure the Meridian fountain pen part by part — body, trim, clip, nib and filling system — and watch it assemble in real time. A 3D web portfolio project by Filbert Fernandes.',
}
