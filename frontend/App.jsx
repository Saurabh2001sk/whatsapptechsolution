import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  BarChart3,
  Activity,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  Sparkles,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LogOut,
  MessageCircle,
  PackageCheck,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')
const isProduction = import.meta.env.PROD
const api = axios.create({ baseURL: apiBaseUrl })

function formatApiIssue(error) {
  const status = error.response?.status
  const method = String(error.config?.method || 'GET').toUpperCase()
  const requestUrl = error.config?.url || 'unknown endpoint'
  const backendMessage = error.response?.data?.error || error.response?.data?.message
  const message = backendMessage || error.message || 'Unknown frontend/API issue'

  return status
    ? `${method} ${requestUrl} failed (${status}): ${message}`
    : `${method} ${requestUrl} failed: ${message}`
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''

    window.dispatchEvent(new CustomEvent('bos-api-error', {
      detail: { message: formatApiIssue(error) },
    }))

    if (status === 401 && !requestUrl.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('bos-auth-expired'))
    }

    return Promise.reject(error)
  },
)

function mediaSrc(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${apiBaseUrl}${url}`
}

function ProtectedImage({ url, alt }) {
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

function ProtectedMediaLink({ url, children, className }) {
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

const defaultAppSettings = {
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
}

function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : value || ''
}

function fromCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsv(text) {
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

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename, headers, sample) {
  const csv = [headers, sample].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function setAuth(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
  else delete api.defaults.headers.common.Authorization
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C'
}

function clearStoredSession() {
  localStorage.removeItem('bosToken')
  localStorage.removeItem('bosUser')
  setAuth(null)
}

function Login({ onLogin, appSettings }) {
const [form, setForm] = useState({ email: '', password: '' })
const [error, setError] = useState('')
const [submitting, setSubmitting] = useState(false)

async function submit(event) {
  event.preventDefault()
  if (submitting) return

  setError('')
  setSubmitting(true)

  try {
    const res = await api.post('/api/auth/login', {
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })

    localStorage.setItem('bosToken', res.data.token)
    localStorage.setItem('bosUser', JSON.stringify(res.data.user))
    setAuth(res.data.token)
    onLogin(res.data.user)
  } catch (err) {
    setError(err.response?.data?.error || 'Login failed')
  } finally {
    setSubmitting(false)
  }
}

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <MessageCircle size={34} />
          <div>
            <h1>{appSettings.appName}</h1>
            <span>{appSettings.companyName} - {appSettings.industry}</span>
          </div>
        </div>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={submitting}>
  {submitting ? 'Logging in...' : 'Login'}
</button>
        <small>Use your assigned CRM credentials.</small>
      </form>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
const [authChecking, setAuthChecking] = useState(() => Boolean(localStorage.getItem('bosToken')))
  const [activePage, setActivePage] = useState('inbox')
  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [managedTemplates, setManagedTemplates] = useState([])
  const emptyTemplate = { name: '', language: 'en', body: '', active: true }
  const [templateForm, setTemplateForm] = useState(emptyTemplate)
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [drafts, setDrafts] = useState([])
  const [products, setProducts] = useState([])
  const [quotations, setQuotations] = useState([])
  const [orders, setOrders] = useState([])
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [timeline, setTimeline] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [filter, setFilter] = useState('all')
  const [windowFilter, setWindowFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [sendError, setSendError] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', company: '', stage: 'new', notes: '', label: 'New Enquiry', assigned_to: '', assignment_reason: '' })
  const emptyUser = { name: '', email: '', password: '', role: 'sales' }
  const [newUser, setNewUser] = useState(emptyUser)
  const [editingUserId, setEditingUserId] = useState('')
  const [simulator, setSimulator] = useState({ phone: '', name: '', message: 'Need quotation for round bar grade EN8 size 20mm qty 25 pcs' })
  const [testMessage, setTestMessage] = useState({ to: '', text: 'BOS WhatsApp CRM test message' })
  const [testResult, setTestResult] = useState('')
  const [quoteRates, setQuoteRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [appSettings, setAppSettings] = useState(defaultAppSettings)
  const [customForm, setCustomForm] = useState({
    ...defaultAppSettings,
    labelsText: toCsv(defaultAppSettings.labels),
    stagesText: toCsv(defaultAppSettings.stages),
    handoffKeywordsText: toCsv(defaultAppSettings.handoffKeywords),
    inventoryFieldsText: toCsv(defaultAppSettings.inventoryFields),
  })
  const [settingsSaved, setSettingsSaved] = useState('')
  const [notice, setNotice] = useState(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const emptyProduct = { sku: '', name: '', category: '', grade: '', size: '', shape: '', unit: 'pcs', price: '', stock_qty: '', active: true }
  const [productForm, setProductForm] = useState(emptyProduct)
  const [editingProductId, setEditingProductId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [inventoryColumnsText, setInventoryColumnsText] = useState(toCsv(defaultAppSettings.inventoryFields))
  const [importResult, setImportResult] = useState('')

  const canMonitor = user?.role === 'admin' || user?.role === 'manager'
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || conversations[0], [conversations, selectedId])
  const labels = useMemo(() => ['all', ...(appSettings.labels || defaultAppSettings.labels)], [appSettings.labels])
  const stages = useMemo(() => appSettings.stages || defaultAppSettings.stages, [appSettings.stages])

  const pageItems = useMemo(() => {
    const common = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'inbox', label: 'Inbox', icon: Inbox },
      { id: 'new', label: 'Enquiries', icon: Bell },
      { id: 'sales', label: 'Pipeline', icon: Activity },
      { id: 'inventory', label: 'Inventory', icon: Boxes },
      { id: 'bot', label: 'Automation', icon: Sparkles },
      { id: 'quotes', label: 'Quotes', icon: ClipboardList },
      { id: 'orders', label: 'Orders', icon: ShoppingCart },
      { id: 'activeOrders', label: 'Active', icon: Clock3 },
    ]
    if (canMonitor) common.push({ id: 'settings', label: 'Settings', icon: Settings })
    if (canMonitor) common.push({ id: 'audit', label: 'Audit', icon: Shield })
    if (user?.role === 'admin') common.push({ id: 'users', label: 'Users', icon: Users })
    return common
  }, [canMonitor, user?.role])

 useEffect(() => {
  const storedToken = localStorage.getItem('bosToken')

  if (!storedToken) {
    clearStoredSession()
    return
  }

  setAuth(storedToken)

  api.get('/api/me')
    .then((res) => {
      localStorage.setItem('bosUser', JSON.stringify(res.data))
      setUser(res.data)
    })
    .catch(() => {
      clearStoredSession()
      setUser(null)
    })
    .finally(() => {
      setAuthChecking(false)
    })
}, [])

  useEffect(() => {
    api.get('/api/public/app-settings')
      .then((res) => setAppSettings({ ...defaultAppSettings, ...res.data }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--green', appSettings.primaryColor || defaultAppSettings.primaryColor)
    document.title = appSettings.appName || defaultAppSettings.appName
  }, [appSettings])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  function notify(text, type = 'success') {
    setNotice({ text, type })
    window.setTimeout(() => setNotice(null), 3200)
  }

  useEffect(() => {
    function showIssueToast(text) {
      setNotice({ text, type: 'error' })
      window.setTimeout(() => {
        setNotice((current) => (current?.text === text ? null : current))
      }, 8000)
    }

    function showApiIssue(event) {
      showIssueToast(event.detail?.message || 'Frontend/API issue detected')
    }

    function showFrontendIssue(event) {
      const location = event.filename ? ` (${event.filename}:${event.lineno || 0}:${event.colno || 0})` : ''
      showIssueToast(`Frontend error: ${event.message || 'Unknown browser error'}${location}`)
    }

    function showPromiseIssue(event) {
      const reason = event.reason
      const text = reason?.response || reason?.config
        ? formatApiIssue(reason)
        : reason?.message || String(reason || 'Unhandled promise rejection')
      showIssueToast(`Frontend promise error: ${text}`)
    }

    window.addEventListener('bos-api-error', showApiIssue)
    window.addEventListener('error', showFrontendIssue)
    window.addEventListener('unhandledrejection', showPromiseIssue)

    return () => {
      window.removeEventListener('bos-api-error', showApiIssue)
      window.removeEventListener('error', showFrontendIssue)
      window.removeEventListener('unhandledrejection', showPromiseIssue)
    }
  }, [])

  function apiErrorMessage(err, fallback) {
    return err.response?.data?.error || err.message || fallback
  }

  async function loadAll(overrides = {}) {
    if (!localStorage.getItem('bosToken')) return
    const requestFilter = overrides.filter ?? filter
    const requestWindowFilter = overrides.windowFilter ?? windowFilter
    const requestSearch = overrides.search ?? search
    const requestProductSearch = overrides.productSearch ?? productSearch
    setLoading(true)
    setLoadError('')
    try {
      const calls = [
        api.get('/api/settings/status'),
        api.get('/api/dashboard'),
        api.get('/api/conversations', { params: { label: requestFilter, q: requestSearch, window: requestWindowFilter } }),
        api.get('/api/templates'),
        api.get('/api/enquiry-drafts'),
        api.get('/api/products', { params: { q: requestProductSearch } }),
        api.get('/api/quotations'),
        api.get('/api/orders'),
        api.get('/api/app-settings').catch(() => ({ data: defaultAppSettings })),
      ]
      if (canMonitor) {
        calls.push(api.get('/api/users').catch(() => ({ data: [] })))
        calls.push(api.get('/api/whatsapp/config').catch(() => ({ data: null })))
        calls.push(api.get('/api/audit-events').catch(() => ({ data: [] })))
        calls.push(api.get('/api/templates/manage').catch(() => ({ data: [] })))
      }

      const [
        statusRes,
        dashRes,
        convoRes,
        templateRes,
        draftRes,
        productRes,
        quoteRes,
        orderRes,
        appSettingsRes,
        usersRes,
        whatsappConfigRes,
        auditRes,
        manageTemplateRes,
      ] = await Promise.all(calls)

      setStatus(statusRes.data)
      setDashboard(dashRes.data)
      setConversations(convoRes.data)

      // Composer should use only active templates.
      setTemplates(templateRes.data)

      // Settings page can use manageTemplateRes later if we separate state.

      setDrafts(draftRes.data)
      setProducts(productRes.data)
      setQuotations(quoteRes.data)
      setOrders(orderRes.data)
      const nextSettings = { ...defaultAppSettings, ...appSettingsRes.data }
      setAppSettings(nextSettings)
      setCustomForm({
        ...nextSettings,
        labelsText: toCsv(nextSettings.labels),
        stagesText: toCsv(nextSettings.stages),
        handoffKeywordsText: toCsv(nextSettings.handoffKeywords),
        inventoryFieldsText: toCsv(nextSettings.inventoryFields),
      })
      setInventoryColumnsText(toCsv(nextSettings.inventoryFields))
      if (usersRes) setUsers(usersRes.data)
      if (whatsappConfigRes) setWhatsappConfig(whatsappConfigRes.data)
      if (auditRes) setAuditEvents(auditRes.data)
      if (manageTemplateRes) setManagedTemplates(manageTemplateRes.data)
      if (!selectedId && convoRes.data[0]) setSelectedId(convoRes.data[0].id)
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Unable to load CRM data'
      setLoadError(message)
      if (err.response?.status === 401) {
        localStorage.removeItem('bosToken')
        localStorage.removeItem('bosUser')
        setAuth(null)
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(contactId, markRead = false) {
    if (!contactId) return
    if (markRead) await api.post(`/api/conversations/${contactId}/read`)
    const res = await api.get(`/api/conversations/${contactId}/messages`)
    setMessages(res.data)
  }

  useEffect(() => {
    // Data fetch is intentionally triggered by auth/filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filter, windowFilter])

  useEffect(() => {
    if (!selected?.id) return
    // Selection drives the editable profile form and read receipt state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSendError('')
    loadMessages(selected.id, true).then(() => loadAll())
    if (canMonitor) api.get(`/api/contacts/${selected.id}/assignment-history`).then((res) => setAssignmentHistory(res.data))
    api.get(`/api/contacts/${selected.id}/timeline`).then((res) => setTimeline(res.data)).catch(() => setTimeline([]))
    setLeadForm({
      name: selected.name || '',
      company: selected.company || '',
      stage: selected.stage || 'new',
      notes: selected.notes || '',
      label: selected.label || 'New Enquiry',
      assigned_to: selected.assigned_to || '',
      assignment_reason: '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

function logout() {
  localStorage.removeItem('bosToken')
  localStorage.removeItem('bosUser')
  setAuth(null)
  setUser(null)
  setSelectedId(null)
  setMessages([])
  setConversations([])
  setDashboard(null)
  setDraft('')
  setTemplateName('')
  setSendError('')
  setLoadError('')
}

useEffect(() => {
  window.addEventListener('bos-auth-expired', logout)
  return () => window.removeEventListener('bos-auth-expired', logout)
}, [])

useEffect(() => {
  if (!user?.id) return undefined

  const interval = window.setInterval(() => {
    loadAll({ filter, windowFilter, search })

    if (selectedId) {
      loadMessages(selectedId)
    }
  }, 10000)

  return () => window.clearInterval(interval)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.id, selectedId, filter, windowFilter, search])

if (authChecking) {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <MessageCircle size={34} />
          <div>
            <h1>{appSettings.appName}</h1>
            <span>Checking secure session...</span>
          </div>
        </div>
      </div>
    </main>
  )
}

if (!user) return <Login onLogin={setUser} appSettings={appSettings} />

function showPage(page, pageFilter = {}) {
  const monitorOnlyPages = ['settings', 'audit']
  const adminOnlyPages = ['users']

  if (monitorOnlyPages.includes(page) && !canMonitor) {
    notify('Manager/Admin access required', 'error')
    setActivePage('inbox')
    return
  }

  if (adminOnlyPages.includes(page) && user?.role !== 'admin') {
    notify('Admin access required', 'error')
    setActivePage('inbox')
    return
  }

  setActivePage(page)

  if (page === 'inbox') {
    const nextFilter = pageFilter.label || 'all'
    const nextWindowFilter = pageFilter.window || 'all'
    setFilter(nextFilter)
    setWindowFilter(nextWindowFilter)
    setStageFilter('all')
    setSearch('')
    loadAll({ filter: nextFilter, windowFilter: nextWindowFilter, search: '' })
  } else if (page === 'new') {
    setFilter('New Enquiry')
    setWindowFilter('all')
    setStageFilter('all')
    loadAll({ filter: 'New Enquiry', windowFilter: 'all' })
  } else if (page === 'sales') {
    setFilter('all')
    setWindowFilter('open')
    setStageFilter('all')
    loadAll({ filter: 'all', windowFilter: 'open' })
  } else {
    if (pageFilter.label) setFilter(pageFilter.label)
    if (pageFilter.window) setWindowFilter(pageFilter.window)
  }
}

async function sendMessage(event) {
  event.preventDefault()

  if (!selected || sendingMessage) return

  if (selected.opted_out) {
    setSendError('Customer has opted out. Do not send WhatsApp messages to this contact.')
    return
  }

  const cleanText = draft.trim()
  const selectedTemplate = templates.find((template) => template.name === templateName)

  setSendError('')

  if (!selected.reply_window_open && !templateName) {
    setSendError('24-hour reply window expired. Use an approved WhatsApp template.')
    return
  }

  const payload = templateName
    ? { templateName, language: selectedTemplate?.language || 'en' }
    : { text: cleanText }

  if (!payload.templateName && !payload.text) {
    setSendError('Message text required hai, ya template select karo.')
    return
  }

  setSendingMessage(true)

  try {
    await api.post(`/api/conversations/${selected.id}/messages`, payload)
    setDraft('')
    setTemplateName('')
    notify('Message queued/sent')
    await Promise.all([loadMessages(selected.id), loadAll()])
  } catch (err) {
    setSendError(apiErrorMessage(err, 'Message send failed'))
  } finally {
    setSendingMessage(false)
  }
}

  async function saveLead(event) {
    event.preventDefault()
    if (!selected) return
    await api.patch(`/api/contacts/${selected.id}`, leadForm)
    notify('Customer profile saved')
    await loadAll()
    if (canMonitor) {
      const res = await api.get(`/api/contacts/${selected.id}/assignment-history`)
      setAssignmentHistory(res.data)
    }
  }

async function simulateInbound(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  try {
    await api.post('/api/local/inbound-message', simulator)
    notify('Inbound message captured')
    setActivePage('inbox')
    setFilter('all')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Inbound simulator failed'), 'error')
  }
}

  async function createQuoteFromDraft(draftItem) {
    await api.post(`/api/enquiry-drafts/${draftItem.id}/create-quote`, {
      rate: Number(quoteRates[draftItem.id] || 0),
      notes: `Quote for ${draftItem.grade || ''} ${draftItem.size || ''} ${draftItem.quantity || ''}`.trim(),
    })
    setQuoteRates({ ...quoteRates, [draftItem.id]: '' })
    notify('Quotation created')
    await loadAll()
  }

  async function createErp(draftId) {
    await api.post(`/api/enquiry-drafts/${draftId}/create-erp`)
    notify('ERP enquiry marked')
    await loadAll()
  }

  async function updateQuote(quote, statusValue) {
    await api.patch(`/api/quotations/${quote.id}`, { status: statusValue })
    notify(`Quotation marked ${statusValue}`)
    await loadAll()
  }

  async function convertQuote(quote) {
    await api.post(`/api/quotations/${quote.id}/convert-order`)
    notify('Quotation converted to order')
    setActivePage('orders')
    await loadAll()
  }

  async function updateOrder(order, patch) {
    await api.patch(`/api/orders/${order.id}`, patch)
    notify('Order updated')
    await loadAll()
  }

  async function saveProduct(event) {
    event.preventDefault()
    const payload = {
      ...productForm,
      price: Number(productForm.price || 0),
      stock_qty: Number(productForm.stock_qty || 0),
    }
    try {
      if (editingProductId) await api.patch(`/api/products/${editingProductId}`, payload)
      else await api.post('/api/products', payload)
      notify(editingProductId ? 'Product updated' : 'Product added')
      setProductForm(emptyProduct)
      setEditingProductId('')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'Product save failed'), 'error')
    }
  }

  function editProduct(product) {
    setEditingProductId(product.id)
    setProductForm({
      sku: product.sku || '',
      name: product.name || '',
      category: product.category || '',
      grade: product.grade || '',
      size: product.size || '',
      shape: product.shape || '',
      unit: product.unit || 'pcs',
      price: product.price || '',
      stock_qty: product.stock_qty || '',
      active: product.active !== false,
    })
  }

  async function deleteProduct(product) {
    await api.delete(`/api/products/${product.id}`)
    notify('Product deleted')
    if (editingProductId === product.id) {
      setEditingProductId('')
      setProductForm(emptyProduct)
    }
    await loadAll()
  }

  async function importProducts(rows) {
    setImportResult('')
    const res = await api.post('/api/products/import', { rows })
    setImportResult(`Imported: ${res.data.inserted} new, ${res.data.updated} updated, ${res.data.skipped?.length || 0} skipped`)
    notify('Inventory import completed')
    await loadAll()
  }

  async function createUser(event) {
    event.preventDefault()
    try {
      if (editingUserId) {
        const payload = { name: newUser.name, role: newUser.role }
        if (newUser.password) payload.password = newUser.password
        await api.patch(`/api/users/${editingUserId}`, payload)
        notify('User updated')
      } else {
        await api.post('/api/users', newUser)
        notify('User created')
      }
      setNewUser(emptyUser)
      setEditingUserId('')
      await loadAll()
      return true
    } catch (err) {
      notify(apiErrorMessage(err, editingUserId ? 'User update failed' : 'User create failed'), 'error')
      return false
    }
  }

  function editUser(userItem) {
    setEditingUserId(userItem.id)
    setNewUser({
      name: userItem.name || '',
      email: userItem.email || '',
      password: '',
      role: userItem.role || 'sales',
    })
  }

  function cancelUserEdit() {
    setEditingUserId('')
    setNewUser(emptyUser)
  }

  async function toggleUser(userItem) {
    try {
      await api.patch(`/api/users/${userItem.id}`, { active: !userItem.active })
      notify('User status updated')
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'User status update failed'), 'error')
    }
  }

  async function deleteUser(userItem) {
    if (userItem.id === user.id) {
      notify('You cannot delete your own logged-in user', 'error')
      return
    }
    try {
      await api.delete(`/api/users/${userItem.id}`)
      notify('User deleted')
      if (editingUserId === userItem.id) cancelUserEdit()
      await loadAll()
    } catch (err) {
      notify(apiErrorMessage(err, 'User delete failed'), 'error')
    }
  }

  async function saveTemplate(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  const payload = {
    name: templateForm.name.trim().toLowerCase(),
    language: templateForm.language.trim() || 'en',
    body: templateForm.body.trim(),
    active: Boolean(templateForm.active),
  }

  if (!payload.name || !payload.body) {
    notify('Template name and body required', 'error')
    return
  }

  try {
    if (editingTemplateId) {
      await api.patch(`/api/templates/${editingTemplateId}`, payload)
      notify('Template updated')
    } else {
      await api.post('/api/templates', payload)
      notify('Template saved')
    }

    setTemplateForm(emptyTemplate)
    setEditingTemplateId('')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Template save failed'), 'error')
  }
}

function editTemplate(template) {
  setEditingTemplateId(template.id)
  setTemplateForm({
    name: template.name || '',
    language: template.language || 'en',
    body: template.body || '',
    active: template.active !== false,
  })
}

function cancelTemplateEdit() {
  setEditingTemplateId('')
  setTemplateForm(emptyTemplate)
}

async function toggleTemplate(template) {
  try {
    await api.patch(`/api/templates/${template.id}`, {
      name: template.name,
      language: template.language,
      body: template.body,
      active: !template.active,
    })

    notify(template.active ? 'Template deactivated' : 'Template activated')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Template update failed'), 'error')
  }
}

async function saveCustomization(event) {
  event.preventDefault()

  if (!canMonitor) {
    notify('Manager/Admin access required', 'error')
    return
  }

  setSettingsSaved('')

  const payload = {
    ...customForm,
    labels: fromCsv(customForm.labelsText),
    stages: fromCsv(customForm.stagesText),
    handoffKeywords: fromCsv(customForm.handoffKeywordsText),
    inventoryFields: fromCsv(customForm.inventoryFieldsText),
  }

  try {
    const res = await api.put('/api/app-settings', payload)
    const nextSettings = { ...defaultAppSettings, ...res.data }

    setAppSettings(nextSettings)
    setCustomForm({
      ...nextSettings,
      labelsText: toCsv(nextSettings.labels),
      stagesText: toCsv(nextSettings.stages),
      handoffKeywordsText: toCsv(nextSettings.handoffKeywords),
      inventoryFieldsText: toCsv(nextSettings.inventoryFields),
    })
    setSettingsSaved('Customization saved')
    notify('Customization saved')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Customization save failed'), 'error')
  }
}

  async function sendTestMessage(event) {
    event.preventDefault()
    setTestResult('')
    try {
      const res = await api.post('/api/whatsapp/test-message', testMessage)
      setTestResult(`Accepted by Meta. To: ${res.data.to}. Message ID: ${res.data.messageId || 'not returned'}`)
      notify('Test message accepted')
      setActivePage('inbox')
      setFilter('all')
      setWindowFilter('all')
      setSearch('')
      if (res.data.contactId) setSelectedId(res.data.contactId)
      await loadAll()
    } catch (err) {
      setTestResult(err.response?.data?.error || 'Test message failed')
    }
  }

  async function mapCurrentWhatsAppPhone() {
  if (user?.role !== 'admin') {
    notify('Admin access required', 'error')
    return
  }

  try {
    await api.post('/api/whatsapp/map-current-phone', {})
    notify('WhatsApp phone mapped to this company')
    await loadAll()
  } catch (err) {
    notify(apiErrorMessage(err, 'Phone mapping failed'), 'error')
  }
}

  async function downloadQuote(quote) {
    const res = await api.get(`/api/quotations/${quote.id}/print-text`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${quote.quote_no}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
    notify('Quotation file downloaded')
  }

  const newEnquiries = drafts.filter((item) => item.status === 'draft')
  const activeOrders = orders.filter((item) => item.status !== 'closed')
  const chatPages = activePage === 'inbox' || activePage === 'new' || activePage === 'sales'
  const lowStockProducts = products.filter((item) => item.active !== false && Number(item.stock_qty || 0) <= 5)
  const stageOptions = useMemo(() => ['all', ...stages], [stages])
  const visibleConversations = useMemo(() => {
    if (stageFilter === 'all') return conversations
    return conversations.filter((item) => String(item.stage || '').toLowerCase() === String(stageFilter).toLowerCase())
  }, [conversations, stageFilter])
  const chatMode = {
    inbox: {
      title: 'Inbox',
      kicker: 'All conversations',
      helper: 'Customer chats, owner, stage and reply window in one clean view.',
    },
    new: {
      title: 'New Enquiries',
      kicker: 'Fresh leads',
      helper: 'Only new customer enquiries that need qualification or assignment.',
    },
    sales: {
      title: 'Sales Pipeline',
      kicker: 'Follow-up queue',
      helper: 'Open-window conversations where sales action is pending.',
    },
  }[activePage] || {
    title: 'Inbox',
    kicker: 'All conversations',
    helper: 'Customer chats, owner, stage and reply window in one clean view.',
  }

  return (
    <main className={`app-shell ${chatPages ? '' : 'workspace-mode'}`}>
      {notice && <div className={`toast ${notice.type}`}>{notice.text}</div>}
      <aside className="nav-rail">
        <div className="rail-logo"><MessageCircle size={26} /></div>
        {pageItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} className={activePage === item.id ? 'active' : ''} type="button" onClick={() => showPage(item.id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
        <button className="logout-btn" type="button" onClick={logout}><LogOut size={20} /><span>Logout</span></button>
      </aside>

      <section className="module-panel">
        <div className="app-title inbox-title">
          <div>
            <h1>{appSettings.appName}</h1>
            <span>{appSettings.companyName} - {user.name} / {user.role}</span>
          </div>
          <button type="button" onClick={loadAll} disabled={loading}><RefreshCw size={17} /> Refresh</button>
        </div>
        {loadError && <div className="load-error">{loadError}</div>}

        {chatPages && (
          <>
            <div className={`chat-mode-head chat-mode-${activePage}`}>
              <div>
                <span>{chatMode.kicker}</span>
                <h2>{chatMode.title}</h2>
                <small>{visibleConversations.length} chats shown - {chatMode.helper}</small>
              </div>
            </div>
            <div className="filter-toolbar compact-filter">
              <div className="search-box"><Search size={17} /><input placeholder="Search customer, phone, company" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadAll() }} /></div>
              <div className="filter-row">
                <select value={filter} onChange={(e) => { const next = e.target.value; setFilter(next); loadAll({ filter: next }) }} aria-label="Enquiry type">{labels.map((label) => <option key={label} value={label}>{label === 'all' ? 'All enquiry types' : label}</option>)}</select>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} aria-label="Enquiry stage">{stageOptions.map((stage) => <option key={stage} value={stage}>{stage === 'all' ? 'All stages' : `Stage: ${stage}`}</option>)}</select>
                <select value={windowFilter} onChange={(e) => { const next = e.target.value; setWindowFilter(next); loadAll({ windowFilter: next }) }} aria-label="Reply window"><option value="all">All windows</option><option value="open">24h open</option><option value="expired">Expired</option></select>
              </div>
            </div>
            <ConversationList conversations={visibleConversations} selectedId={selected?.id} onSelect={setSelectedId} onReset={() => { setStageFilter('all'); showPage('inbox') }} />
          </>
        )}

        {activePage === 'dashboard' && <DashboardPage dashboard={dashboard} conversations={conversations} drafts={drafts} products={products} lowStockProducts={lowStockProducts} quotations={quotations} orders={orders} onOpenPage={showPage} />}
        {activePage === 'inventory' && <InventoryPage products={products} productForm={productForm} setProductForm={setProductForm} editingProductId={editingProductId} onSave={saveProduct} onEdit={editProduct} onDelete={deleteProduct} onCancel={() => { setEditingProductId(''); setProductForm(emptyProduct) }} productSearch={productSearch} setProductSearch={setProductSearch} onSearch={loadAll} canManage={canMonitor} currency={appSettings.currency} inventoryColumnsText={inventoryColumnsText} setInventoryColumnsText={setInventoryColumnsText} onImport={importProducts} importResult={importResult} />}
        {activePage === 'bot' && <BotStudioPage appSettings={appSettings} products={products} drafts={drafts} lowStockProducts={lowStockProducts} onOpenSettings={() => showPage('settings')} />}
        {activePage === 'quotes' && <QuotesPage quotations={quotations} onStatus={updateQuote} onConvert={convertQuote} onDownload={downloadQuote} />}
        {activePage === 'orders' && <OrdersPage orders={orders} onUpdate={updateOrder} />}
        {activePage === 'activeOrders' && <OrdersPage orders={activeOrders} onUpdate={updateOrder} title="Active Orders" />}
        {activePage === 'users' && user.role === 'admin' && <UsersPage users={users} newUser={newUser} setNewUser={setNewUser} editingUserId={editingUserId} onCreate={createUser} onEdit={editUser} onCancel={cancelUserEdit} onToggle={toggleUser} onDelete={deleteUser} />}
        {activePage === 'settings' && canMonitor && <SettingsPage status={status} whatsappConfig={whatsappConfig} testMessage={testMessage} setTestMessage={setTestMessage} testResult={testResult} onTest={sendTestMessage} onMapPhone={mapCurrentWhatsAppPhone} simulator={simulator} setSimulator={setSimulator} onSimulate={simulateInbound} customForm={customForm} setCustomForm={setCustomForm} onSaveCustomization={saveCustomization} settingsSaved={settingsSaved} templates={managedTemplates} templateForm={templateForm} setTemplateForm={setTemplateForm} editingTemplateId={editingTemplateId} onSaveTemplate={saveTemplate} onEditTemplate={editTemplate} onToggleTemplate={toggleTemplate} onCancelTemplateEdit={cancelTemplateEdit} userRole={user.role} isProduction={isProduction} />}
        {activePage === 'audit' && canMonitor && <AuditPage events={auditEvents} />}
        {!chatPages && activePage !== 'dashboard' && activePage !== 'inventory' && activePage !== 'bot' && activePage !== 'quotes' && activePage !== 'orders' && activePage !== 'activeOrders' && activePage !== 'users' && activePage !== 'settings' && activePage !== 'audit' && (
          <DraftsPanel drafts={drafts} quoteRates={quoteRates} setQuoteRates={setQuoteRates} onQuote={createQuoteFromDraft} onErp={createErp} />
        )}
      </section>

      {chatPages && (
        <>
          <section className="chat-shell">
            <ChatHeader selected={selected} onProfile={() => setProfileOpen(true)} currentTime={currentTime} />
            <div className="message-list">
           {messages.map((message) => (
  <div className={`message ${message.direction}`} key={message.id}>
    <b>{message.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</b>

    {message.type === 'image' && message.media_url ? (
      <div className="media-message">
       <ProtectedImage url={message.media_url} alt={message.caption || 'WhatsApp image'} />
        {(message.caption || message.body) && <span>{message.caption || message.body}</span>}
      </div>
    ) : message.type === 'image' ? (
      <div className="media-placeholder">
        <PackageCheck size={18} />
        <span>{message.caption || message.body || 'Image received'}</span>
        <small>Preview unavailable. Check Meta token/media download.</small>
      </div>
    ) : message.type === 'document' && message.media_url ? (
<ProtectedMediaLink className="doc-message" url={message.media_url}>
  {message.file_name || message.body || 'Open document'}
</ProtectedMediaLink>
    ) : message.type === 'document' ? (
      <div className="media-placeholder">
        <FileText size={18} />
        <span>{message.file_name || message.body || 'Document received'}</span>
        <small>Download unavailable. Check Meta token/media download.</small>
      </div>
    ) : ['audio', 'video', 'sticker'].includes(message.type) && message.media_url ? (
<ProtectedMediaLink className="doc-message" url={message.media_url}>
  {message.file_name || message.body || `Open ${message.type}`}
</ProtectedMediaLink>
    ) : message.type === 'interactive' && message.interactive_payload ? (
      <div className="interactive-message">
        <strong>{message.interactive_payload?.header?.text || 'Menu'}</strong>
        <span>{message.interactive_payload?.body?.text || message.body}</span>
        <div>
          {(message.interactive_payload?.action?.sections || []).flatMap((section) => section.rows || []).map((row) => (
            <small key={row.id || row.title}>› {row.title}</small>
          ))}
        </div>
      </div>
    ) : (
      <span>{message.body}</span>
    )}

    <small>{message.type} - {message.status === 'queued-local' ? 'Local demo only' : message.status}</small>
  </div>
))}
              {!messages.length && <div className="empty-chat">Select a customer conversation</div>}
            </div>
<form className="composer" onSubmit={sendMessage}>
  {selected?.opted_out && (
    <p>Customer has opted out. WhatsApp sending is locked for this contact.</p>
  )}

  {!selected?.opted_out && selected && !selected.reply_window_open && !templateName && (
    <p>24-hour window expired. Select approved template before sending.</p>
  )}

  {sendError && <p>{sendError}</p>}

  <input
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    placeholder={selected?.reply_window_open ? 'Type WhatsApp reply' : 'Template required after 24h'}
    disabled={!selected || selected.opted_out || Boolean(templateName) || sendingMessage || !selected.reply_window_open}
  />

  <select
    value={templateName}
    onChange={(e) => {
      setTemplateName(e.target.value)
      setDraft('')
      setSendError('')
    }}
    disabled={!selected || selected.opted_out || sendingMessage}
  >
    <option value="">Text Reply</option>
    {templates.map((template) => (
      <option key={template.id} value={template.name}>
        {template.name}{template.language ? ` (${template.language})` : ''}
      </option>
    ))}
  </select>

  <button type="submit" disabled={!selected || selected.opted_out || sendingMessage || (!selected.reply_window_open && !templateName)}>
    {sendingMessage ? 'Sending' : <Send size={18} />}
  </button>
</form>
          </section>

          {profileOpen && <button className="drawer-backdrop" type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} />}
          <aside className={`profile-panel ${profileOpen ? 'open' : ''}`}>
            <button className="drawer-close" type="button" onClick={() => setProfileOpen(false)}>Close</button>
            <ProfilePanel selected={selected} leadForm={leadForm} setLeadForm={setLeadForm} users={users} canMonitor={canMonitor} stages={stages} labels={labels} onSave={saveLead} assignmentHistory={assignmentHistory} timeline={timeline} />
          </aside>
        </>
      )}
    </main>
  )
}

function ConnectionStrip({ status, whatsappConfig, canMonitor }) {
  const outgoingOk = canMonitor ? Boolean(whatsappConfig?.configured) : Boolean(status?.whatsappTokenSet && status?.phoneNumberIdSet)
  const hasCallbackUrl = canMonitor ? Boolean(whatsappConfig?.callbackUrl && !String(whatsappConfig.callbackUrl).startsWith('Set ')) : Boolean(status?.webhookVerifyTokenSet)
  const phoneMapped = canMonitor ? Boolean(whatsappConfig?.phoneNumberMapped) : Boolean(status?.phoneNumberMapped)
  const signatureRequired = canMonitor ? Boolean(whatsappConfig?.webhookSignatureRequired) : Boolean(status?.webhookSignatureRequired)
  const signatureReady = !signatureRequired || (canMonitor ? Boolean(whatsappConfig?.appSecretSet) : Boolean(status?.webhookAppSecretSet))
  const incomingReady = hasCallbackUrl && phoneMapped && signatureReady
  const incomingLabel = incomingReady
    ? 'ready'
    : !phoneMapped
      ? 'phone not mapped'
      : !signatureReady
        ? 'app secret missing'
        : 'needs URL'

  return (
    <div className="connection-strip">
      <span className={outgoingOk ? 'ok' : 'warn'}><CheckCircle2 size={15} /> Outgoing {outgoingOk ? 'connected' : 'not ready'}</span>
      <span className={incomingReady ? 'ok' : 'warn'}><Shield size={15} /> Incoming webhook {incomingLabel}</span>
    </div>
  )
}

function ConversationList({ conversations, selectedId, onSelect, onReset }) {
  return (
    <div className="conversation-list">
      {!conversations.length && (
        <div className="empty-list">
          <strong>No chats in this filter</strong>
          <span>Inbox ko All chats par reset karo, ya Settings me Local Inbound Test se customer message capture karke check karo.</span>
          <button type="button" onClick={onReset}>Show all chats</button>
        </div>
      )}
      {conversations.map((conversation) => (
        <button className={`conversation ${selectedId === conversation.id ? 'active' : ''}`} key={conversation.id} type="button" onClick={() => onSelect(conversation.id)}>
          <span className="avatar">{initials(conversation.name || conversation.phone)}</span>
          <span className="conversation-copy">
            <strong>{conversation.name || conversation.phone}</strong>
            <small className="conversation-pills">
              <span>{conversation.label || 'New Enquiry'}</span>
              <span>{conversation.stage || 'new'}</span>
            </small>
            <small>{conversation.assigned_name || 'Unassigned'} - {conversation.reply_window_open ? '24h open' : 'template needed'}</small>
            <small>{conversation.last_message || 'No message yet'}</small>
          </span>
          {Number(conversation.unread_count || 0) > 0 ? <span className="badge">{conversation.unread_count}</span> : <span className={`window-dot ${conversation.reply_window_open ? 'open' : 'expired'}`} />}
        </button>
      ))}
    </div>
  )
}

function ChatHeader({ selected, onProfile, currentTime }) {
  const hoursLeft = selected?.last_inbound_at
    ? Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (currentTime - new Date(selected.last_inbound_at).getTime())) / (60 * 60 * 1000)))
    : 0
  return (
    <header className="chat-header">
      <span className="avatar large">{initials(selected?.name || selected?.phone)}</span>
      <div>
        <h2>{selected?.name || 'No conversation selected'}</h2>
        <span>{selected?.phone || ''} {selected?.reply_window_open ? `- ${hoursLeft}h reply window left` : '- template required'}</span>
      </div>
      <span className={`status-pill ${selected?.reply_window_open ? 'ok' : 'warn'}`}>{selected?.label || 'No label'}</span>
      <button className="profile-toggle" type="button" onClick={onProfile} disabled={!selected}><UserRound size={18} /></button>
    </header>
  )
}

function ProfilePanel({ selected, leadForm, setLeadForm, users, canMonitor, stages, labels, onSave, assignmentHistory, timeline }) {
  if (!selected) return <div className="empty-profile">Customer profile will appear here.</div>
  return (
    <div className="profile-content">
      <div className="profile-head">
        <span className="avatar xl">{initials(selected.name || selected.phone)}</span>
        <h3>{selected.name || selected.phone}</h3>
        <span>{selected.phone}</span>
      </div>
      <form className="profile-form" onSubmit={onSave}>
        <label>Name<input value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} /></label>
        <label>Company<input value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} /></label>
        <label>Label<select value={leadForm.label} onChange={(e) => setLeadForm({ ...leadForm, label: e.target.value })}>{labels.filter((label) => label !== 'all').map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
        <label>Stage<select value={leadForm.stage} onChange={(e) => setLeadForm({ ...leadForm, stage: e.target.value })}>{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
        {canMonitor && <label>Assigned To<select value={leadForm.assigned_to} onChange={(e) => setLeadForm({ ...leadForm, assigned_to: e.target.value })}><option value="">Unassigned</option>{users.filter((item) => item.role === 'sales').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {canMonitor && <label>Assignment Reason<input value={leadForm.assignment_reason || ''} onChange={(e) => setLeadForm({ ...leadForm, assignment_reason: e.target.value })} /></label>}
        <label>Notes<textarea value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} /></label>
        <button type="submit">Save Profile</button>
      </form>
      {canMonitor && (
        <section className="profile-section">
          <h4>Assignment History</h4>
          {assignmentHistory.slice(0, 5).map((item) => <p key={item.id}>{item.from_user_name || 'Unassigned'} {'->'} {item.to_user_name || 'Unassigned'}<span>{item.reason || 'No reason'}</span></p>)}
          {!assignmentHistory.length && <small>No reassignment yet</small>}
        </section>
      )}
      <section className="profile-section">
        <h4>Customer Timeline</h4>
        {timeline.slice(0, 10).map((item, index) => (
          <p key={`${item.kind}-${item.at}-${index}`}>
            {item.title}<span>{item.status || item.kind} - {new Date(item.at).toLocaleString()}</span>
            <small>{item.text || '-'}</small>
          </p>
        ))}
        {!timeline.length && <small>No activity yet</small>}
      </section>
    </div>
  )
}

function DraftsPanel({ drafts, quoteRates, setQuoteRates, onQuote, onErp }) {
  return (
    <section className="compact-module">
      <div className="module-title"><FileText size={18} /><h3>WhatsApp Enquiry Drafts</h3></div>
      <div className="draft-list">
        {drafts.slice(0, 4).map((item) => (
          <div className="draft-row" key={item.id}>
            <strong>{item.contact_name || 'Customer'}</strong>
            <span>Grade: {item.grade || '-'} | Size: {item.size || '-'} | Qty: {item.quantity || '-'}</span>
            <small>{item.source} - {item.status}</small>
            {item.status === 'draft' && (
              <div className="inline-actions">
                <input placeholder="Rate" value={quoteRates[item.id] || ''} onChange={(e) => setQuoteRates({ ...quoteRates, [item.id]: e.target.value })} />
                <button type="button" onClick={() => onQuote(item)}>Quote</button>
                <button type="button" onClick={() => onErp(item.id)}>ERP</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DashboardPage({ dashboard, conversations, drafts, products, lowStockProducts, quotations, orders, onOpenPage }) {
  const cards = [
    { label: 'Conversations', value: dashboard?.total_conversations || conversations.length, action: 'inbox' },
    { label: 'Open Windows', value: dashboard?.open_windows || 0, action: 'inbox' },
    { label: 'Draft Enquiries', value: drafts.filter((item) => item.status === 'draft').length, action: 'new' },
    { label: 'Products', value: products.length, action: 'inventory' },
    { label: 'Low Stock', value: lowStockProducts.length, action: 'inventory' },
    { label: 'Open Quotes', value: quotations.filter((item) => !['converted', 'lost'].includes(item.status)).length, action: 'quotes' },
    { label: 'Active Orders', value: orders.filter((item) => item.status !== 'closed').length, action: 'activeOrders' },
    { label: 'Pending Dispatch', value: orders.filter((item) => item.dispatch_status !== 'dispatched').length, action: 'orders' },
  ]
  return (
    <section className="workspace-page">
      <div className="workspace-head">
        <div>
          <h2>Control Dashboard</h2>
          <span>Sales, inventory, quotations, and WhatsApp activity in one view.</span>
        </div>
      </div>
      <div className="kpi-grid">
        {cards.map((card) => (
          <button type="button" key={card.label} onClick={() => onOpenPage(card.action)}>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="table-module">
          <div className="module-title"><Inbox size={18} /><h3>Recent Chats</h3></div>
          {conversations.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.name || item.phone}</strong>
              <span>{item.label} - {item.last_message || 'No message yet'}</span>
            </div>
          ))}
          {!conversations.length && <EmptyState title="No chats yet" text="Incoming WhatsApp conversations will appear here." />}
        </section>
        <section className="table-module">
          <div className="module-title"><PackageCheck size={18} /><h3>Inventory Alerts</h3></div>
          {lowStockProducts.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.sku} - {item.name}</strong>
              <span>{Number(item.stock_qty || 0).toLocaleString('en-IN')} {item.unit || 'pcs'} remaining</span>
            </div>
          ))}
          {!lowStockProducts.length && <EmptyState title="Stock healthy" text="No active product is currently at low stock threshold." />}
        </section>
        <section className="table-module">
          <div className="module-title"><FileText size={18} /><h3>Enquiry Drafts</h3></div>
          {drafts.slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.contact_name || 'Customer'} - {item.status}</strong>
              <span>{[item.grade, item.size, item.shape, item.quantity].filter(Boolean).join(' | ') || 'Needs review'}</span>
            </div>
          ))}
          {!drafts.length && <EmptyState title="No drafts" text="Product enquiries extracted from WhatsApp will appear here." />}
        </section>
        <section className="table-module">
          <div className="module-title"><Clock3 size={18} /><h3>Order Attention</h3></div>
          {orders.filter((item) => item.status !== 'closed' || item.payment_status !== 'paid' || item.dispatch_status !== 'dispatched').slice(0, 5).map((item) => (
            <div className="mini-row" key={item.id}>
              <strong>{item.order_no}</strong>
              <span>Pay: {item.payment_status} | Dispatch: {item.dispatch_status}</span>
            </div>
          ))}
          {!orders.length && <EmptyState title="No orders" text="Converted quotations and confirmed WhatsApp orders will appear here." />}
        </section>
      </div>
    </section>
  )
}

function BotStudioPage({ appSettings, products, drafts, lowStockProducts, onOpenSettings }) {
  const activeProducts = products.filter((item) => item.active !== false)
  const matchedDrafts = drafts.filter((item) => item.grade || item.size || item.shape || item.quantity)
  const flow = [
    'Receive WhatsApp enquiry',
    'Extract product, size, grade, quantity',
    'Match live inventory',
    appSettings.botEnabled ? 'Send configured bot reply or quote draft' : 'Prepare reply draft for sales review',
    'Handoff on keywords or low confidence',
  ]
  return (
    <section className="workspace-page">
      <div className="workspace-head">
        <div>
          <h2>Bot Studio</h2>
          <span>Configure and monitor the automation layer before making it fully automatic.</span>
        </div>
        <button type="button" onClick={onOpenSettings}>Open Settings</button>
      </div>
      <div className="kpi-grid">
        <button type="button"><strong>{appSettings.botEnabled ? 'On' : 'Off'}</strong><span>Auto Bot</span></button>
        <button type="button"><strong>{activeProducts.length}</strong><span>Active Products</span></button>
        <button type="button"><strong>{matchedDrafts.length}</strong><span>Parsed Enquiries</span></button>
        <button type="button"><strong>{lowStockProducts.length}</strong><span>Low Stock Risks</span></button>
      </div>
      <div className="dashboard-grid">
        <section className="table-module">
          <div className="module-title"><Bot size={18} /><h3>Automation Flow</h3></div>
          <div className="flow-list">
            {flow.map((item, index) => <p key={item}><b>{index + 1}</b><span>{item}</span></p>)}
          </div>
        </section>
        <section className="table-module">
          <div className="module-title"><MessageCircle size={18} /><h3>Bot Greeting</h3></div>
          <div className="preview-card">{appSettings.botGreeting}</div>
          <small>Handoff keywords: {(appSettings.handoffKeywords || []).join(', ') || '-'}</small>
        </section>
        <section className="table-module">
          <div className="module-title"><PackageCheck size={18} /><h3>Inventory Fields</h3></div>
          <div className="chip-list">{(appSettings.inventoryFields || []).map((item) => <span key={item}>{item}</span>)}</div>
        </section>
        <section className="table-module">
          <div className="module-title"><Shield size={18} /><h3>Sales Handoff Rules</h3></div>
          <div className="mini-row"><strong>Always handoff when:</strong><span>Complaint, urgent keyword, no stock, unclear product, expired 24h reply window, or order exception.</span></div>
        </section>
      </div>
    </section>
  )
}

function EmptyState({ title, text }) {
  return <div className="empty-list"><strong>{title}</strong><span>{text}</span></div>
}

function InventoryPage({ products, productForm, setProductForm, editingProductId, onSave, onEdit, onDelete, onCancel, productSearch, setProductSearch, onSearch, canManage, currency, inventoryColumnsText, setInventoryColumnsText, onImport, importResult }) {
  const templateColumns = fromCsv(inventoryColumnsText)
  const sample = templateColumns.map((header) => {
    const key = header.toLowerCase()
    if (key.includes('sku') || key.includes('code')) return 'SKU-001'
    if (key.includes('name') || key.includes('product') || key.includes('item')) return 'Round Bar'
    if (key.includes('category')) return 'Steel'
    if (key.includes('grade')) return 'EN8'
    if (key.includes('size')) return '20mm'
    if (key.includes('shape')) return 'Round'
    if (key.includes('unit') || key.includes('uom')) return 'pcs'
    if (key.includes('price') || key.includes('rate')) return '1200'
    if (key.includes('stock') || key.includes('qty')) return '50'
    if (key.includes('active')) return 'true'
    return 'Custom value'
  })

  async function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await onImport(parseCsv(text))
    event.target.value = ''
  }

  return (
    <section className="table-module inventory-module">
      <div className="module-title"><PackageCheck size={18} /><h3>Inventory</h3></div>
      {canManage && (
        <div className="import-panel">
          <label>Template Columns<textarea value={inventoryColumnsText} onChange={(e) => setInventoryColumnsText(e.target.value)} /></label>
          <div className="import-actions">
            <button type="button" onClick={() => downloadCsv('inventory-template.csv', templateColumns, sample)}>Download Template</button>
            <label className="file-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={handleImport} /></label>
          </div>
          <small>Known columns are mapped automatically. Extra columns are saved as custom fields for that product.</small>
          {importResult && <small className="success-text">{importResult}</small>}
        </div>
      )}
      <div className="inventory-toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search SKU, product, grade, size" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }} /></div>
        <button type="button" onClick={onSearch}>Search</button>
      </div>
      {canManage && (
        <form className="product-form" onSubmit={onSave}>
          <input placeholder="SKU" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
          <input placeholder="Product name" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
          <input placeholder="Category" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
          <input placeholder="Grade" value={productForm.grade} onChange={(e) => setProductForm({ ...productForm, grade: e.target.value })} />
          <input placeholder="Size" value={productForm.size} onChange={(e) => setProductForm({ ...productForm, size: e.target.value })} />
          <input placeholder="Shape" value={productForm.shape} onChange={(e) => setProductForm({ ...productForm, shape: e.target.value })} />
          <input placeholder="Unit" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
          <input placeholder="Price" type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
          <input placeholder="Stock" type="number" value={productForm.stock_qty} onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })} />
          <label className="toggle-row"><input type="checkbox" checked={Boolean(productForm.active)} onChange={(e) => setProductForm({ ...productForm, active: e.target.checked })} /> Active</label>
          <button type="submit">{editingProductId ? 'Update Product' : 'Add Product'}</button>
          {editingProductId && <button type="button" onClick={onCancel}>Cancel</button>}
        </form>
      )}
      <div className="product-list">
        {products.map((product) => (
          <div className="product-row" key={product.id}>
            <strong>{product.sku}</strong>
            <span>{product.name}</span>
            <small>{[product.category, product.grade, product.size, product.shape].filter(Boolean).join(' | ') || 'No attributes'}</small>
            {product.custom_fields && Object.keys(product.custom_fields).length > 0 && <small className="custom-field-line">Custom: {Object.entries(product.custom_fields).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(' | ')}</small>}
            <b>{currency || 'INR'} {Number(product.price || 0).toLocaleString('en-IN')}</b>
            <em>{Number(product.stock_qty || 0).toLocaleString('en-IN')} {product.unit || 'pcs'}</em>
            <i className={product.active ? 'ok' : 'warn'}>{product.active ? 'Active' : 'Inactive'}</i>
            {canManage && (
              <div className="doc-actions">
                <button type="button" onClick={() => onEdit(product)}>Edit</button>
                <button type="button" onClick={() => onDelete(product)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {!products.length && <div className="empty-list"><strong>No products found</strong><span>Add products so the bot can match inventory and prepare quotations.</span></div>}
      </div>
    </section>
  )
}

function QuotesPage({ quotations, onStatus, onConvert, onDownload }) {
  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Quotations</h3></div>
      {!quotations.length && <EmptyState title="No quotations" text="Quotation drafts created from WhatsApp enquiries will appear here." />}
      {quotations.map((quote) => (
        <div className="doc-row" key={quote.id}>
          <strong>{quote.quote_no}</strong>
          <span>{quote.contact_name || 'Customer'} - {quote.status}</span>
          <b>{formatMoney(quote.amount)}</b>
          <div className="doc-actions">
            <button type="button" onClick={() => onStatus(quote, 'sent')}>Sent</button>
            <button type="button" onClick={() => onStatus(quote, 'lost')}>Lost</button>
            <button type="button" onClick={() => onConvert(quote)}>Order</button>
            <button type="button" onClick={() => onDownload(quote)}>Download</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function OrdersPage({ orders, onUpdate, title = 'Orders' }) {
  return (
    <section className="table-module">
      <div className="module-title"><PackageCheck size={18} /><h3>{title}</h3></div>
      {!orders.length && <EmptyState title="No orders" text="Converted quotations and confirmed orders will appear here." />}
      {orders.map((order) => (
        <div className="doc-row" key={order.id}>
          <strong>{order.order_no}</strong>
          <span>{order.contact_name || 'Customer'} - Pay: {order.payment_status} - Dispatch: {order.dispatch_status}</span>
          <b>{formatMoney(order.amount)}</b>
          <div className="doc-actions">
            <button type="button" onClick={() => onUpdate(order, { payment_status: 'paid' })}>Paid</button>
            <button type="button" onClick={() => onUpdate(order, { dispatch_status: 'dispatched' })}>Dispatch</button>
            <button type="button" onClick={() => onUpdate(order, { status: 'closed' })}>Close</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function UsersPage({ users, newUser, setNewUser, editingUserId, onCreate, onEdit, onCancel, onToggle, onDelete }) {
  const [activeUserView, setActiveUserView] = useState('list')
  const activeCount = users.filter((item) => item.active).length
  const inactiveCount = users.length - activeCount

  async function handleSubmit(event) {
    const saved = await onCreate(event)
    if (saved) setActiveUserView('list')
  }

  function handleEdit(userItem) {
    onEdit(userItem)
    setActiveUserView('form')
  }

  function handleCancel() {
    onCancel()
    setActiveUserView('list')
  }

  return (
    <section className="table-module users-module">
      <div className="module-title user-module-head">
        <div><Users size={18} /><h3>User Management</h3></div>
        <div className="user-summary">
          <span>{users.length} total</span>
          <span>{activeCount} active</span>
          <span>{inactiveCount} inactive</span>
        </div>
      </div>
      <div className="user-tabs">
        <button className={activeUserView === 'form' ? 'active' : ''} type="button" onClick={() => setActiveUserView('form')}>
          <UserPlus size={16} /> {editingUserId ? 'Edit User' : 'Add User'}
        </button>
        <button className={activeUserView === 'list' ? 'active' : ''} type="button" onClick={() => setActiveUserView('list')}>
          <Users size={16} /> User List
        </button>
      </div>

      {activeUserView === 'form' && (
        <form className="user-form user-form-panel" onSubmit={handleSubmit}>
          <div className="user-form-title">
            <strong>{editingUserId ? 'Edit existing user' : 'Create new user'}</strong>
            <span>{editingUserId ? 'Email stays locked for account identity.' : 'Add one team member with role-based access.'}</span>
          </div>
          <label>Name<input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
          <label>Email<input placeholder="name@company.com" value={newUser.email} disabled={Boolean(editingUserId)} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
          <label>Password<input placeholder={editingUserId ? 'Leave blank to keep old password' : 'Temporary password'} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          <label>Role<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="sales">Sales</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          <div className="user-form-actions">
            <button className="user-action-primary" type="submit">{editingUserId ? <CheckCircle2 size={16} /> : <UserPlus size={16} />} {editingUserId ? 'Update User' : 'Create User'}</button>
            {editingUserId && <button className="user-action-neutral" type="button" onClick={handleCancel}><X size={16} /> Cancel</button>}
          </div>
        </form>
      )}

      {activeUserView === 'list' && (
        <div className="user-list-panel">
          {!users.length && <EmptyState title="No users" text="Create sales, manager, and admin users for this client." />}
          {!!users.length && (
            <div className="user-table">
              <div className="user-table-head">
                <span>User</span>
                <span>Email</span>
                <span>Role</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {users.map((item) => (
                <div className="user-row" key={item.id}>
                  <div className="user-name-cell">
                    <strong>{item.name}</strong>
                    <small>ID: {String(item.id).slice(0, 8)}</small>
                  </div>
                  <span>{item.email}</span>
                  <b className={`role-badge role-${item.role}`}>{item.role}</b>
                  <i className={item.active ? 'status-active' : 'status-inactive'}>{item.active ? 'Active' : 'Inactive'}</i>
                  <div className="user-actions">
                    <button className="user-action-edit" type="button" onClick={() => handleEdit(item)}><Pencil size={15} /> Edit</button>
                    <button className={item.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggle(item)}>
                      {item.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="user-action-delete" type="button" onClick={() => onDelete(item)}><Trash2 size={15} /> Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function AuditPage({ events }) {
  return (
    <section className="table-module">
      <div className="module-title"><Shield size={18} /><h3>Audit Log</h3></div>
      {!events.length && <EmptyState title="No audit events" text="System and user actions will appear here." />}
      {events.map((event) => (
        <div className="audit-row" key={event.id}>
          <strong>{event.action}</strong>
          <span>{event.actor_name || 'System'} - {event.entity_type}</span>
          <small>{new Date(event.created_at).toLocaleString()}</small>
        </div>
      ))}
    </section>
  )
}

function SettingsPage({ status, whatsappConfig, testMessage, setTestMessage, testResult, onTest, onMapPhone, simulator, setSimulator, onSimulate, customForm, setCustomForm, onSaveCustomization, settingsSaved, templates, templateForm, setTemplateForm, editingTemplateId, onSaveTemplate, onEditTemplate, onToggleTemplate, onCancelTemplateEdit, userRole, isProduction }) {
      const warnings = status?.warnings || []

  return (
        <div className="settings-stack">
      <section className="table-module">
        <div className="module-title"><Settings size={18} /><h3>Business Customization</h3></div>
        <form className="custom-form" onSubmit={onSaveCustomization}>
          <label>App Name<input value={customForm.appName} onChange={(e) => setCustomForm({ ...customForm, appName: e.target.value })} /></label>
          <label>Company Name<input value={customForm.companyName} onChange={(e) => setCustomForm({ ...customForm, companyName: e.target.value })} /></label>
          <label>Industry<input value={customForm.industry} onChange={(e) => setCustomForm({ ...customForm, industry: e.target.value })} /></label>
          <label>Theme Color<input type="color" value={customForm.primaryColor} onChange={(e) => setCustomForm({ ...customForm, primaryColor: e.target.value })} /></label>
          <label>Currency<input value={customForm.currency} onChange={(e) => setCustomForm({ ...customForm, currency: e.target.value })} /></label>
          <label>Quotation Prefix<input value={customForm.quotationPrefix} onChange={(e) => setCustomForm({ ...customForm, quotationPrefix: e.target.value })} /></label>
          <label>Order Prefix<input value={customForm.orderPrefix} onChange={(e) => setCustomForm({ ...customForm, orderPrefix: e.target.value })} /></label>
          <label>Labels<textarea value={customForm.labelsText} onChange={(e) => setCustomForm({ ...customForm, labelsText: e.target.value })} /></label>
          <label>Sales Stages<textarea value={customForm.stagesText} onChange={(e) => setCustomForm({ ...customForm, stagesText: e.target.value })} /></label>
          <label>Bot Greeting<textarea value={customForm.botGreeting} onChange={(e) => setCustomForm({ ...customForm, botGreeting: e.target.value })} /></label>
          <label>Handoff Keywords<textarea value={customForm.handoffKeywordsText} onChange={(e) => setCustomForm({ ...customForm, handoffKeywordsText: e.target.value })} /></label>
          <label>Inventory Fields<textarea value={customForm.inventoryFieldsText} onChange={(e) => setCustomForm({ ...customForm, inventoryFieldsText: e.target.value })} /></label>
          <label className="toggle-row"><input type="checkbox" checked={Boolean(customForm.botEnabled)} onChange={(e) => setCustomForm({ ...customForm, botEnabled: e.target.checked })} /> Enable Auto Bot</label>
          <button type="submit">Save Customization</button>
          {settingsSaved && <small className="success-text">{settingsSaved}</small>}
        </form>
      </section>

      <section className="table-module">
        <div className="module-title"><Settings size={18} /><h3>WhatsApp Setup</h3></div>
<div className="setup-grid">
  <span className={whatsappConfig?.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
  <span className={whatsappConfig?.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
  <span className={whatsappConfig?.phoneNumberMapped ? 'ok' : 'warn'}>Phone mapped</span>
  <span className={whatsappConfig?.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
  <span className={whatsappConfig?.appSecretSet || !whatsappConfig?.webhookSignatureRequired ? 'ok' : 'warn'}>App secret</span>
  <span className={whatsappConfig?.testNumbersSet || status?.whatsappTestNumbersSet ? 'ok' : 'warn'}>Test numbers</span>
</div>
        {whatsappConfig?.phoneNumberMappedTenantSlug && (
          <p className="setup-copy">Incoming messages map to tenant: {whatsappConfig.phoneNumberMappedTenantSlug}</p>
        )}
{userRole === 'admin' && whatsappConfig?.phoneNumberIdSet && !whatsappConfig?.phoneNumberMappedToCurrentTenant && (
  <div className="inline-actions">
    <span className="setup-copy">Phone number ID is not mapped to this company.</span>
    <button type="button" onClick={onMapPhone}>Map Phone To This Company</button>
  </div>
)}

        {warnings.length > 0 && (
          <div className="warning-list">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        <p className="setup-copy">Webhook: {whatsappConfig?.callbackUrl || '-'}</p>
        {userRole === 'admin' ? (
  <>
    <form className="dual-form" onSubmit={onTest}>
      <input placeholder="Customer number" value={testMessage.to} onChange={(e) => setTestMessage({ ...testMessage, to: e.target.value })} />
      <input placeholder="Test message inside 24-hour window only" value={testMessage.text} onChange={(e) => setTestMessage({ ...testMessage, text: e.target.value })} />
      <button type="submit">Send Test</button>
    </form>
    <small className="setup-copy">Free-form test messages are allowed only inside the customer&apos;s 24-hour WhatsApp reply window.</small>
    {testResult && <small>{testResult}</small>}
  </>
) : (
  <p className="setup-copy">WhatsApp test message is admin-only.</p>
)}
        {!isProduction && (
          <>
            <div className="module-title"><MessageCircle size={18} /><h3>Local Inbound Test</h3></div>
            <form className="sim-form" onSubmit={onSimulate}>
              <input placeholder="Customer number" value={simulator.phone} onChange={(e) => setSimulator({ ...simulator, phone: e.target.value })} />
              <input placeholder="Customer name" value={simulator.name} onChange={(e) => setSimulator({ ...simulator, name: e.target.value })} />
              <textarea placeholder="Customer WhatsApp message" value={simulator.message} onChange={(e) => setSimulator({ ...simulator, message: e.target.value })} />
              <button type="submit">Capture Message</button>
            </form>
          </>
        )}
      </section>
            <section className="table-module">
        <div className="module-title"><MessageCircle size={18} /><h3>Approved WhatsApp Templates</h3></div>
        <small className="setup-copy">
          Add only templates that are already approved in Meta WhatsApp Manager. This does not create templates inside Meta.
        </small>

        <form className="custom-form" onSubmit={onSaveTemplate}>
          <label>
            Template Name
            <input
              placeholder="quotation_followup"
              value={templateForm.name}
              onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            />
          </label>

          <label>
            Language
            <input
              placeholder="en_US"
              value={templateForm.language}
              onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })}
            />
          </label>

          <label>
            Body Preview
            <textarea
              placeholder="Your quotation is ready. Please confirm."
              value={templateForm.body}
              onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(templateForm.active)}
              onChange={(e) => setTemplateForm({ ...templateForm, active: e.target.checked })}
            />
            Active
          </label>

          <div className="user-form-actions">
            <button className="user-action-primary" type="submit">
              {editingTemplateId ? 'Update Template' : 'Save Template'}
            </button>
            {editingTemplateId && (
              <button className="user-action-neutral" type="button" onClick={onCancelTemplateEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {!templates.length && <EmptyState title="No templates" text="Add approved Meta templates for expired 24-hour conversations." />}

        {!!templates.length && (
          <div className="user-table">
            <div className="user-table-head">
              <span>Name</span>
              <span>Language</span>
              <span>Status</span>
              <span>Body</span>
              <span>Actions</span>
            </div>

            {templates.map((template) => (
              <div className="user-row" key={template.id}>
                <div className="user-name-cell">
                  <strong>{template.name}</strong>
                  <small>ID: {String(template.id).slice(0, 8)}</small>
                </div>
                <span>{template.language}</span>
                <i className={template.active ? 'status-active' : 'status-inactive'}>
                  {template.active ? 'Active' : 'Inactive'}
                </i>
                <span>{template.body}</span>
                <div className="user-actions">
                  <button className="user-action-edit" type="button" onClick={() => onEditTemplate(template)}>
                    Edit
                  </button>
                  <button className={template.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggleTemplate(template)}>
                    {template.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default App
