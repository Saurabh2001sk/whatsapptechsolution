import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'
import { CampaignsPage } from './modules/campaigns/CampaignsPage'
import { BillingPage } from './modules/billing/BillingPage'
import { SecurityPage } from './modules/security/SecurityPage'
import { AuditLogsPage } from './modules/audit-logs/AuditLogsPage'
import { TeamUsersPage } from './modules/team-users/TeamUsersPage'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}
const CONTACT_IMPORT_LIMIT = 1000
const CONTACT_IMPORT_MAX_FILE_SIZE_BYTES = 1024 * 1024

type AuthResponse = {
  tenant: {
    id: string
    name: string
    slug: string
    status: string
  }
user: {
  id: string
  name: string
  email: string
  role: string
  emailVerifiedAt: string | null
  twoFactorEnabled: boolean
  twoFactorConfirmedAt: string | null
}

impersonation?: {
  active: boolean
  impersonatorUserId?: string
  impersonatorRole?: string
  impersonatorTenantId?: string
  targetTenantId?: string
  expiresAt?: string
}

}

type ContactType = {
  id: string
  name: string
  color: string | null
}

type Contact = {
  id: string
  name: string
  phone: string
  email: string | null
  tags: string[]
  contactTypeId: string | null
  contactType: ContactType | null
  optedIn: boolean
  optInSource: string | null
  createdAt?: string
}

type ContactImportRow = {
  name: string
  phone: string
  email?: string
  tags: string[]
  contactTypeName?: string
  optedIn: boolean
  optInSource?: string
}

type TemplateButton = {
type: string
text: string
url?: string
phoneNumber?: string
otpType?: string
flowId?: string
flowAction?: string
navigateScreen?: string
}

type TemplateBuilderButton = {
id: string
type: string
text: string
url: string
phoneNumber: string
otpType: string
flowId: string
flowAction: string
navigateScreen: string
}

type CarouselButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'

type CarouselBuilderButton = {
  id: string
  type: CarouselButtonType
  text: string
  url: string
  phoneNumber: string
}

type CarouselBuilderCard = {
  id: string
  headerFormat: 'IMAGE' | 'VIDEO'
  mediaFileName: string
  mediaPreview: string
  metaHeaderHandle: string
  bodyText: string
  buttons: CarouselBuilderButton[]
  uploading: boolean
}

type MediaFile = {
  id: string
  originalName: string
  mimeType: string
  mediaType: string
  sizeBytes?: number
  createdAt?: string
}

type WhatsappTemplate = {
  id: string
  name: string
  language: string
  category: string
  status: string
  headerType: string | null
  headerText: string | null
  headerMediaFileId?: string | null
  metaHeaderHandle?: string | null
  headerMediaFile?: MediaFile | null
  bodyText: string
  footerText: string | null
  buttons: TemplateButton[] | null
  variableCount: number
  qualityScore?: string | null
  rejectedReason?: string | null
  lastSyncedAt?: string | null
  components?: Array<Record<string, unknown>> | null
  createdAt?: string
  updatedAt?: string
}

type ContactsTab = 'list' | 'add' | 'types' | 'import'
type TemplatesTab = 'list' | 'create' | 'guide'
type ContactSort = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc'
type ConsentFilter = 'all' | 'optedIn' | 'notOptedIn'

type MetaFlow = {
  id: string
  name: string
  status: string
  categories: string[]
  hasValidationErrors: boolean
}

type MetaConnection = {
  connected: boolean
  account: {
    id: string
    metaAppId: string | null
    wabaId: string
    phoneNumberId: string
    businessName: string | null
    isActive: boolean
  } | null
}

type TemplateDraftPreview = {
  name: string
  language: string
  category: string
  headerType: string
  headerText: string
  bodyText: string
  footerText: string
}

const emptyTemplateDraftPreview: TemplateDraftPreview = {
  name: '',
  language: 'en_US',
  category: 'UTILITY',
  headerType: '',
  headerText: '',
  bodyText: '',
  footerText: '',
}

const modules = [
  'Inbox',
  'Contacts',
  'Templates',
  'Campaigns',
  'Billing',
  'Security',
  'Team Users',
  'Audit Logs',
  'Bot Replies',
  'Orders',
  'Settings',
]

function normalizeWhatsAppPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')

  if (!digits) {
    return ''
  }

  if (digits.length === 10) {
    return `91${digits}`
  }

  return digits
}

function isValidWhatsAppPhone(phone: string) {
  return phone.length >= 11 && phone.length <= 15
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isValidEmail(email: string) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function cleanTagsText(value: unknown) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function cleanCsvTagsText(value: unknown) {
  return String(value || '')
    .split('|')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function parseCsvBoolean(value: unknown) {
  return ['true', 'yes', '1', 'y'].includes(
    String(value || '').trim().toLowerCase(),
  )
}

function App() {
  const [auth, setAuth] = useState<AuthResponse | null>(null)
  const [message, setMessage] = useState('Checking login...')
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
const [actionAlert, setActionAlert] = useState<{
  id: number
  title: string
  message: string
  type: 'success' | 'error'
} | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeModule, setActiveModule] = useState('Inbox')
const [authMode, setAuthMode] = useState<
  'login' | 'forgot' | 'reset' | 'twoFactor'
>('login')
const [resetToken, setResetToken] = useState('')
const [twoFactorToken, setTwoFactorToken] = useState('')
const [twoFactorCode, setTwoFactorCode] = useState('')

  const [contactsTab, setContactsTab] = useState<ContactsTab>('list')
  const [contactSearch, setContactSearch] = useState('')
  const [contactTypeFilter, setContactTypeFilter] = useState('all')
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all')
  const [contactSort, setContactSort] = useState<ContactSort>('newest')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([])
  const [, setMediaFiles] = useState<MediaFile[]>([])
  const [templatesTab, setTemplatesTab] = useState<TemplatesTab>('list')
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateStatusFilter, setTemplateStatusFilter] = useState('all')
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all')
const [templateFormKey, setTemplateFormKey] = useState(0)
const [templateDraftPreview, setTemplateDraftPreview] =
  useState<TemplateDraftPreview>(emptyTemplateDraftPreview)
const [templateHeaderSampleFile, setTemplateHeaderSampleFile] =
  useState<File | null>(null)
const [templateHeaderSamplePreview, setTemplateHeaderSamplePreview] =
useState('')
const [templateBuilderButtons, setTemplateBuilderButtons] = useState<
TemplateBuilderButton[]
>([])
const [carouselBuilderEnabled, setCarouselBuilderEnabled] = useState(false)
const [carouselBuilderCards, setCarouselBuilderCards] = useState<
  CarouselBuilderCard[]
>(() => [createCarouselBuilderCard(), createCarouselBuilderCard()])
const [submittingTemplate, setSubmittingTemplate] =
useState<WhatsappTemplate | null>(null)
const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null)
const [metaFlows, setMetaFlows] = useState<MetaFlow[]>([])

  const filteredContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase()

    return [...contacts]
      .filter((contact) => {
        const matchesSearch =
          !search ||
          contact.name.toLowerCase().includes(search) ||
          contact.phone.toLowerCase().includes(search) ||
          String(contact.email || '').toLowerCase().includes(search)

        const matchesType =
          contactTypeFilter === 'all' || contact.contactTypeId === contactTypeFilter

        const matchesConsent =
          consentFilter === 'all' ||
          (consentFilter === 'optedIn' && contact.optedIn) ||
          (consentFilter === 'notOptedIn' && !contact.optedIn)

        return matchesSearch && matchesType && matchesConsent
      })
      .sort((a, b) => {
        if (contactSort === 'nameAsc') {
          return a.name.localeCompare(b.name)
        }

        if (contactSort === 'nameDesc') {
          return b.name.localeCompare(a.name)
        }

        const aTime = new Date(a.createdAt || 0).getTime()
        const bTime = new Date(b.createdAt || 0).getTime()

        return contactSort === 'oldest' ? aTime - bTime : bTime - aTime
      })
  }, [contacts, contactSearch, contactTypeFilter, consentFilter, contactSort])

  const filteredTemplates = useMemo(() => {
  const search = templateSearch.trim().toLowerCase()

  return templates.filter((template) => {
    const matchesSearch =
      !search ||
      template.name.toLowerCase().includes(search) ||
      template.language.toLowerCase().includes(search) ||
      template.bodyText.toLowerCase().includes(search)

    const matchesStatus =
      templateStatusFilter === 'all' || template.status === templateStatusFilter

    const matchesCategory =
      templateCategoryFilter === 'all' ||
      template.category === templateCategoryFilter

    return matchesSearch && matchesStatus && matchesCategory
  })
}, [templates, templateSearch, templateStatusFilter, templateCategoryFilter])

function showToast(text: string, type: 'success' | 'error' = 'success') {
  setMessage(text)
  setToast(text)
  setToastType(type)

  setActionAlert(null)

  window.setTimeout(() => {
    setActionAlert({
      id: Date.now(),
      title: type === 'success' ? 'Action completed' : 'Action failed',
      message: text,
      type,
    })
  }, 0)

  window.setTimeout(() => {
    setToast('')
  }, 3500)
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json()

    if (typeof data.message === 'string') {
      return data.message
    }

    if (typeof data.message?.message === 'string') {
      return data.message.message
    }

    if (typeof data.message?.metaError?.error?.message === 'string') {
      return data.message.metaError.error.message
    }

    if (typeof data.metaError?.error?.message === 'string') {
      return data.metaError.error.message
    }

    if (typeof data.error === 'string') {
      return data.error
    }

    return fallback
  } catch {
    return fallback
  }
}

  async function loadMe() {
    try {
const response = await fetchWithTimeout(`${API_URL}/auth/me`, {
  credentials: 'include',
})

      if (!response.ok) {
        setAuth(null)
        setMessage('Not logged in')
        return
      }

      const data = await response.json()
      setAuth(data)
      setMessage('Logged in')
    } catch {
      setAuth(null)
      setMessage('API not connected')
    }
  }

  async function loadContactTypes() {
    const response = await fetch(`${API_URL}/contact-types`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setContactTypes([])
      return
    }

    const data = await response.json()
    setContactTypes(data)
  }

  async function loadContacts() {
    const response = await fetch(`${API_URL}/contacts`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setContacts([])
      return
    }

    const data = await response.json()
    setContacts(data)
  }

async function loadTemplates() {
  const response = await fetch(`${API_URL}/templates`, {
    credentials: 'include',
  })

  if (!response.ok) {
    setTemplates([])
    return
  }

  const data = await response.json()
  setTemplates(data)
}

async function loadMediaFiles() {
  const response = await fetch(`${API_URL}/media`, {
    credentials: 'include',
  })

  if (!response.ok) {
    setMediaFiles([])
    return
  }

  const data = await response.json()
  setMediaFiles(data)
}

useEffect(() => {
  const timer = window.setTimeout(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const tokenFromUrl = searchParams.get('resetToken')
    const verifyEmailToken = searchParams.get('verifyEmailToken')

    if (tokenFromUrl) {
      setResetToken(tokenFromUrl)
      setAuthMode('reset')
      setMessage('Enter your new password')
    }

    if (verifyEmailToken) {
      void verifyEmailFromLink(verifyEmailToken)
    }

    void loadMe()
  }, 0)

  return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

async function loadMetaConnection() {
  const response = await fetch(`${API_URL}/meta-accounts/active`, {
    credentials: 'include',
  })

  if (!response.ok) {
    setMetaConnection(null)
    return
  }

  const data = await response.json()
  setMetaConnection(data)
}

useEffect(() => {
  const timer = window.setTimeout(() => {
    if (auth && activeModule === 'Contacts') {
      void loadContacts()
      void loadContactTypes()
    }

    if (auth && activeModule === 'Templates') {
      void loadTemplates()
      void loadMediaFiles()
      void loadMetaConnection()
      void loadMetaFlows()
    }

    if (auth && activeModule === 'Settings') {
      void loadMetaConnection()
    }
  }, 0)

  return () => window.clearTimeout(timer)
}, [auth, activeModule])

async function loadMetaFlows() {
  const response = await fetch(`${API_URL}/templates/flows`, {
    credentials: 'include',
  })

  if (!response.ok) {
    setMetaFlows([])
    return
  }

  const data = await response.json()
  setMetaFlows(Array.isArray(data.flows) ? data.flows : [])
}

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('Creating account...')

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          businessName: form.get('businessName'),
          slug: form.get('slug'),
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAuth(null)
        throw new Error(data.message || 'Registration failed')
      }

setAuth(null)
setAuthMode('login')
setMessage('Account created. Please verify your email before login.')
showToast('Account created. Please verify your email before login.')
    } catch (error) {
      setAuth(null)
      showToast(error instanceof Error ? error.message : 'Registration failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('Logging in...')

    const form = new FormData(event.currentTarget)

    try {
    const response = await fetchWithTimeout(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Login failed')
      }

if (data.requiresTwoFactor) {
  setTwoFactorToken(data.twoFactorToken)
  setTwoFactorCode('')
  setAuthMode('twoFactor')
  setMessage('Enter your authenticator app code or backup code')
  showToast('Enter your 2FA code or backup code')
  return
}

      setAuth(data)
      showToast('Logged in successfully')
    } catch (error) {
      setAuth(null)
      showToast(
  error instanceof Error && error.name === 'AbortError'
    ? 'API is not responding. Please make sure backend is running on port 3000.'
    : error instanceof Error
      ? error.message
      : 'Login failed',
  'error',
)
    } finally {
      setLoading(false)
    }
  }

  async function handleTwoFactorLogin(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  setLoading(true)
  setMessage('Verifying 2FA code...')

  const form = new FormData(event.currentTarget)

  try {
    const response = await fetch(`${API_URL}/auth/login/2fa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
body: JSON.stringify({
  twoFactorToken,
  code: twoFactorCode.trim(),
  trustDevice: form.get('trustDevice') === 'on',
}),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || '2FA login failed')
    }

    setTwoFactorToken('')
    setAuthMode('login')
    setAuth(data)
    showToast('Logged in successfully')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : '2FA login failed',
      'error',
    )
  } finally {
    setLoading(false)
  }
}

async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()
 setLoading(true)
 setMessage('Sending reset email...')

 const form = new FormData(event.currentTarget)

 try {
   const response = await fetch(`${API_URL}/auth/request-password-reset`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
     },
     credentials: 'include',
     body: JSON.stringify({
       email: form.get('email'),
     }),
   })

   const data = await response.json()

   if (!response.ok) {
     throw new Error(data.message || 'Failed to send reset email')
   }

   showToast('If this email exists, reset link has been sent')
   setAuthMode('login')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Failed to send reset email',
     'error',
   )
 } finally {
   setLoading(false)
 }
}

async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()
 setLoading(true)
 setMessage('Resetting password...')

 const form = new FormData(event.currentTarget)

 try {
   const response = await fetch(`${API_URL}/auth/reset-password`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
     },
     credentials: 'include',
     body: JSON.stringify({
       token: resetToken,
       password: form.get('password'),
     }),
   })

   const data = await response.json()

   if (!response.ok) {
     throw new Error(data.message || 'Password reset failed')
   }

   window.history.replaceState({}, document.title, window.location.pathname)
   setResetToken('')
   setAuthMode('login')
   showToast('Password reset successfully. Please login now.')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Password reset failed',
     'error',
   )
 } finally {
   setLoading(false)
 }
}

async function verifyEmailFromLink(token: string) {
try {
 const response = await fetch(`${API_URL}/auth/verify-email`, {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
   },
   credentials: 'include',
   body: JSON.stringify({
     token,
   }),
 })

 const data = await response.json()

 if (!response.ok) {
   throw new Error(data.message || 'Email verification failed')
 }

 window.history.replaceState({}, document.title, window.location.pathname)
 showToast('Email verified successfully')
 await loadMe()
} catch (error) {
 showToast(
   error instanceof Error ? error.message : 'Email verification failed',
   'error',
 )
}
}

async function resendVerificationEmail() {
if (!auth?.user.email) {
 return
}

setLoading(true)

try {
 const response = await fetch(`${API_URL}/auth/request-email-verification`, {
   method: 'POST',
   headers: {
     'Content-Type': 'application/json',
   },
   credentials: 'include',
   body: JSON.stringify({
     email: auth.user.email,
   }),
 })

 const data = await response.json()

 if (!response.ok) {
   throw new Error(data.message || 'Failed to send verification email')
 }

 showToast('Verification email sent')
} catch (error) {
 showToast(
   error instanceof Error
     ? error.message
     : 'Failed to send verification email',
   'error',
 )
} finally {
 setLoading(false)
}
}

  async function handleLogout() {
    setLoading(true)
    setMessage('Logging out...')

    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      setAuth(null)
      setTwoFactorToken('')
      setAuthMode('login')
      showToast('Logged out successfully')
    } catch {
      showToast('Logout failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function stopImpersonation() {
  setLoading(true)

  try {
    const response = await fetch(`${API_URL}/platform-admin/impersonation/stop`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, 'Failed to exit impersonation'))
    }

    const data = await response.json()
    setAuth(data)
    setActiveModule('Inbox')
    showToast('Exited impersonation mode')
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to exit impersonation',
      'error',
    )
  } finally {
    setLoading(false)
  }
}

  async function handleCreateContactType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const color = String(form.get('color') || '').trim()

    if (!name) {
      showToast('Contact type name is required', 'error')
      return
    }

    const response = await fetch(`${API_URL}/contact-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        color,
      }),
    })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to create contact type'), 'error')
    return
  }

  const createdContactType = await response.json()

  setContactTypes((currentTypes) => [
    createdContactType,
    ...currentTypes.filter((type) => type.id !== createdContactType.id),
  ])

  event.currentTarget.reset()
  showToast('Contact type added successfully and visible in Contact Types')
}

async function deleteContactType(contactTypeId: string) {
    const confirmed = window.confirm(
      'Delete this contact type? Existing contacts will keep working without this type.',
    )

    if (!confirmed) {
      return
    }

    const response = await fetch(`${API_URL}/contact-types/${contactTypeId}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to delete contact type'), 'error')
      return
    }

  setContactTypes((currentTypes) =>
    currentTypes.filter((contactType) => contactType.id !== contactTypeId),
  )

  setContacts((currentContacts) =>
    currentContacts.map((contact) =>
      contact.contactTypeId === contactTypeId
        ? {
            ...contact,
            contactTypeId: null,
            contactType: null,
          }
        : contact,
    ),
  )

  showToast('Contact type deleted')
  }

  function downloadSampleContactsCsv() {
    const csv = [
      'name,phone,email,tags,contactType,optedIn,optInSource',
      'Saurabh,919999999999,saurabh@example.com,lead|customer,Customer,true,website form',
      'Test Supplier,918888888888,supplier@example.com,supplier|imported,Supplier,false,',
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'contacts-sample.csv'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  async function exportContactsCsv() {
    window.location.href = `${API_URL}/contacts/export.csv`
  }

  function parseCsvLine(line: string) {
    const values: string[] = []
    let current = ''
    let insideQuotes = false

    for (const char of line) {
      if (char === '"') {
        insideQuotes = !insideQuotes
        continue
      }

      if (char === ',' && !insideQuotes) {
        values.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    values.push(current.trim())
    return values
  }

  function parseContactsCsv(csvText: string): ContactImportRow[] {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length < 2) {
      throw new Error('CSV must include header and at least one contact row')
    }

    const [headerLine, ...rows] = lines
    const headers = parseCsvLine(headerLine).map((header) =>
      header.replace(/^\uFEFF/, '').trim().toLowerCase(),
    )

    if (!headers.includes('name') || !headers.includes('phone')) {
      throw new Error('CSV must include name and phone columns')
    }

    return rows.map((line) => {
      const values = parseCsvLine(line)
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index] || '']),
      )

      return {
        name: String(row.name || '').trim(),
        phone: normalizeWhatsAppPhone(row.phone),
        email: cleanEmail(row.email),
        tags: cleanCsvTagsText(row.tags),
        contactTypeName: String(row.contacttype || '').trim(),
        optedIn: parseCsvBoolean(row.optedin),
        optInSource: String(row.optinsource || '').trim(),
      }
    })
  }

  async function importContactsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    if (!file) {
      return
    }

    if (file.size > CONTACT_IMPORT_MAX_FILE_SIZE_BYTES) {
      showToast('CSV file is too large. Maximum size is 1 MB', 'error')
      event.currentTarget.value = ''
      return
    }

    try {
      const csvText = await file.text()
      const rows = parseContactsCsv(csvText)

      if (rows.length > CONTACT_IMPORT_LIMIT) {
        showToast(`CSV import limit is ${CONTACT_IMPORT_LIMIT} contacts at a time`, 'error')
        event.currentTarget.value = ''
        return
      }

      const response = await fetch(`${API_URL}/contacts/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          rows,
        }),
      })

      if (!response.ok) {
        showToast(await readApiError(response, 'Failed to import contacts'), 'error')
        return
      }

      const result = await response.json()
      const errorCount = Array.isArray(result.errors) ? result.errors.length : 0

      showToast(
        `Imported ${result.imported}, skipped ${result.skipped}, errors ${errorCount}`,
      )

      await loadContacts()
      setContactsTab('list')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to read CSV', 'error')
    } finally {
      event.currentTarget.value = ''
    }
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const phone = normalizeWhatsAppPhone(form.get('phone'))
    const email = cleanEmail(form.get('email'))
    const tags = cleanTagsText(form.get('tags'))
    const optedIn = form.get('optedIn') === 'on'
    const optInSource = String(form.get('optInSource') || '').trim()
    const contactTypeId = String(form.get('contactTypeId') || '').trim() || null

    if (!name) {
      showToast('Contact name is required', 'error')
      return
    }

    if (!isValidWhatsAppPhone(phone)) {
      showToast('Phone must include country code and be 11 to 15 digits', 'error')
      return
    }

    if (!isValidEmail(email)) {
      showToast('Email is invalid', 'error')
      return
    }

    if (optedIn && !optInSource) {
      showToast('Opt-in source is required when contact is opted in', 'error')
      return
    }

    const response = await fetch(`${API_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        phone,
        email,
        tags,
        contactTypeId,
        optedIn,
        optInSource,
      }),
    })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to add contact'), 'error')
    return
  }

  const createdContact = await response.json()

  setContacts((currentContacts) => [
    createdContact,
    ...currentContacts.filter((contact) => contact.id !== createdContact.id),
  ])

  event.currentTarget.reset()
  showToast('Contact added successfully and visible in Contact List')
  setContactsTab('list')
}

async function handleUpdateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingContact) {
      return
    }

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const phone = normalizeWhatsAppPhone(form.get('phone'))
    const email = cleanEmail(form.get('email'))
    const tags = cleanTagsText(form.get('tags'))
    const contactTypeId = String(form.get('contactTypeId') || '').trim() || null

    if (!name) {
      showToast('Contact name is required', 'error')
      return
    }

    if (!isValidWhatsAppPhone(phone)) {
      showToast('Phone must include country code and be 11 to 15 digits', 'error')
      return
    }

    if (!isValidEmail(email)) {
      showToast('Email is invalid', 'error')
      return
    }

    const response = await fetch(`${API_URL}/contacts/${editingContact.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        phone,
        email,
        tags,
        contactTypeId,
      }),
    })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to update contact'), 'error')
    return
  }

  const updatedContact = await response.json()

  setContacts((currentContacts) =>
    currentContacts.map((contact) =>
      contact.id === updatedContact.id ? updatedContact : contact,
    ),
  )

  setEditingContact(null)
  showToast('Contact updated successfully')
}

async function optOutContact(contactId: string) {
    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-out`, {
      method: 'PATCH',
      credentials: 'include',
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to opt out contact'), 'error')
      return
    }

    showToast('Contact opted out')
    await loadContacts()
  }

  async function optInContact(contactId: string) {
    const optInSource = window.prompt(
      'Enter opt-in source, e.g. website form or phone consent',
    )

    if (!optInSource) {
      return
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-in`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        optInSource,
      }),
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to opt in contact'), 'error')
      return
    }

    showToast('Contact opted in')
    await loadContacts()
  }

  async function deleteContact(contactId: string) {
    const confirmed = window.confirm('Delete this contact? This cannot be undone.')

    if (!confirmed) {
      return
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to delete contact'), 'error')
      return
    }

  setContacts((currentContacts) =>
    currentContacts.filter((contact) => contact.id !== contactId),
  )

  showToast('Contact deleted')
  }

  function getTemplateVariableNumbers(text: string) {
  return Array.from(
    new Set(
      Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) =>
        Number(match[1]),
      ),
    ),
  ).sort((a, b) => a - b)
}

function getSequentialVariableError(variables: number[], label: string) {
  for (let index = 0; index < variables.length; index += 1) {
    if (variables[index] !== index + 1) {
      return `${label} variables must start from {{1}} and continue like {{2}}, {{3}}`
    }
  }

  return ''
}

function getHeaderMediaAccept(headerType: string | null) {
  if (headerType === 'IMAGE') {
    return 'image/jpeg,image/png,image/webp'
  }

  if (headerType === 'VIDEO') {
    return 'video/mp4'
  }

  if (headerType === 'DOCUMENT') {
    return 'application/pdf'
  }

  return ''
}

function templateNeedsHeaderMedia(headerType: string | null) {
  return !!headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)
}

function updateTemplateDraftPreview(field: keyof TemplateDraftPreview, value: string) {
  setTemplateDraftPreview((currentDraft) => ({
    ...currentDraft,
    [field]: value,
  }))
}

function createTemplateBuilderButton(type = 'QUICK_REPLY'): TemplateBuilderButton {
return {
 id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
 type,
 text: type === 'OTP' ? 'Copy code' : type === 'FLOW' ? 'Open Flow' : '',
 url: '',
 phoneNumber: '',
 otpType: 'COPY_CODE',
 flowId: '',
 flowAction: 'NAVIGATE',
 navigateScreen: '',
}
}

function addTemplateBuilderButton() {
if (templateBuilderButtons.length >= 10) {
 showToast('Maximum 10 buttons are allowed', 'error')
 return
}

setTemplateBuilderButtons((currentButtons) => [
 ...currentButtons,
 createTemplateBuilderButton(),
])
}

function updateTemplateBuilderButton(
buttonId: string,
field: keyof TemplateBuilderButton,
value: string,
) {
setTemplateBuilderButtons((currentButtons) =>
 currentButtons.map((button) => {
   if (button.id !== buttonId) {
     return button
   }

   if (field === 'type') {
     return {
       ...button,
       type: value,
       text:
         value === 'OTP'
           ? 'Copy code'
           : value === 'FLOW'
             ? button.text || 'Open Flow'
             : button.text === 'Copy code'
               ? ''
               : button.text,
       url: value === 'URL' ? button.url : '',
       phoneNumber: value === 'PHONE_NUMBER' ? button.phoneNumber : '',
       otpType: value === 'OTP' ? button.otpType || 'COPY_CODE' : 'COPY_CODE',
       flowId: value === 'FLOW' ? button.flowId : '',
       flowAction: value === 'FLOW' ? button.flowAction || 'NAVIGATE' : 'NAVIGATE',
       navigateScreen: value === 'FLOW' ? button.navigateScreen : '',
     }
   }

   return {
     ...button,
     [field]: value,
   }
 }),
)
}

function removeTemplateBuilderButton(buttonId: string) {
setTemplateBuilderButtons((currentButtons) =>
 currentButtons.filter((button) => button.id !== buttonId),
)
}

function createCarouselButton(type: CarouselButtonType = 'QUICK_REPLY'): CarouselBuilderButton {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    text: '',
    url: '',
    phoneNumber: '',
  }
}

function createCarouselBuilderCard(): CarouselBuilderCard {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    headerFormat: 'IMAGE',
    mediaFileName: '',
    mediaPreview: '',
    metaHeaderHandle: '',
    bodyText: '',
    buttons: [createCarouselButton()],
    uploading: false,
  }
}

function addCarouselCard() {
  if (carouselBuilderCards.length >= 5) {
    showToast('Carousel can have maximum 5 cards', 'error')
    return
  }

  setCarouselBuilderCards((cards) => [...cards, createCarouselBuilderCard()])
}

function removeCarouselCard(cardId: string) {
  if (carouselBuilderCards.length <= 2) {
    showToast('Carousel needs at least 2 cards', 'error')
    return
  }

  setCarouselBuilderCards((cards) => cards.filter((card) => card.id !== cardId))
}

function updateCarouselCard(
  cardId: string,
  field: keyof CarouselBuilderCard,
  value: string,
) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            [field]: value,
          }
        : card,
    ),
  )
}

function addCarouselCardButton(cardId: string) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) => {
      if (card.id !== cardId) {
        return card
      }

      if (card.buttons.length >= 2) {
        showToast('Each carousel card can have maximum 2 buttons', 'error')
        return card
      }

      return {
        ...card,
        buttons: [...card.buttons, createCarouselButton()],
      }
    }),
  )
}

function removeCarouselCardButton(cardId: string, buttonId: string) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            buttons: card.buttons.filter((button) => button.id !== buttonId),
          }
        : card,
    ),
  )
}

function updateCarouselCardButton(
  cardId: string,
  buttonId: string,
  field: keyof CarouselBuilderButton,
  value: string,
) {
  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            buttons: card.buttons.map((button) =>
              button.id === buttonId
                ? {
                    ...button,
                    [field]: value,
                  }
                : button,
            ),
          }
        : card,
    ),
  )
}

async function uploadCarouselCardMedia(cardId: string, file?: File) {
  if (!file) {
    return
  }

  if (!metaConnection?.account?.metaAppId) {
    showToast('Save Meta App ID in Settings before uploading carousel media', 'error')
    return
  }

  setCarouselBuilderCards((cards) =>
    cards.map((card) =>
      card.id === cardId ? { ...card, uploading: true } : card,
    ),
  )

  try {
    const mediaForm = new FormData()
    mediaForm.append('file', file)

    const uploadResponse = await fetch(`${API_URL}/media/upload`, {
      method: 'POST',
      credentials: 'include',
      body: mediaForm,
    })

    if (!uploadResponse.ok) {
      throw new Error(await readApiError(uploadResponse, 'Failed to upload media'))
    }

    const uploadedMedia: MediaFile = await uploadResponse.json()

    if (!['IMAGE', 'VIDEO'].includes(uploadedMedia.mediaType)) {
      throw new Error('Carousel card media must be image or video')
    }

    const handleResponse = await fetch(`${API_URL}/templates/media-handle`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaId: uploadedMedia.id,
      }),
    })

    if (!handleResponse.ok) {
      throw new Error(
        await readApiError(handleResponse, 'Failed to upload carousel media to Meta'),
      )
    }

    const result = await handleResponse.json()
    const mediaPreview = URL.createObjectURL(file)

    setCarouselBuilderCards((cards) =>
      cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              headerFormat: uploadedMedia.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
              mediaFileName: uploadedMedia.originalName,
              mediaPreview,
              metaHeaderHandle: result.metaHeaderHandle,
              uploading: false,
            }
          : card,
      ),
    )

    showToast('Carousel card media uploaded to Meta')
  } catch (error) {
    setCarouselBuilderCards((cards) =>
      cards.map((card) =>
        card.id === cardId ? { ...card, uploading: false } : card,
      ),
    )

    showToast(
      error instanceof Error ? error.message : 'Failed to upload carousel media',
      'error',
    )
  }
}

function buildCarouselComponentsFromBuilder(bodyText: string) {
  if (!carouselBuilderEnabled) {
    return []
  }

  if (!bodyText.trim()) {
    throw new Error('Carousel main body text is required')
  }

    if (/{{\s*\d+\s*}}/.test(bodyText)) {
    throw new Error('Carousel main body cannot use variables yet')
  }

  if (carouselBuilderCards.length < 2 || carouselBuilderCards.length > 5) {
    throw new Error('Carousel must have 2 to 5 cards')
  }

  const cards = carouselBuilderCards.map((card, cardIndex) => {
    if (!card.metaHeaderHandle) {
      throw new Error(`Carousel card ${cardIndex + 1}: upload media first`)
    }

    if (!card.bodyText.trim()) {
      throw new Error(`Carousel card ${cardIndex + 1}: body text is required`)
    }

    if (/{{\s*\d+\s*}}/.test(card.bodyText)) {
      throw new Error(
        `Carousel card ${cardIndex + 1}: body text cannot use variables yet`,
      )
    }

    if (card.buttons.length < 1 || card.buttons.length > 2) {
      throw new Error(`Carousel card ${cardIndex + 1}: add 1 to 2 buttons`)
    }

    return {
      components: [
        {
          type: 'HEADER',
          format: card.headerFormat,
          example: {
            header_handle: [card.metaHeaderHandle],
          },
        },
        {
          type: 'BODY',
          text: card.bodyText.trim(),
        },
        {
          type: 'BUTTONS',
          buttons: card.buttons.map((button, buttonIndex) => {
            const text = button.text.trim()

            if (!text) {
              throw new Error(
                `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: text is required`,
              )
            }

            if (button.type === 'URL') {
              if (!/^https:\/\/[^\s]+\.[^\s]+/.test(button.url.trim())) {
                throw new Error(
                  `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: URL must start with https://`,
                )
              }

              return {
                type: 'URL',
                text,
                url: button.url.trim(),
              }
            }

            if (button.type === 'PHONE_NUMBER') {
              if (!/^\+?[1-9]\d{7,14}$/.test(button.phoneNumber.trim())) {
                throw new Error(
                  `Carousel card ${cardIndex + 1} button ${buttonIndex + 1}: phone number is invalid`,
                )
              }

              return {
                type: 'PHONE_NUMBER',
                text,
                phoneNumber: button.phoneNumber.trim(),
              }
            }

            return {
              type: 'QUICK_REPLY',
              text,
            }
          }),
        },
      ],
    }
  })

  return [
    {
      type: 'BODY',
      text: bodyText.trim(),
    },
    {
      type: 'CAROUSEL',
      cards,
    },
  ]
}

function buildTemplateButtonsFromBuilder(
category: string,
hasAdvancedComponents: boolean,
): TemplateButton[] {
const visibleButtons = templateBuilderButtons.filter((button) => button.type)

if (hasAdvancedComponents && visibleButtons.length > 0) {
 throw new Error('Carousel templates cannot be mixed with normal buttons')
}

if (hasAdvancedComponents) {
 return []
}

const urlCount = visibleButtons.filter((button) => button.type === 'URL').length
const phoneCount = visibleButtons.filter(
 (button) => button.type === 'PHONE_NUMBER',
).length
const otpCount = visibleButtons.filter((button) => button.type === 'OTP').length
const flowCount = visibleButtons.filter((button) => button.type === 'FLOW').length

if (urlCount > 2) {
 throw new Error('Maximum 2 website URL buttons are allowed')
}

if (phoneCount > 1) {
 throw new Error('Maximum 1 phone call button is allowed')
}

if (otpCount > 1) {
 throw new Error('Maximum 1 OTP button is allowed')
}

if (flowCount > 1) {
 throw new Error('Maximum 1 WhatsApp Flow button is allowed')
}

return visibleButtons.map((button, index) => {
 const text = button.type === 'OTP' ? 'Copy code' : button.text.trim()

 if (button.type !== 'OTP' && !text) {
   throw new Error(`Button ${index + 1}: button text is required`)
 }

 if (text.length > 25) {
   throw new Error(`Button ${index + 1}: button text cannot exceed 25 characters`)
 }

 if (button.type === 'OTP') {
   if (category !== 'AUTHENTICATION') {
     throw new Error('OTP button is only allowed for Authentication templates')
   }

   return {
     type: 'OTP',
     text: 'Copy code',
     otpType: button.otpType || 'COPY_CODE',
   }
 }

 if (button.type === 'URL') {
   if (!/^https:\/\/[^\s]+\.[^\s]+/.test(button.url.trim())) {
     throw new Error(`Button ${index + 1}: URL must start with https://`)
   }

   return {
     type: 'URL',
     text,
     url: button.url.trim(),
   }
 }

 if (button.type === 'PHONE_NUMBER') {
   const phoneNumber = button.phoneNumber.trim()

   if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber)) {
     throw new Error(
       `Button ${index + 1}: phone number must be in international format`,
     )
   }

   return {
     type: 'PHONE_NUMBER',
     text,
     phoneNumber,
   }
 }

 if (button.type === 'FLOW') {
   if (category === 'AUTHENTICATION') {
     throw new Error('Flow button is not allowed for Authentication templates')
   }

   if (!button.flowId.trim()) {
     throw new Error(`Button ${index + 1}: Meta Flow ID is required`)
   }

   return {
     type: 'FLOW',
     text,
     flowId: button.flowId.trim(),
     flowAction: button.flowAction || 'NAVIGATE',
     ...(button.navigateScreen.trim()
       ? { navigateScreen: button.navigateScreen.trim() }
       : {}),
   }
 }

 return {
   type: 'QUICK_REPLY',
   text,
 }
})
}

function handleCreateTemplateHeaderFileChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0] || null

  if (templateHeaderSamplePreview) {
    URL.revokeObjectURL(templateHeaderSamplePreview)
  }

  setTemplateHeaderSampleFile(file)

  if (!file) {
    setTemplateHeaderSamplePreview('')
    return
  }

  if (
    templateDraftPreview.headerType === 'IMAGE' ||
    templateDraftPreview.headerType === 'VIDEO'
  ) {
    setTemplateHeaderSamplePreview(URL.createObjectURL(file))
    return
  }

  setTemplateHeaderSamplePreview('')
}

async function uploadTemplateHeaderMediaSample(
  template: WhatsappTemplate,
  file: File,
) {
  const mediaForm = new FormData()
  mediaForm.append('file', file)

  const uploadResponse = await fetch(`${API_URL}/media/upload`, {
    method: 'POST',
    credentials: 'include',
    body: mediaForm,
  })

  if (!uploadResponse.ok) {
    throw new Error(await readApiError(uploadResponse, 'Failed to upload media'))
  }

  const uploadedMedia: MediaFile = await uploadResponse.json()

  const attachResponse = await fetch(
    `${API_URL}/templates/${template.id}/header-media`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mediaId: uploadedMedia.id,
      }),
    },
  )

  if (!attachResponse.ok) {
    throw new Error(
      await readApiError(attachResponse, 'Failed to upload media sample to Meta'),
    )
  }

  const result = await attachResponse.json()
  const updatedTemplate = result.template || result

  return {
    uploadedMedia,
    updatedTemplate: {
      ...updatedTemplate,
      headerMediaFile: updatedTemplate.headerMediaFile || uploadedMedia,
    },
  }
}

async function handleTemplateHeaderMediaUpload(
  event: ChangeEvent<HTMLInputElement>,
  template: WhatsappTemplate,
) {
  const file = event.currentTarget.files?.[0]

  if (!file) {
    return
  }

  if (!templateNeedsHeaderMedia(template.headerType)) {
    showToast('This template does not need header media', 'error')
    event.currentTarget.value = ''
    return
  }

  try {
    const { uploadedMedia, updatedTemplate } =
      await uploadTemplateHeaderMediaSample(template, file)

    setMediaFiles((currentFiles) => [
      uploadedMedia,
      ...currentFiles.filter((mediaFile) => mediaFile.id !== uploadedMedia.id),
    ])

    setTemplates((currentTemplates) =>
      currentTemplates.map((currentTemplate) =>
        currentTemplate.id === updatedTemplate.id ? updatedTemplate : currentTemplate,
      ),
    )

    showToast('Header media sample uploaded to Meta successfully')
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Failed to upload header media sample',
      'error',
    )
  } finally {
    event.currentTarget.value = ''
  }
}

async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  const formElement = event.currentTarget
  const form = new FormData(formElement)
  const name = String(form.get('name') || '').trim()
  const language = String(form.get('language') || '').trim()
  const category = String(form.get('category') || '').trim()
  const headerType = String(form.get('headerType') || '').trim()
  const headerText = String(form.get('headerText') || '').trim()
  const bodyText = String(form.get('bodyText') || '').trim()
  const footerText = String(form.get('footerText') || '').trim()

  if (!name) {
    showToast('Template name is required', 'error')
    return
  }

  if (!bodyText) {
    showToast('Template body is required', 'error')
    return
  }

  if (templateNeedsHeaderMedia(headerType) && !templateHeaderSampleFile) {
  showToast('Upload header media sample before creating this template', 'error')
  return
}

if (templateNeedsHeaderMedia(headerType) && !metaConnection?.account?.metaAppId) {
  showToast('Save Meta App ID in Settings before uploading header media', 'error')
  return
}

if (carouselBuilderEnabled && category === 'AUTHENTICATION') {
  showToast('Carousel templates cannot use Authentication category', 'error')
  return
}

let templatePayload: {
  buttons: TemplateButton[]
  advancedComponents: Array<Record<string, unknown>>
}

try {
  const advancedComponents = carouselBuilderEnabled
    ? buildCarouselComponentsFromBuilder(bodyText)
    : []

  templatePayload = {
    advancedComponents,
    buttons: buildTemplateButtonsFromBuilder(
      category,
      advancedComponents.length > 0,
    ),
  }
} catch (error) {
  showToast(
    error instanceof Error
      ? error.message
      : 'Invalid template button or carousel data',
    'error',
  )
  return
}

  try {
    const response = await fetch(`${API_URL}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
body: JSON.stringify({
  name,
  language,
  category,
  headerType,
  headerText,
  bodyText,
  footerText,
  buttons: templatePayload.buttons,
  advancedComponents: templatePayload.advancedComponents,
}),
    })

    if (!response.ok) {
      showToast(await readApiError(response, 'Failed to create template'), 'error')
      return
    }

const createdTemplate = await response.json()
let finalTemplate = createdTemplate

if (templateNeedsHeaderMedia(headerType) && templateHeaderSampleFile) {
  const { uploadedMedia, updatedTemplate } =
    await uploadTemplateHeaderMediaSample(createdTemplate, templateHeaderSampleFile)

  finalTemplate = updatedTemplate

  setMediaFiles((currentFiles) => [
    uploadedMedia,
    ...currentFiles.filter((mediaFile) => mediaFile.id !== uploadedMedia.id),
  ])
}

setTemplates((currentTemplates) => [
  finalTemplate,
  ...currentTemplates.filter(
    (template) => template.id !== finalTemplate.id,
  ),
])

formElement.reset()
setTemplateFormKey((currentKey) => currentKey + 1)
setTemplateDraftPreview(emptyTemplateDraftPreview)
setTemplateBuilderButtons([])
setCarouselBuilderEnabled(false)
setCarouselBuilderCards([createCarouselBuilderCard(), createCarouselBuilderCard()])
setTemplateHeaderSampleFile(null)

if (templateHeaderSamplePreview) {
  URL.revokeObjectURL(templateHeaderSamplePreview)
}

setTemplateHeaderSamplePreview('')
setTemplatesTab('list')
showToast(
  templateNeedsHeaderMedia(headerType)
    ? 'Template draft created and media sample uploaded'
    : 'Template draft created successfully',
)
  } catch {
    showToast('Failed to create template', 'error')
  }
}

async function syncTemplatesFromMeta() {
  const response = await fetch(`${API_URL}/templates/sync`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to sync templates'), 'error')
    return
  }

  const result = await response.json()

  await loadTemplates()

  showToast(`Synced ${result.synced || 0} templates from Meta`)
}

async function copyTemplateAsDraft(template: WhatsappTemplate) {
  const suggestedName = `${template.name}_copy`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)

  const newName = window.prompt(
    'Enter new draft template name using lowercase letters, numbers, and underscores.',
    suggestedName,
  )

  if (!newName) {
    return
  }

  const response = await fetch(`${API_URL}/templates/${template.id}/copy`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: newName,
    }),
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to copy template'), 'error')
    return
  }

  const copiedTemplate = await response.json()

  setTemplates((currentTemplates) => [
    copiedTemplate,
    ...currentTemplates.filter(
      (currentTemplate) => currentTemplate.id !== copiedTemplate.id,
    ),
  ])

  setTemplatesTab('list')
  showToast('Template copied as new draft')
}

async function refreshTemplateFromMeta(templateId: string) {
  const response = await fetch(`${API_URL}/templates/${templateId}/refresh`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(
      await readApiError(response, 'Failed to refresh template status'),
      'error',
    )
    return
  }

  const result = await response.json()

  if (result.template) {
    setTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.id === result.template.id ? result.template : template,
      ),
    )
  } else {
    await loadTemplates()
  }

  showToast('Template status refreshed from Meta')
}

function isCarouselTemplate(template: WhatsappTemplate) {
  return Array.isArray(template.components)
    ? template.components.some(
        (component) =>
          String(component.type || '').toUpperCase() === 'CAROUSEL',
      )
    : false
}

function formatTemplateSyncedAt(value?: string | null) {
  if (!value) {
    return 'Not synced yet'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Synced with Meta'
  }

  return `Synced ${date.toLocaleString()}`
}

async function handleSubmitTemplate(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (!submittingTemplate) {
    showToast('Select a draft template first', 'error')
    return
  }

const form = new FormData(event.currentTarget)
const isCarousel = isCarouselTemplate(submittingTemplate)

if (isCarousel) {
  const response = await fetch(
    `${API_URL}/templates/${submittingTemplate.id}/submit`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bodyExamples: [],
        headerExamples: [],
      }),
    },
  )

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to submit carousel template'), 'error')
    return
  }

  const result = await response.json()

  setTemplates((currentTemplates) =>
    currentTemplates.map((template) =>
      template.id === result.template.id ? result.template : template,
    ),
  )

  setSubmittingTemplate(null)
  showToast('Carousel template submitted to Meta for review')
  return
}

const bodyVariables = getTemplateVariableNumbers(submittingTemplate.bodyText)
  const headerVariables = getTemplateVariableNumbers(
    submittingTemplate.headerText || '',
  )

  const bodyVariableError = getSequentialVariableError(bodyVariables, 'Body')
const headerVariableError = getSequentialVariableError(headerVariables, 'Header')

if (headerVariableError) {
  showToast(headerVariableError, 'error')
  return
}

if (bodyVariableError) {
  showToast(bodyVariableError, 'error')
  return
}

  const bodyExamples = bodyVariables.map((variable) =>
    String(form.get(`bodyExample${variable}`) || '').trim(),
  )

  const headerExamples = headerVariables.map((variable) =>
    String(form.get(`headerExample${variable}`) || '').trim(),
  )

  if (bodyExamples.some((example) => !example)) {
    showToast('Fill all body variable examples', 'error')
    return
  }

  if (headerExamples.some((example) => !example)) {
    showToast('Fill all header variable examples', 'error')
    return
  }

  const response = await fetch(
    `${API_URL}/templates/${submittingTemplate.id}/submit`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bodyExamples,
        headerExamples,
      }),
    },
  )

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to submit template'), 'error')
    return
  }

  const result = await response.json()

  setTemplates((currentTemplates) =>
    currentTemplates.map((template) =>
      template.id === result.template.id ? result.template : template,
    ),
  )

  setSubmittingTemplate(null)
  showToast('Template submitted to Meta for review')
}

async function deleteTemplate(templateId: string) {
  const confirmed = window.confirm(
    'Delete this draft template? Only local draft templates can be deleted.',
  )

  if (!confirmed) {
    return
  }

  const response = await fetch(`${API_URL}/templates/${templateId}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Failed to delete template'), 'error')
    return
  }

  setTemplates((currentTemplates) =>
    currentTemplates.filter((template) => template.id !== templateId),
  )

  showToast('Template deleted')
}

async function deleteTemplateFromMeta(templateId: string) {
  const confirmed = window.confirm(
    'Delete this template from Meta? This cannot be undone.',
  )

  if (!confirmed) {
    return
  }

  const response = await fetch(`${API_URL}/templates/${templateId}/meta`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(
      await readApiError(response, 'Failed to delete template from Meta'),
      'error',
    )
    return
  }

  setTemplates((currentTemplates) =>
    currentTemplates.filter((template) => template.id !== templateId),
  )

  showToast('Template deleted from Meta successfully')
}

async function testMetaConnection() {
  const response = await fetch(`${API_URL}/meta-accounts/test`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    showToast(await readApiError(response, 'Meta connection test failed'), 'error')
    return
  }

  showToast('Meta connection test successful')
}

function renderSettingsContent() {
  return (
    <div className="content-card">
      <div className="contacts-topbar">
        <div>
          <h2>Settings</h2>
          <p>
            WhatsApp connection is managed securely from Billing using Facebook
            Embedded Signup.
          </p>
        </div>

        <span className="status-pill">
          {metaConnection?.connected ? 'Meta connected' : 'Not connected'}
        </span>
      </div>

      <section className="sub-card">
        <div className="section-heading">
          <div>
            <h3>Meta WhatsApp Connection</h3>
            <p>
              Access tokens are never entered in the frontend. Connect WhatsApp
              from Billing after your plan is active.
            </p>
          </div>
        </div>

        {metaConnection?.connected ? (
          <div className="import-export-bar">
            <button type="button" onClick={testMetaConnection}>
              Test Meta Connection
            </button>
          </div>
        ) : (
          <div className="import-export-bar">
            <button type="button" onClick={() => setActiveModule('Billing')}>
              Go to Billing & Connect WhatsApp
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function renderTemplatesContent() {
  return (
    <div className="content-card templates-workspace">
      <div className="contacts-topbar">
<div>
  <h2>WhatsApp Templates</h2>
  <p>
    Create, preview, submit, sync, refresh, and manage official Meta WhatsApp templates.
  </p>
</div>

        <span className="status-pill">{filteredTemplates.length} templates shown</span>
      </div>

      <div className="contacts-tabs">
        <button
          className={templatesTab === 'list' ? 'active' : ''}
          type="button"
          onClick={() => setTemplatesTab('list')}
        >
          Template List
        </button>
        <button
          className={templatesTab === 'create' ? 'active' : ''}
          type="button"
          onClick={() => setTemplatesTab('create')}
        >
          Create Template
        </button>

        <button
  className={templatesTab === 'guide' ? 'active' : ''}
  type="button"
  onClick={() => setTemplatesTab('guide')}
>
  Template Guide
</button>
      </div>

      {templatesTab === 'list' ? (
        <>
          <section className="sub-card">
            <div className="section-heading">
<div>
  <h3>Template Library</h3>
  <p>
    Manage local drafts and synced Meta templates from one place.
  </p>
</div>
            </div>

            <div className="templates-filter-grid">
              <input
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                placeholder="Search name, language, or body"
              />

              <select
                value={templateStatusFilter}
                onChange={(event) => setTemplateStatusFilter(event.target.value)}
              >
                <option value="all">All status</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={templateCategoryFilter}
                onChange={(event) => setTemplateCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </select>

<button type="button" onClick={syncTemplatesFromMeta}>
  Sync from Meta
</button>
            </div>
          </section>

          <div className="templates-list">
            {filteredTemplates.length === 0 ? (
              <div className="empty-state">
                <strong>No templates found</strong>
                <span>Create a draft template to start.</span>
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <article className="template-card" key={template.id}>
                  <div className="template-card-header">
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {template.language} · {template.category}
                      </span>
                    </div>

                    <span className={`template-status ${template.status.toLowerCase()}`}>
                      {template.status}
                    </span>
                  </div>

{template.headerType ? (
  <div className="template-preview-line">
    Header: {template.headerType}
    {template.headerText ? ` · ${template.headerText}` : ''}
  </div>
) : null}

{template.headerType &&
['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType) ? (
  <div className="template-media-box">
    <div>
      <strong>Header media sample</strong>
      <span>
        {template.headerMediaFile
          ? template.headerMediaFile.originalName
          : 'No media sample uploaded yet'}
      </span>
    </div>

    {template.status === 'DRAFT' ? (
      <label className="small-upload-button">
        Upload sample
        <input
          accept={getHeaderMediaAccept(template.headerType)}
          type="file"
          onChange={(event) => handleTemplateHeaderMediaUpload(event, template)}
        />
      </label>
    ) : null}
  </div>
) : null}

                  <p className="template-body-preview">{template.bodyText}</p>

                  {template.footerText ? (
                    <div className="template-preview-line">
                      Footer: {template.footerText}
                    </div>
                  ) : null}

<div className="template-meta-row">
  <span>{template.variableCount} variables</span>
  <span>{template.buttons?.length || 0} buttons</span>

  {templateNeedsHeaderMedia(template.headerType) ? (
    template.metaHeaderHandle ? (
      <span className="meta-good">Meta media ready</span>
    ) : (
      <span className="meta-warning">Media sample missing</span>
    )
  ) : null}

  {template.qualityScore ? (
    <span>Quality: {template.qualityScore}</span>
  ) : null}

  {template.status !== 'DRAFT' ? (
    <span>{formatTemplateSyncedAt(template.lastSyncedAt)}</span>
  ) : (
    <span>Local draft</span>
  )}
</div>

{template.rejectedReason ? (
  <div className="template-rejection-box">
    <strong>Meta rejection reason</strong>
    <span>{template.rejectedReason}</span>
  </div>
) : null}

<div className="contact-actions template-actions">
  <button
    className="small-secondary-button"
    type="button"
    onClick={() => copyTemplateAsDraft(template)}
  >
    Copy as draft
  </button>

  {template.status === 'DRAFT' ? (
    <>
      <button
        className="small-success-button"
        type="button"
        onClick={() => {
          if (
            templateNeedsHeaderMedia(template.headerType) &&
            !template.metaHeaderHandle
          ) {
            showToast('Upload header media sample before submitting to Meta', 'error')
            return
          }

          setSubmittingTemplate(template)
        }}
      >
        Submit to Meta
      </button>

      <button
        className="small-danger-button"
        type="button"
        onClick={() => deleteTemplate(template.id)}
      >
        Delete draft
      </button>
    </>
  ) : (
    <>
      <button
        className="small-secondary-button"
        type="button"
        onClick={() => refreshTemplateFromMeta(template.id)}
      >
        Refresh status
      </button>

      <button
        className="small-danger-button"
        type="button"
        onClick={() => deleteTemplateFromMeta(template.id)}
      >
        Delete from Meta
      </button>
    </>
  )}
</div>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {submittingTemplate ? (
  <div className="modal-backdrop">
    <div className="modal-card">
      <div className="modal-header">
        <div>
          <h3>Submit template to Meta</h3>
          <p>
            Add sample values for variables. Meta needs these examples for
            review.
          </p>
        </div>

        <button type="button" onClick={() => setSubmittingTemplate(null)}>
          ×
        </button>
      </div>

      <form className="template-submit-form" onSubmit={handleSubmitTemplate}>
<div className="template-submit-preview">
  <strong>{submittingTemplate.name}</strong>
  <span>
    {submittingTemplate.language} · {submittingTemplate.category}
  </span>
  <p>{submittingTemplate.bodyText}</p>
</div>

<div className="template-review-checklist">
  <strong>Ready to submit checklist</strong>
  <span>✓ Template name uses Meta-safe lowercase format</span>
  <span>✓ Category is selected</span>
  <span>✓ Body text is ready</span>
  {templateNeedsHeaderMedia(submittingTemplate.headerType) ? (
    submittingTemplate.metaHeaderHandle ? (
      <span>✓ Header media sample uploaded to Meta</span>
    ) : (
      <span className="danger">✕ Header media sample missing</span>
    )
  ) : null}
{isCarouselTemplate(submittingTemplate) ? (
  <span>✓ Carousel cards and media handles are ready</span>
) : submittingTemplate.variableCount > 0 ? (
  <span>✓ Fill examples for all variables below</span>
) : (
  <span>✓ No variable examples required</span>
)}
</div>
         {!isCarouselTemplate(submittingTemplate) ? (
  <>
        {getTemplateVariableNumbers(submittingTemplate.headerText || '').map(
          (variable) => (
            <input
              key={`header-${variable}`}
              name={`headerExample${variable}`}
              placeholder={`Header example for {{${variable}}}`}
            />
          ),
        )}

        {getTemplateVariableNumbers(submittingTemplate.bodyText).map(
          (variable) => (
            <input
              key={`body-${variable}`}
              name={`bodyExample${variable}`}
              placeholder={`Body example for {{${variable}}}`}
            />
          ),
        )}
          </>
) : null}

        <div className="modal-actions">
          <button type="button" onClick={() => setSubmittingTemplate(null)}>
            Cancel
          </button>
          <button type="submit">Submit to Meta</button>
        </div>
      </form>
    </div>
  </div>
) : null}

      {templatesTab === 'guide' ? (
        <section className="sub-card template-guide-page">
          <div className="section-heading">
            <div>
              <h3>How WhatsApp Templates Work</h3>
              <p>
                Learn what each template type is used for before creating and submitting it to Meta.
              </p>
            </div>
          </div>

          <div className="template-guide-grid">
            <article className="template-guide-card">
              <strong>1. What is a WhatsApp Template?</strong>
              <p>
                A template is a pre-approved WhatsApp message. It is required when you message a customer outside the 24-hour customer service window.
              </p>
              <span>Use for: order updates, payment reminders, offers, OTP, appointment reminders.</span>
            </article>

            <article className="template-guide-card">
              <strong>2. Utility Templates</strong>
              <p>
                Utility templates are used for important customer updates like orders, invoices, delivery, payment, or account alerts.
              </p>
              <span>Example: Hello {'{{1}'}, your order {'{{2}'} is ready for dispatch.</span>
            </article>

            <article className="template-guide-card">
              <strong>3. Marketing Templates</strong>
              <p>
                Marketing templates are used for promotions, offers, product announcements, and follow-up campaigns.
              </p>
              <span>Important: Send only to opted-in contacts.</span>
            </article>

            <article className="template-guide-card">
              <strong>4. Authentication / OTP Templates</strong>
              <p>
                Authentication templates are used only for login codes, verification codes, and secure account access.
              </p>
              <span>OTP buttons are allowed only in Authentication category.</span>
            </article>

            <article className="template-guide-card">
              <strong>5. Variables</strong>
              <p>
                Variables are dynamic values like customer name, order number, amount, or date.
              </p>
              <span>Use like: {'{{1}'}, {'{{2}'}, {'{{3}'} in correct order.</span>
            </article>

            <article className="template-guide-card">
              <strong>6. Text Header</strong>
              <p>
                A text header is a bold title shown above the message body.
              </p>
              <span>Example: Order Update, Payment Reminder, Appointment Confirmed.</span>
            </article>

            <article className="template-guide-card">
              <strong>7. Image / Video / Document Header</strong>
              <p>
                Media headers show an image, video, or PDF above the message body. Meta requires a sample file before approval.
              </p>
              <span>Use for: product image, invoice PDF, offer poster, explainer video.</span>
            </article>

            <article className="template-guide-card">
              <strong>8. Buttons</strong>
              <p>
                Buttons help customers take action directly from WhatsApp.
              </p>
              <span>Types: Quick Reply, Website URL, Phone Call, OTP, Flow.</span>
            </article>

            <article className="template-guide-card">
              <strong>9. Quick Reply Button</strong>
              <p>
                Quick reply buttons let customers tap simple replies like Yes, No, Interested, or Call me.
              </p>
              <span>Best for: lead confirmation, support replies, simple choices.</span>
            </article>

            <article className="template-guide-card">
              <strong>10. Website URL Button</strong>
              <p>
                Website buttons open a secure link when the customer taps them.
              </p>
              <span>Use https links only, like payment links or tracking pages.</span>
            </article>

            <article className="template-guide-card">
              <strong>11. Phone Call Button</strong>
              <p>
                Phone buttons let the customer call your business directly.
              </p>
              <span>Use international format like +919999999999.</span>
            </article>

            <article className="template-guide-card">
              <strong>12. WhatsApp Flow Template</strong>
              <p>
                Flow templates open a form-like experience inside WhatsApp. Customers can fill details without leaving WhatsApp.
              </p>
              <span>Use for: lead forms, bookings, surveys, quote requests, support forms.</span>
            </article>

            <article className="template-guide-card">
              <strong>13. Carousel Template</strong>
              <p>
                Carousel templates show 2 to 5 cards in one message. Each card can have media, text, and buttons.
              </p>
              <span>Use for: product options, service packages, plans, catalogs, offers.</span>
            </article>

            <article className="template-guide-card">
              <strong>14. Template Approval</strong>
              <p>
                After creating a draft, submit it to Meta. Meta reviews the content and returns Approved, Pending, or Rejected.
              </p>
              <span>If rejected, check the rejection reason and copy as draft to fix it.</span>
            </article>

            <article className="template-guide-card">
              <strong>15. End Use</strong>
              <p>
                Approved templates will be used later in Campaigns, Auto Replies, Inbox follow-ups, Orders, and payment reminders.
              </p>
              <span>Only approved templates should be sent in bulk campaigns.</span>
            </article>

            <article className="template-guide-card warning">
              <strong>Important Rules</strong>
              <p>
                Do not create misleading, spammy, or policy-breaking templates. Marketing messages must go only to opted-in contacts.
              </p>
              <span>Outside 24 hours, use approved templates only.</span>
            </article>
          </div>
        </section>
      ) : null}

      {templatesTab === 'create' ? (
        <section className="sub-card">
          <div className="section-heading">
<div>
  <h3>Create Meta Template Draft</h3>
  <p>
    Use variables like {'{{1}'}, {'{{2}'} in order. Media headers need a sample before Meta submission.
  </p>
</div>
          </div>

<div className="template-composer-layout">
  <form
    key={templateFormKey}
    className="template-form template-composer-form"
    onSubmit={handleCreateTemplate}
  >
    <input
      name="name"
      value={templateDraftPreview.name}
      placeholder="Template name e.g. order_update"
      onChange={(event) =>
        updateTemplateDraftPreview('name', event.target.value)
      }
    />

    <input
      name="language"
      value={templateDraftPreview.language}
      placeholder="Language e.g. en_US"
      onChange={(event) =>
        updateTemplateDraftPreview('language', event.target.value)
      }
    />

    <select
      name="category"
      value={templateDraftPreview.category}
      onChange={(event) =>
        updateTemplateDraftPreview('category', event.target.value)
      }
    >
      <option value="UTILITY">Utility</option>
      <option value="MARKETING">Marketing</option>
      <option value="AUTHENTICATION">Authentication</option>
    </select>

    <select
      name="headerType"
      value={templateDraftPreview.headerType}
      onChange={(event) => {
        const nextHeaderType = event.target.value

        updateTemplateDraftPreview('headerType', nextHeaderType)

        if (nextHeaderType !== 'TEXT') {
          updateTemplateDraftPreview('headerText', '')
        }

        if (!templateNeedsHeaderMedia(nextHeaderType)) {
          setTemplateHeaderSampleFile(null)

          if (templateHeaderSamplePreview) {
            URL.revokeObjectURL(templateHeaderSamplePreview)
          }

          setTemplateHeaderSamplePreview('')
        }
      }}
    >
      <option value="">No header</option>
      <option value="TEXT">Text header</option>
      <option value="IMAGE">Image header</option>
      <option value="VIDEO">Video header</option>
      <option value="DOCUMENT">Document header</option>
    </select>

    {templateDraftPreview.headerType === 'TEXT' ? (
      <input
        name="headerText"
        value={templateDraftPreview.headerText}
        placeholder="Header text"
        onChange={(event) =>
          updateTemplateDraftPreview('headerText', event.target.value)
        }
      />
    ) : (
      <input name="headerText" type="hidden" value="" />
    )}

{templateBuilderButtons.some((button) => button.type === 'OTP') &&
templateDraftPreview.category !== 'AUTHENTICATION' ? (
  <div className="template-warning-box">
    OTP buttons require category AUTHENTICATION.
  </div>
) : null}

{carouselBuilderEnabled ? (
  <div className="template-warning-box">
    Carousel mode is on. Normal buttons are disabled for carousel templates.
  </div>
) : null}

{templateBuilderButtons.some((button) => button.type === 'FLOW') ? (
  <div className="template-warning-box">
    {metaFlows.length > 0
      ? 'Select a Meta Flow from dropdown. Use only published Flow for production.'
      : 'No Meta Flows found. Create/publish Flow in Meta, then refresh this page, or paste Flow ID manually.'}
  </div>
) : null}

    {templateNeedsHeaderMedia(templateDraftPreview.headerType) ? (
      <label className="template-create-media-picker">
        <strong>
          {templateHeaderSampleFile
            ? templateHeaderSampleFile.name
            : `Upload ${templateDraftPreview.headerType.toLowerCase()} sample`}
        </strong>
        <span>
          This sample will be uploaded to Meta with the draft template.
        </span>
        <input
          accept={getHeaderMediaAccept(templateDraftPreview.headerType)}
          type="file"
          onChange={handleCreateTemplateHeaderFileChange}
        />
      </label>
    ) : null}

    <textarea
      name="bodyText"
      value={templateDraftPreview.bodyText}
      placeholder="Body e.g. Hello {{1}}, your order {{2}} is ready."
      rows={5}
      onChange={(event) =>
        updateTemplateDraftPreview('bodyText', event.target.value)
      }
    />

    <input
      name="footerText"
      value={templateDraftPreview.footerText}
      placeholder="Footer optional"
      onChange={(event) =>
        updateTemplateDraftPreview('footerText', event.target.value)
      }
    />

<div className="template-builder-panel">
<div className="template-builder-header">
 <div>
   <strong>Buttons</strong>
   <span>Add quick reply, website, phone, OTP, or Flow buttons without JSON.</span>
 </div>

<button
  type="button"
  disabled={carouselBuilderEnabled}
  onClick={addTemplateBuilderButton}
>
  Add Button
</button>
</div>

{templateBuilderButtons.length === 0 ? (
 <div className="empty-state">
   <strong>No buttons added</strong>
   <span>This template will be created without buttons.</span>
 </div>
) : (
 <div className="template-builder-list">
   {templateBuilderButtons.map((button, index) => (
     <div className="template-builder-item" key={button.id}>
       <div className="template-builder-item-header">
         <strong>Button {index + 1}</strong>
         <button
           className="small-danger-button"
           type="button"
           onClick={() => removeTemplateBuilderButton(button.id)}
         >
           Remove
         </button>
       </div>

       <select
         value={button.type}
         onChange={(event) =>
           updateTemplateBuilderButton(button.id, 'type', event.target.value)
         }
       >
         <option value="QUICK_REPLY">Quick reply</option>
         <option value="URL">Website URL</option>
         <option value="PHONE_NUMBER">Phone call</option>
         <option value="OTP">Authentication OTP</option>
         <option value="FLOW">WhatsApp Flow</option>
       </select>

       {button.type !== 'OTP' ? (
         <input
           value={button.text}
           placeholder="Button text e.g. Track Order"
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'text', event.target.value)
           }
         />
       ) : null}

       {button.type === 'URL' ? (
         <input
           value={button.url}
           placeholder="https://example.com"
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'url', event.target.value)
           }
         />
       ) : null}

       {button.type === 'PHONE_NUMBER' ? (
         <input
           value={button.phoneNumber}
           placeholder="+919999999999"
           onChange={(event) =>
             updateTemplateBuilderButton(
               button.id,
               'phoneNumber',
               event.target.value,
             )
           }
         />
       ) : null}

       {button.type === 'OTP' ? (
         <select
           value={button.otpType}
           onChange={(event) =>
             updateTemplateBuilderButton(button.id, 'otpType', event.target.value)
           }
         >
           <option value="COPY_CODE">Copy code</option>
           <option value="ONE_TAP">One tap autofill</option>
           <option value="ZERO_TAP">Zero tap autofill</option>
         </select>
       ) : null}

       {button.type === 'FLOW' ? (
         <>
<select
  value={button.flowId}
  onChange={(event) =>
    updateTemplateBuilderButton(button.id, 'flowId', event.target.value)
  }
>
  <option value="">Select Meta Flow</option>
  {metaFlows
    .filter((flow) => flow.status === 'PUBLISHED' || flow.status === 'DRAFT')
    .map((flow) => (
      <option key={flow.id} value={flow.id}>
        {flow.name || flow.id} · {flow.status}
      </option>
    ))}
</select>

<input
  value={button.flowId}
  placeholder="Or paste Meta Flow ID manually"
  onChange={(event) =>
    updateTemplateBuilderButton(button.id, 'flowId', event.target.value)
  }
/>

           <select
             value={button.flowAction}
             onChange={(event) =>
               updateTemplateBuilderButton(
                 button.id,
                 'flowAction',
                 event.target.value,
               )
             }
           >
             <option value="NAVIGATE">Navigate</option>
             <option value="DATA_EXCHANGE">Data exchange</option>
           </select>

           <input
             value={button.navigateScreen}
             placeholder="Navigate screen optional"
             onChange={(event) =>
               updateTemplateBuilderButton(
                 button.id,
                 'navigateScreen',
                 event.target.value,
               )
             }
           />
         </>
       ) : null}
     </div>
   ))}
 </div>
)}
</div>

<div className="template-builder-panel">
  <div className="template-builder-header">
    <div>
      <strong>Carousel</strong>
      <span>Create 2 to 5 carousel cards without JSON.</span>
    </div>

    <button
      type="button"
      onClick={() => {
  if (!carouselBuilderEnabled && templateBuilderButtons.length > 0) {
    showToast('Remove normal buttons before enabling carousel', 'error')
    return
  }

  setCarouselBuilderEnabled(!carouselBuilderEnabled)
}}
    >
      {carouselBuilderEnabled ? 'Disable Carousel' : 'Enable Carousel'}
    </button>
  </div>

  {carouselBuilderEnabled ? (
    <div className="template-builder-list">
      <button type="button" onClick={addCarouselCard}>
        Add Carousel Card
      </button>

      {carouselBuilderCards.map((card, cardIndex) => (
        <div className="template-builder-item" key={card.id}>
          <div className="template-builder-item-header">
            <strong>Card {cardIndex + 1}</strong>
            <button
              className="small-danger-button"
              type="button"
              onClick={() => removeCarouselCard(card.id)}
            >
              Remove Card
            </button>
          </div>

          <label className="template-create-media-picker">
            <strong>
              {card.uploading
                ? 'Uploading to Meta...'
                : card.mediaFileName || 'Upload card image/video'}
            </strong>
            <span>Required for Meta carousel review.</span>
            <input
              accept="image/jpeg,image/png,image/webp,video/mp4"
              type="file"
              onChange={(event) =>
                uploadCarouselCardMedia(card.id, event.target.files?.[0])
              }
            />
          </label>

          <textarea
            value={card.bodyText}
            placeholder="Card body text e.g. Product option 1"
            rows={3}
            onChange={(event) =>
              updateCarouselCard(card.id, 'bodyText', event.target.value)
            }
          />

          <button
            type="button"
            onClick={() => addCarouselCardButton(card.id)}
          >
            Add Card Button
          </button>

          {card.buttons.map((button, buttonIndex) => (
            <div className="carousel-button-row" key={button.id}>
              <strong>Card Button {buttonIndex + 1}</strong>

              <select
                value={button.type}
                onChange={(event) =>
                  updateCarouselCardButton(
                    card.id,
                    button.id,
                    'type',
                    event.target.value as CarouselButtonType,
                  )
                }
              >
                <option value="QUICK_REPLY">Quick reply</option>
                <option value="URL">Website URL</option>
                <option value="PHONE_NUMBER">Phone call</option>
              </select>

              <input
                value={button.text}
                placeholder="Button text"
                onChange={(event) =>
                  updateCarouselCardButton(
                    card.id,
                    button.id,
                    'text',
                    event.target.value,
                  )
                }
              />

              {button.type === 'URL' ? (
                <input
                  value={button.url}
                  placeholder="https://example.com"
                  onChange={(event) =>
                    updateCarouselCardButton(
                      card.id,
                      button.id,
                      'url',
                      event.target.value,
                    )
                  }
                />
              ) : null}

              {button.type === 'PHONE_NUMBER' ? (
                <input
                  value={button.phoneNumber}
                  placeholder="+919999999999"
                  onChange={(event) =>
                    updateCarouselCardButton(
                      card.id,
                      button.id,
                      'phoneNumber',
                      event.target.value,
                    )
                  }
                />
              ) : null}

              <button
                className="small-danger-button"
                type="button"
                onClick={() => removeCarouselCardButton(card.id, button.id)}
              >
                Remove Button
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : null}
</div>

    <button>Create Meta Draft</button>
  </form>

  <aside className="whatsapp-template-preview">
    <div className="phone-preview-shell">
      <div className="phone-preview-header">WhatsApp preview</div>

      <div className="phone-message-bubble">
        {templateDraftPreview.headerType === 'TEXT' &&
        templateDraftPreview.headerText ? (
          <strong className="phone-message-title">
            {templateDraftPreview.headerText}
          </strong>
        ) : null}

        {templateDraftPreview.headerType === 'IMAGE' ? (
          templateHeaderSamplePreview ? (
            <img
              alt="Template image preview"
              className="phone-media-preview"
              src={templateHeaderSamplePreview}
            />
          ) : (
            <div className="phone-media-placeholder">Image header</div>
          )
        ) : null}

        {templateDraftPreview.headerType === 'VIDEO' ? (
          templateHeaderSamplePreview ? (
            <video
              className="phone-media-preview"
              controls
              src={templateHeaderSamplePreview}
            />
          ) : (
            <div className="phone-media-placeholder">Video header</div>
          )
        ) : null}

        {templateDraftPreview.headerType === 'DOCUMENT' ? (
          <div className="phone-document-preview">
            📄 {templateHeaderSampleFile?.name || 'Document header'}
          </div>
        ) : null}

        <p>
          {templateDraftPreview.bodyText ||
            'Your template body preview will appear here.'}
        </p>

        {templateDraftPreview.footerText ? (
          <span className="phone-message-footer">
            {templateDraftPreview.footerText}
          </span>
        ) : null}

{carouselBuilderEnabled ? (
<div className="phone-carousel-preview">
 <strong>Carousel template</strong>
 <span>2 to 5 cards from carousel builder</span>
</div>
) : templateBuilderButtons.length > 0 ? (
<div className="phone-message-buttons-list">
 {templateBuilderButtons.map((button) => (
   <button
     type="button"
     className="phone-message-button"
     key={button.id}
   >
     {button.type === 'OTP' ? 'Copy code' : button.text || 'Button text'}
   </button>
 ))}
</div>
) : null}

        <small>10:24</small>
      </div>
    </div>
  </aside>
</div>
        </section>
      ) : null}
    </div>
  )
}

  function renderContactsContent() {
    return (
      <div className="content-card contacts-workspace">
        <div className="contacts-topbar">
          <div>
            <h2>Contacts CRM</h2>
            <p>Manage contacts, consent, tags, and contact types.</p>
          </div>

          <span className="status-pill">{filteredContacts.length} contacts shown</span>
        </div>

        <div className="contacts-tabs">
          <button
            className={contactsTab === 'list' ? 'active' : ''}
            type="button"
            onClick={() => setContactsTab('list')}
          >
            Contact List
          </button>
          <button
            className={contactsTab === 'add' ? 'active' : ''}
            type="button"
            onClick={() => setContactsTab('add')}
          >
            Add Contact
          </button>
          <button
            className={contactsTab === 'types' ? 'active' : ''}
            type="button"
            onClick={() => setContactsTab('types')}
          >
            Contact Types
          </button>
          <button
            className={contactsTab === 'import' ? 'active' : ''}
            type="button"
            onClick={() => setContactsTab('import')}
          >
            Import / Export
          </button>
        </div>

        {contactsTab === 'list' ? (
          <>
            <section className="sub-card">
              <div className="section-heading">
                <div>
                  <h3>Contact List</h3>
                  <p>Recently added contacts show first by default.</p>
                </div>
              </div>

              <div className="contacts-filter-grid">
                <input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Search name, phone, or email"
                />

                <select
                  value={contactTypeFilter}
                  onChange={(event) => setContactTypeFilter(event.target.value)}
                >
                  <option value="all">All contact types</option>
                  {contactTypes.map((contactType) => (
                    <option key={contactType.id} value={contactType.id}>
                      {contactType.name}
                    </option>
                  ))}
                </select>

                <select
                  value={consentFilter}
                  onChange={(event) => setConsentFilter(event.target.value as ConsentFilter)}
                >
                  <option value="all">All consent status</option>
                  <option value="optedIn">Opted in</option>
                  <option value="notOptedIn">Not opted in</option>
                </select>

                <select
                  value={contactSort}
                  onChange={(event) => setContactSort(event.target.value as ContactSort)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="nameAsc">Name A-Z</option>
                  <option value="nameDesc">Name Z-A</option>
                </select>
              </div>
            </section>

            <div className="contacts-list">
              {filteredContacts.length === 0 ? (
                <div className="empty-state">
                  <strong>No contacts found</strong>
                  <span>Add a contact or change your filters.</span>
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <article className="contact-card" key={contact.id}>
                    <div className="contact-main">
                      <strong>{contact.name}</strong>
                      <span>{contact.phone}</span>
                    </div>

                    <div className="contact-meta">
                      <span>{contact.email || 'No email'}</span>
                      <span>{contact.tags.length ? contact.tags.join(', ') : 'No tags'}</span>
                    </div>

                    <div className="contact-type-pill">
                      {contact.contactType ? (
                        <>
                          <span
                            className="type-dot"
                            style={{
                              background: contact.contactType.color || '#0f8f78',
                            }}
                          />
                          {contact.contactType.name}
                        </>
                      ) : (
                        'No type'
                      )}
                    </div>

                    <div className="consent-box">
                      {contact.optedIn ? (
                        <span>Opted in: {contact.optInSource || '-'}</span>
                      ) : (
                        <span>Not opted in</span>
                      )}
                    </div>

                    <div className="contact-actions">
                      {contact.optedIn ? (
                        <button
                          className="small-danger-button"
                          type="button"
                          onClick={() => optOutContact(contact.id)}
                        >
                          Opt out
                        </button>
                      ) : (
                        <button
                          className="small-success-button"
                          type="button"
                          onClick={() => optInContact(contact.id)}
                        >
                          Opt in
                        </button>
                      )}

                      <button
                        className="small-secondary-button"
                        type="button"
                        onClick={() => setEditingContact(contact)}
                      >
                        Edit
                      </button>

                      <button
                        className="small-danger-button"
                        type="button"
                        onClick={() => deleteContact(contact.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        ) : null}

        {contactsTab === 'add' ? (
          <section className="sub-card">
            <div className="section-heading">
              <div>
                <h3>Add Contact</h3>
                <p>New contacts are campaign-safe only when opt-in proof is added.</p>
              </div>
            </div>

            <form className="contact-form professional-form" onSubmit={handleCreateContact}>
              <input name="name" placeholder="Name" />
              <input name="phone" placeholder="Phone with country code" />
              <input name="email" placeholder="Email optional" />
              <input name="tags" placeholder="Tags e.g. lead, customer" />

              <select name="contactTypeId" defaultValue="">
                <option value="">No type</option>
                {contactTypes.map((contactType) => (
                  <option key={contactType.id} value={contactType.id}>
                    {contactType.name}
                  </option>
                ))}
              </select>

              <input name="optInSource" placeholder="Opt-in source e.g. website form" />

              <label className="checkbox-field">
                <input name="optedIn" type="checkbox" />
                Customer gave WhatsApp opt-in
              </label>

              <button>Add Contact</button>
            </form>
          </section>
        ) : null}

        {contactsTab === 'types' ? (
          <section className="sub-card">
            <div className="section-heading">
              <div>
                <h3>Contact Types</h3>
                <p>Examples: Customer, Supplier, Vendor, Lead.</p>
              </div>
            </div>

            <form className="type-form" onSubmit={handleCreateContactType}>
              <input name="name" placeholder="Type name e.g. Customer" />
              <input name="color" type="color" defaultValue="#0f8f78" />
              <button>Add Type</button>
            </form>

            <div className="chip-list">
              {contactTypes.length === 0 ? (
                <p>No contact types yet.</p>
              ) : (
                contactTypes.map((contactType) => (
                  <span className="type-chip" key={contactType.id}>
                    <span
                      className="type-dot"
                      style={{ background: contactType.color || '#0f8f78' }}
                    />
                    {contactType.name}
                    <button
                      type="button"
                      onClick={() => deleteContactType(contactType.id)}
                    >
                      Delete
                    </button>
                  </span>
                ))
              )}
            </div>
          </section>
        ) : null}

        {contactsTab === 'import' ? (
          <section className="sub-card">
            <div className="section-heading">
              <div>
                <h3>Import / Export</h3>
                <p>Use CSV for bulk contact movement. Max 1000 rows per import.</p>
              </div>
            </div>

            <div className="import-export-bar">
              <button type="button" onClick={downloadSampleContactsCsv}>
                Download Sample CSV
              </button>

              <label>
                Import CSV
                <input accept=".csv" type="file" onChange={importContactsCsv} />
              </label>

              <button type="button" onClick={exportContactsCsv}>
                Export Contacts
              </button>
            </div>
          </section>
        ) : null}

        {editingContact ? (
          <div className="modal-backdrop">
            <div className="modal-card">
              <div className="modal-header">
                <div>
                  <h3>Edit Contact</h3>
                  <p>Update contact details in one place.</p>
                </div>
                <button type="button" onClick={() => setEditingContact(null)}>
                  ×
                </button>
              </div>

              <form className="contact-form modal-form" onSubmit={handleUpdateContact}>
                <input name="name" defaultValue={editingContact.name} placeholder="Name" />
                <input
                  name="phone"
                  defaultValue={editingContact.phone}
                  placeholder="Phone with country code"
                />
                <input
                  name="email"
                  defaultValue={editingContact.email || ''}
                  placeholder="Email optional"
                />
                <input
                  name="tags"
                  defaultValue={editingContact.tags.join(', ')}
                  placeholder="Tags e.g. lead, customer"
                />

                <select
                  name="contactTypeId"
                  defaultValue={editingContact.contactTypeId || ''}
                >
                  <option value="">No type</option>
                  {contactTypes.map((contactType) => (
                    <option key={contactType.id} value={contactType.id}>
                      {contactType.name}
                    </option>
                  ))}
                </select>

                <div className="modal-actions">
                  <button type="button" onClick={() => setEditingContact(null)}>
                    Cancel
                  </button>
                  <button type="submit">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

if (auth) {
  return (
    <main className="dashboard-shell">
      {toast ? <div className={`toast-popup ${toastType}`}>{toast}</div> : null}

      {actionAlert ? (
        <div className="action-alert-backdrop" key={actionAlert.id}>
          <div className={`action-alert-card ${actionAlert.type}`}>
            <strong>{actionAlert.title}</strong>
            <p>{actionAlert.message}</p>
            <button type="button" onClick={() => setActionAlert(null)}>
              OK
            </button>
          </div>
        </div>
      ) : null}

        <aside className="sidebar">
          <div>
            <p className="sidebar-label">Workspace</p>
            <h2>{auth.tenant.name}</h2>
          </div>

          <nav className="sidebar-nav">
            {modules.map((module) => (
              <button
                key={module}
                className={activeModule === module ? 'active' : ''}
                onClick={() => setActiveModule(module)}
              >
                {module}
              </button>
            ))}
          </nav>

          <button className="logout-button" onClick={handleLogout} disabled={loading}>
            Logout
          </button>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">WhatsApp SaaS Platform</p>
              <h1>{activeModule}</h1>
            </div>

            <div className="user-pill">
              {auth.user.name}
              <span>{auth.user.role}</span>
            </div>
          </header>
          {auth.impersonation?.active ? (
  <div className="status-card error">
    <strong>Impersonation mode active</strong>
    <span>
      You are viewing tenant workspace as a platform admin. This session is
      audited and expires at{' '}
      {auth.impersonation.expiresAt
        ? new Date(auth.impersonation.expiresAt).toLocaleString()
        : 'the configured expiry time'}
      .
    </span>
    <button type="button" disabled={loading} onClick={stopImpersonation}>
      Exit impersonation
    </button>
  </div>
) : null}

                 {!auth.user.emailVerifiedAt ? (
         <div className="status-card warning">
           <strong>Email not verified</strong>
           <span>Please verify your email before production use.</span>
           <button
             type="button"
             disabled={loading}
             onClick={resendVerificationEmail}
           >
             Resend Verification Email
           </button>
         </div>
       ) : null}

{activeModule === 'Contacts' ? (
  renderContactsContent()
) : activeModule === 'Templates' ? (
  renderTemplatesContent()
) : activeModule === 'Campaigns' ? (
  <CampaignsPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Billing' ? (
  <BillingPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Security' ? (
<SecurityPage
  apiUrl={API_URL}
  currentUser={auth.user}
  showToast={showToast}
  onSecurityChanged={loadMe}
/>
) : activeModule === 'Team Users' ? (
<TeamUsersPage
 apiUrl={API_URL}
 currentUser={auth.user}
 showToast={showToast}
/>
) : activeModule === 'Audit Logs' ? (
<AuditLogsPage apiUrl={API_URL} showToast={showToast} />
) : activeModule === 'Settings' ? (
  renderSettingsContent()
) : (
  <div className="content-card">
    <h2>{activeModule}</h2>
    <p>
      This is the starting screen for {activeModule}. Next we will connect
      this module to real backend data.
    </p>
  </div>
)}
        </section>
      </main>
    )
  }

return (
  <main className="app-page">
    {toast ? <div className={`toast-popup ${toastType}`}>{toast}</div> : null}

    {actionAlert ? (
      <div className="action-alert-backdrop" key={actionAlert.id}>
        <div className={`action-alert-card ${actionAlert.type}`}>
          <strong>{actionAlert.title}</strong>
          <p>{actionAlert.message}</p>
          <button type="button" onClick={() => setActionAlert(null)}>
            OK
          </button>
        </div>
      </div>
    ) : null}

      <section className="hero-card">
        <p className="eyebrow">Official Meta WhatsApp Cloud API SaaS</p>
        <h1>WhatsApp SaaS Platform</h1>
        <p className="hero-text">
          Frontend is connected to NestJS auth using HttpOnly cookie login.
        </p>

        <div className="status-card error">
          <strong>Auth Status</strong>
          <span>{message}</span>
        </div>

        <div className="form-grid">
          <form className="auth-form" onSubmit={handleRegister}>
            <h2>Register Business</h2>
            <input name="businessName" placeholder="Business name" />
            <input name="slug" placeholder="Business slug" />
            <input name="name" placeholder="Your name" />
            <input name="email" placeholder="Email" />
            <input name="password" placeholder="Password" type="password" />
            <button disabled={loading}>Create Account</button>
          </form>

       {authMode === 'reset' ? (
         <form className="auth-form" onSubmit={handleResetPassword}>
           <h2>Reset Password</h2>
           <input
             name="password"
             placeholder="New password"
             type="password"
           />
           <button disabled={loading || !resetToken}>Reset Password</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => {
               setAuthMode('login')
               setResetToken('')
               window.history.replaceState(
                 {},
                 document.title,
                 window.location.pathname,
               )
             }}
           >
             Back to Login
           </button>
         </form>
       ) : authMode === 'twoFactor' ? (

<form className="auth-form" onSubmit={handleTwoFactorLogin}>
  <h2>Two-Factor Login</h2>

  <label className="two-factor-code-field">
    <span>Authenticator or backup code</span>
    <input
      name="twoFactorCode"
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="Example: 123456"
      value={twoFactorCode}
      onChange={(event) => setTwoFactorCode(event.target.value)}
      required
    />
    <small>
      Open Google Authenticator/Authy/Microsoft Authenticator and enter the latest 6-digit code.
    </small>
  </label>

  <label className="trusted-device-option">
    <input name="trustDevice" type="checkbox" defaultChecked />
    <span>Trust this device for 30 days</span>
  </label>

  <button disabled={loading || !twoFactorToken || !twoFactorCode.trim()}>
    Verify and Login
  </button>

  <button
    type="button"
    disabled={loading}
    onClick={() => {
      setTwoFactorToken('')
      setTwoFactorCode('')
      setAuthMode('login')
    }}
  >
    Back to Login
  </button>
</form>
       ) : authMode === 'forgot' ? (
         <form className="auth-form" onSubmit={handleForgotPassword}>
           <h2>Forgot Password</h2>
           <input name="email" placeholder="Email" />
           <button disabled={loading}>Send Reset Link</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => setAuthMode('login')}
           >
             Back to Login
           </button>
         </form>
       ) : (
         <form className="auth-form" onSubmit={handleLogin}>
           <h2>Login</h2>
           <input name="email" placeholder="Email" />
           <input name="password" placeholder="Password" type="password" />
           <button disabled={loading}>Login</button>
           <button
             type="button"
             disabled={loading}
             onClick={() => setAuthMode('forgot')}
           >
             Forgot Password?
           </button>
         </form>
       )}
        </div>
      </section>
    </main>
  )
}

export default App