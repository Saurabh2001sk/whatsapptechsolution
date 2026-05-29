import { useEffect, useState } from 'react'
import { api, apiBaseUrl } from './apiClient'

export function mediaSrc(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${apiBaseUrl}${url}`
}

export function ProtectedImage({ url, alt }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!url) return undefined

    if (url.startsWith('http')) {
      return undefined
    }

    let objectUrl = ''
    let cancelled = false

    api.get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setSrc(objectUrl)
      })
      .catch(() => setSrc(''))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  const displaySrc = url?.startsWith('http') ? url : src

  if (!displaySrc) return <span>Loading media...</span>

  return <img src={displaySrc} alt={alt || 'WhatsApp media'} />
}

export function ProtectedMediaLink({ url, children, className }) {
  async function openMedia(event) {
    event.preventDefault()

    if (!url) return

    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    const res = await api.get(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(res.data)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
  }

  return (
    <a className={className} href={mediaSrc(url)} onClick={openMedia}>
      {children}
    </a>
  )
}

