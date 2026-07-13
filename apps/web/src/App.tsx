import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'
import { CampaignsPage } from './modules/campaigns/CampaignsPage'
import { BillingPage } from './modules/billing/BillingPage'
import { SecurityPage } from './modules/security/SecurityPage'
import { AuditLogsPage } from './modules/audit-logs/AuditLogsPage'
import { TeamUsersPage } from './modules/team-users/TeamUsersPage'
import { SettingsPage } from './modules/settings/SettingsPage'
import { TemplatesPage } from './modules/templates/TemplatesPage'

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

type ContactsTab = 'list' | 'add' | 'types' | 'import'
type ContactSort = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc'
type ConsentFilter = 'all' | 'optedIn' | 'notOptedIn'

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
const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null)

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


    if (auth && activeModule === 'Settings') {
      void loadMetaConnection()
    }
  }, 0)

  return () => window.clearTimeout(timer)
}, [auth, activeModule])

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
 try {
   const response = await fetch(`${API_URL}/contacts/export.csv`, {
     credentials: 'include',
   })

   if (!response.ok) {
     throw new Error(await readApiError(response, 'Failed to export contacts'))
   }

   const blob = await response.blob()
   const url = window.URL.createObjectURL(blob)
   const link = document.createElement('a')

   link.href = url
   link.download = 'contacts-export.csv'
   link.click()

   window.URL.revokeObjectURL(url)
   showToast('Contacts exported successfully', 'success')
 } catch (error) {
   showToast(
     error instanceof Error ? error.message : 'Failed to export contacts',
     'error',
   )
 }
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
  <TemplatesPage apiUrl={API_URL} showToast={showToast} />
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
  <SettingsPage
    apiUrl={API_URL}
    metaConnection={metaConnection}
    showToast={showToast}
    onGoToBilling={() => setActiveModule('Billing')}
  />
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
