/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { api, apiBaseUrl } from './apiClient'

function isSafeWhatsAppMediaUrl(url = '') {
  return /^\/media\/whatsapp\/[a-zA-Z0-9_.-]+$/.test(String(url || ''))
}

export function mediaSrc(url) {
  if (!isSafeWhatsAppMediaUrl(url)) return ''
  return `${apiBaseUrl}${url}`
}

export function ProtectedImage({ url, alt }) {
  const [media, setMedia] = useState({ url: '', src: '' })

  useEffect(() => {
    if (!url) return undefined

   if (!isSafeWhatsAppMediaUrl(url)) {
  return undefined
}

    let objectUrl = ''
    let cancelled = false

    api.get(url, { responseType: 'blob', silentError: true })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setMedia({ url, src: objectUrl })
      })
      .catch(() => {
        if (!cancelled) setMedia({ url, src: '' })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

const displaySrc = media.url === url ? media.src : ''

  if (!displaySrc) return <span>Loading media...</span>

  return <img src={displaySrc} alt={alt || 'WhatsApp media'} />
}

export function ProtectedMedia({ url, type, className, title }) {
  const [media, setMedia] = useState({ url: '', src: '' })

  useEffect(() => {
    if (!url || !isSafeWhatsAppMediaUrl(url)) return undefined

    let objectUrl = ''
    let cancelled = false

    api.get(url, { responseType: 'blob', silentError: true })
      .then((res) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(res.data)
        setMedia({ url, src: objectUrl })
      })
      .catch(() => {
        if (!cancelled) setMedia({ url, src: '' })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  const displaySrc = media.url === url ? media.src : ''

  if (!displaySrc) return <span>Loading media...</span>

  if (type === 'video') {
    return <video className={className} src={displaySrc} controls preload="metadata" title={title || 'WhatsApp video'} />
  }

  if (type === 'audio') {
    return <audio className={className} src={displaySrc} controls preload="metadata" title={title || 'WhatsApp audio'} />
  }

  return null
}

export function ProtectedMediaLink({ url, children, className }) {
  async function openMedia(event) {
    event.preventDefault()

    if (!url) return

if (!isSafeWhatsAppMediaUrl(url)) {
  return
}

    const res = await api.get(url, { responseType: 'blob', silentError: true })
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
