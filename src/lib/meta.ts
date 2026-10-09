import { useEffect } from 'react'
import { SITE } from '@/brand'

/** Per-route <title> and description for a client-rendered SPA. */
export function useDocumentMeta({ title, description }: { title?: string; description?: string }) {
  useEffect(() => {
    document.title = title ?? SITE.title
    const d = description ?? SITE.description
    document.querySelector('meta[name="description"]')?.setAttribute('content', d)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title ?? SITE.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', d)
  }, [title, description])
}
