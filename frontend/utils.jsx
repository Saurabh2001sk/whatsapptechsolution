/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { api, apiBaseUrl } from './apiClient'

export const defaultAppSettings = {
  appName: 'WhatsApp Sales CRM',
  companyName: 'Your Company',
  industry: 'General Sales',
  primaryColor: '#0b7f69',
  currency: 'INR',
  labels: ['New Enquiry', 'Quotation Required', 'Dispatch Query', 'Payment Follow-up', 'Complaint', 'Review Required'],
  stages: ['new', 'qualified', 'quoted', 'won', 'lost'],
  quotationPrefix: 'QT-WA',
  orderPrefix: 'SO-WA',
  botEnabled: true,
  botGreeting: 'Hello, please share the product, size, and quantity you need.',
  handoffKeywords: ['urgent', 'complaint', 'stuck', 'salesperson'],
  inventoryFields: ['sku', 'name', 'grade', 'size', 'shape', 'stock_qty', 'price'],

  quoteApprovalEnabled: true,
  quoteApprovalManagerName: '',
  quoteApprovalManagerPhone: '',
  quoteApprovalTemplateName: 'quote_manager_approval_request',
  quoteApprovalTemplateLanguage: 'en',
  customerQuoteTemplateName: 'quote_customer_approval_request',
  customerQuoteTemplateLanguage: 'en',
  orderAcknowledgementTemplateName: 'order_acknowledgement',
  orderAcknowledgementTemplateLanguage: 'en',
  ftpAccessEnabled: false,
  twoFactorEnabled: false,
  wabaMmLiteEnabled: false,
  wabaHealthyRetryEnabled: false,
  wabaConversionEventsEnabled: false,
  billingBusinessName: '',
  billingGstNumber: '',
  billingPanNumber: '',
  billingCountry: 'India',
  billingState: '',
  billingCity: '',
  billingAddress: '',
  billingPinCode: '',
  billingEmail: '',
  billingContactNumber: '',
  voiceCallsEnabled: false,
  voiceCallbackEnabled: false,
  voiceDisplayCallButtons: true,
  voiceCallHoursMode: 'specific',
  voiceTimeZone: 'Asia/Kolkata (GMT+05:30)',
  voiceWeeklyHours: null,
  voiceUnavailableHours: [],
  inboxAutoAssign: false,
}

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DEFAULT_VOICE_WEEKLY_HOURS = WEEK_DAYS.reduce((acc, day) => ({
  ...acc,
  [day]: { enabled: true, slots: [{ start: '00:00', end: '23:59' }] },
}), {})
export const DEFAULT_BILLING_FIELDS = {
  billingBusinessName: '',
  billingGstNumber: '',
  billingPanNumber: '',
  billingCountry: 'India',
  billingState: '',
  billingCity: '',
  billingAddress: '',
  billingPinCode: '',
  billingEmail: '',
  billingContactNumber: '',
}

export function buildAppSettingsPayload(form) {
  return {
    ...form,
    labels: fromCsv(form.labelsText),
    stages: fromCsv(form.stagesText),
    handoffKeywords: fromCsv(form.handoffKeywordsText),
    inventoryFields: fromCsv(form.inventoryFieldsText),
  }
}

export function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : value || ''
}

export function fromCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(value)
      if (row.some((cell) => String(cell).trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  row.push(value)
  if (row.some((cell) => String(cell).trim())) rows.push(row)
  const headers = rows.shift()?.map((item) => item.trim()) || []
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])))
}

export function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function downloadCsv(filename, headers, sample) {
  const csv = [headers, sample].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C'
}

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
