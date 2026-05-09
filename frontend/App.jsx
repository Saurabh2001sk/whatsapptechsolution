import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LogOut,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Tag,
  UserRound,
  Users,
} from 'lucide-react'
import './App.css'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000' })

const labels = ['all', 'New Enquiry', 'Quotation Required', 'Dispatch Query', 'Payment Follow-up', 'Complaint', 'Review Required']
const stages = ['new', 'qualified', 'quoted', 'won', 'lost']

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

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const res = await api.post('/api/auth/login', {
        email: form.email.trim(),
        password: form.password.trim(),
      })
      localStorage.setItem('bosToken', res.data.token)
      localStorage.setItem('bosUser', JSON.stringify(res.data.user))
      setAuth(res.data.token)
      onLogin(res.data.user)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <MessageCircle size={34} />
          <div>
            <h1>BOS WhatsApp CRM</h1>
            <span>Sales inbox for one WhatsApp API number</span>
          </div>
        </div>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit">Login</button>
        <small>Use your assigned BOS CRM credentials.</small>
      </form>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('bosUser') || 'null'))
  const [activePage, setActivePage] = useState('inbox')
  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [users, setUsers] = useState([])
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [templates, setTemplates] = useState([])
  const [drafts, setDrafts] = useState([])
  const [quotations, setQuotations] = useState([])
  const [orders, setOrders] = useState([])
  const [whatsappConfig, setWhatsappConfig] = useState(null)
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [filter, setFilter] = useState('all')
  const [windowFilter, setWindowFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [sendError, setSendError] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [leadForm, setLeadForm] = useState({ name: '', company: '', stage: 'new', notes: '', label: 'New Enquiry', assigned_to: '', assignment_reason: '' })
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'sales' })
  const [simulator, setSimulator] = useState({ phone: '', name: '', message: 'Need quotation for round bar grade EN8 size 20mm qty 25 pcs' })
  const [testMessage, setTestMessage] = useState({ to: '', text: 'BOS WhatsApp CRM test message' })
  const [testResult, setTestResult] = useState('')
  const [quoteRates, setQuoteRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const token = localStorage.getItem('bosToken')
  const canMonitor = user?.role === 'admin' || user?.role === 'manager'
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || conversations[0], [conversations, selectedId])

  const pageItems = useMemo(() => {
    const common = [
      { id: 'inbox', label: 'Inbox', icon: Inbox },
      { id: 'new', label: 'New Enquiries', icon: Bell },
      { id: 'sales', label: 'Sales Pipeline', icon: BarChart3 },
      { id: 'quotes', label: 'Quotations', icon: FileText },
      { id: 'orders', label: 'Orders', icon: PackageCheck },
      { id: 'activeOrders', label: 'Active Orders', icon: Clock3 },
    ]
    if (canMonitor) common.push({ id: 'settings', label: 'Settings', icon: Settings })
    if (user?.role === 'admin') common.push({ id: 'users', label: 'Users', icon: Users })
    return common
  }, [canMonitor, user?.role])

  useEffect(() => {
    setAuth(token)
  }, [token])

  async function loadAll() {
    if (!localStorage.getItem('bosToken')) return
    setLoading(true)
    setLoadError('')
    try {
      const calls = [
        api.get('/api/settings/status'),
        api.get('/api/dashboard'),
        api.get('/api/conversations', { params: { label: filter, q: search, window: windowFilter } }),
        api.get('/api/templates'),
        api.get('/api/enquiry-drafts'),
        api.get('/api/quotations'),
        api.get('/api/orders'),
      ]
      if (canMonitor) {
        calls.push(api.get('/api/users'))
        calls.push(api.get('/api/whatsapp/config'))
      }
      const [statusRes, dashRes, convoRes, templateRes, draftRes, quoteRes, orderRes, usersRes, whatsappConfigRes] = await Promise.all(calls)
      setStatus(statusRes.data)
      setDashboard(dashRes.data)
      setConversations(convoRes.data)
      setTemplates(templateRes.data)
      setDrafts(draftRes.data)
      setQuotations(quoteRes.data)
      setOrders(orderRes.data)
      if (usersRes) setUsers(usersRes.data)
      if (whatsappConfigRes) setWhatsappConfig(whatsappConfigRes.data)
      if (!selectedId && convoRes.data[0]) setSelectedId(convoRes.data[0].id)
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Unable to load CRM data'
      setLoadError(message)
      if (err.response?.status === 401 || err.response?.status === 403) {
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
    loadAll()
  }, [user?.id, filter, windowFilter])

  useEffect(() => {
    if (!selected?.id) return
    setSendError('')
    loadMessages(selected.id, true).then(() => loadAll())
    if (canMonitor) api.get(`/api/contacts/${selected.id}/assignment-history`).then((res) => setAssignmentHistory(res.data))
    setLeadForm({
      name: selected.name || '',
      company: selected.company || '',
      stage: selected.stage || 'new',
      notes: selected.notes || '',
      label: selected.label || 'New Enquiry',
      assigned_to: selected.assigned_to || '',
      assignment_reason: '',
    })
  }, [selected?.id])

  if (!user) return <Login onLogin={setUser} />

  function logout() {
    localStorage.removeItem('bosToken')
    localStorage.removeItem('bosUser')
    setAuth(null)
    setUser(null)
  }

  function showPage(page, pageFilter = {}) {
    setActivePage(page)
    if (page === 'inbox') {
      setFilter(pageFilter.label || 'all')
      setWindowFilter(pageFilter.window || 'all')
      setSearch('')
    } else if (page === 'new') {
      setFilter('New Enquiry')
      setWindowFilter('all')
    } else if (page === 'sales') {
      setFilter('all')
      setWindowFilter('open')
    } else {
      if (pageFilter.label) setFilter(pageFilter.label)
      if (pageFilter.window) setWindowFilter(pageFilter.window)
    }
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!selected || sendingMessage) return
    setSendError('')
    const payload = templateName ? { templateName } : { text: draft.trim() }
    if (!payload.templateName && !payload.text) return setSendError('Message text required hai, ya template select karo.')
    setSendingMessage(true)
    try {
      await api.post(`/api/conversations/${selected.id}/messages`, payload)
      setDraft('')
      setTemplateName('')
      await Promise.all([loadMessages(selected.id), loadAll()])
    } catch (err) {
      setSendError(err.response?.data?.error || 'Message send failed')
    } finally {
      setSendingMessage(false)
    }
  }

  async function saveLead(event) {
    event.preventDefault()
    if (!selected) return
    await api.patch(`/api/contacts/${selected.id}`, leadForm)
    await loadAll()
    if (canMonitor) {
      const res = await api.get(`/api/contacts/${selected.id}/assignment-history`)
      setAssignmentHistory(res.data)
    }
  }

  async function simulateInbound(event) {
    event.preventDefault()
    await api.post('/api/local/inbound-message', simulator)
    setActivePage('inbox')
    setFilter('all')
    await loadAll()
  }

  async function createQuoteFromDraft(draftItem) {
    await api.post(`/api/enquiry-drafts/${draftItem.id}/create-quote`, {
      rate: Number(quoteRates[draftItem.id] || 0),
      notes: `Quote for ${draftItem.grade || ''} ${draftItem.size || ''} ${draftItem.quantity || ''}`.trim(),
    })
    setQuoteRates({ ...quoteRates, [draftItem.id]: '' })
    await loadAll()
  }

  async function createErp(draftId) {
    await api.post(`/api/enquiry-drafts/${draftId}/create-erp`)
    await loadAll()
  }

  async function updateQuote(quote, statusValue) {
    await api.patch(`/api/quotations/${quote.id}`, { status: statusValue })
    await loadAll()
  }

  async function convertQuote(quote) {
    await api.post(`/api/quotations/${quote.id}/convert-order`)
    setActivePage('orders')
    await loadAll()
  }

  async function updateOrder(order, patch) {
    await api.patch(`/api/orders/${order.id}`, patch)
    await loadAll()
  }

  async function createUser(event) {
    event.preventDefault()
    await api.post('/api/users', newUser)
    setNewUser({ name: '', email: '', password: '', role: 'sales' })
    await loadAll()
  }

  async function toggleUser(userItem) {
    await api.patch(`/api/users/${userItem.id}`, { active: !userItem.active })
    await loadAll()
  }

  async function sendTestMessage(event) {
    event.preventDefault()
    setTestResult('')
    try {
      const res = await api.post('/api/whatsapp/test-message', testMessage)
      setTestResult(`Accepted by Meta. To: ${res.data.to}. Message ID: ${res.data.messageId || 'not returned'}`)
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

  const newEnquiries = drafts.filter((item) => item.status === 'draft')
  const activeOrders = orders.filter((item) => item.status !== 'closed')

  return (
    <main className="app-shell">
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
        <div className="app-title">
          <div>
            <h1>BOS WhatsApp CRM</h1>
            <span>{user.name} - {user.role}</span>
          </div>
          <button type="button" onClick={loadAll} disabled={loading}><RefreshCw size={17} /> Refresh</button>
        </div>
        {loadError && <div className="load-error">{loadError}</div>}

        <div className="metric-grid">
          <button type="button" onClick={() => showPage('inbox', { label: 'all' })}><Inbox size={18} /><strong>{dashboard?.total_conversations || 0}</strong><span>Total Chats</span></button>
          <button type="button" onClick={() => showPage('new', { label: 'New Enquiry' })}><Bell size={18} /><strong>{newEnquiries.length}</strong><span>New Enquiries</span></button>
          <button type="button" onClick={() => showPage('inbox', { window: 'expired' })}><AlertTriangle size={18} /><strong>{dashboard?.expired_windows || 0}</strong><span>Expired Window</span></button>
          <button type="button" onClick={() => showPage('activeOrders')}><PackageCheck size={18} /><strong>{activeOrders.length}</strong><span>Active Orders</span></button>
        </div>

        <ConnectionStrip status={status} whatsappConfig={whatsappConfig} canMonitor={canMonitor} />

        {(activePage === 'inbox' || activePage === 'new' || activePage === 'sales') && (
          <>
            <div className="filter-toolbar">
              <div className="search-box"><Search size={17} /><input placeholder="Search customer, phone, company" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadAll() }} /></div>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</select>
              <select value={windowFilter} onChange={(e) => setWindowFilter(e.target.value)}><option value="all">All windows</option><option value="open">24h open</option><option value="expired">Expired</option></select>
            </div>
            <ConversationList conversations={conversations} selectedId={selected?.id} onSelect={setSelectedId} onReset={() => showPage('inbox')} />
          </>
        )}

        {activePage === 'quotes' && <QuotesPage quotations={quotations} onStatus={updateQuote} onConvert={convertQuote} />}
        {activePage === 'orders' && <OrdersPage orders={orders} onUpdate={updateOrder} />}
        {activePage === 'activeOrders' && <OrdersPage orders={activeOrders} onUpdate={updateOrder} title="Active Orders" />}
        {activePage === 'users' && user.role === 'admin' && <UsersPage users={users} newUser={newUser} setNewUser={setNewUser} onCreate={createUser} onToggle={toggleUser} />}
        {activePage === 'settings' && canMonitor && <SettingsPage whatsappConfig={whatsappConfig} testMessage={testMessage} setTestMessage={setTestMessage} testResult={testResult} onTest={sendTestMessage} simulator={simulator} setSimulator={setSimulator} onSimulate={simulateInbound} />}

        <DraftsPanel drafts={drafts} quoteRates={quoteRates} setQuoteRates={setQuoteRates} onQuote={createQuoteFromDraft} onErp={createErp} />
      </section>

      <section className="chat-shell">
        <ChatHeader selected={selected} />
        <div className="message-list">
          {messages.map((message) => (
            <div className={`message ${message.direction}`} key={message.id}>
              <b>{message.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</b>
              <span>{message.body}</span>
              <small>{message.type} - {message.status === 'queued-local' ? 'Local demo only' : message.status}</small>
            </div>
          ))}
          {!messages.length && <div className="empty-chat">Select a customer conversation</div>}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          {sendError && <p>{sendError}</p>}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={selected?.reply_window_open ? 'Type WhatsApp reply' : 'Use approved template after 24h'} disabled={Boolean(templateName) || sendingMessage} />
          <select value={templateName} onChange={(e) => { setTemplateName(e.target.value); setSendError('') }} disabled={sendingMessage}>
            <option value="">Text Reply</option>
            {templates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
          </select>
          <button type="submit" disabled={sendingMessage}>{sendingMessage ? 'Sending' : <Send size={18} />}</button>
        </form>
      </section>

      <aside className="profile-panel">
        <ProfilePanel selected={selected} leadForm={leadForm} setLeadForm={setLeadForm} users={users} canMonitor={canMonitor} stages={stages} labels={labels} onSave={saveLead} assignmentHistory={assignmentHistory} />
      </aside>
    </main>
  )
}

function ConnectionStrip({ status, whatsappConfig, canMonitor }) {
  const outgoingOk = canMonitor ? Boolean(whatsappConfig?.configured) : Boolean(status?.whatsappTokenSet && status?.phoneNumberIdSet)
  const incomingReady = canMonitor ? Boolean(whatsappConfig?.callbackUrl && !String(whatsappConfig.callbackUrl).startsWith('Set ')) : Boolean(status?.webhookVerifyTokenSet)
  return (
    <div className="connection-strip">
      <span className={outgoingOk ? 'ok' : 'warn'}><CheckCircle2 size={15} /> Outgoing {outgoingOk ? 'connected' : 'not ready'}</span>
      <span className={incomingReady ? 'ok' : 'warn'}><Shield size={15} /> Incoming webhook {incomingReady ? 'ready' : 'needs URL'}</span>
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
            <small>{conversation.label} - {conversation.assigned_name || 'Unassigned'}</small>
            <small>{conversation.last_message || 'No message yet'}</small>
          </span>
          {Number(conversation.unread_count || 0) > 0 ? <span className="badge">{conversation.unread_count}</span> : <span className={`window-dot ${conversation.reply_window_open ? 'open' : 'expired'}`} />}
        </button>
      ))}
    </div>
  )
}

function ChatHeader({ selected }) {
  return (
    <header className="chat-header">
      <span className="avatar large">{initials(selected?.name || selected?.phone)}</span>
      <div>
        <h2>{selected?.name || 'No conversation selected'}</h2>
        <span>{selected?.phone || ''} {selected?.reply_window_open ? '- 24h window open' : '- template required'}</span>
      </div>
      <span className={`status-pill ${selected?.reply_window_open ? 'ok' : 'warn'}`}>{selected?.label || 'No label'}</span>
    </header>
  )
}

function ProfilePanel({ selected, leadForm, setLeadForm, users, canMonitor, stages, labels, onSave, assignmentHistory }) {
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

function QuotesPage({ quotations, onStatus, onConvert }) {
  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Quotations</h3></div>
      {quotations.map((quote) => (
        <div className="doc-row" key={quote.id}>
          <strong>{quote.quote_no}</strong>
          <span>{quote.contact_name || 'Customer'} - {quote.status}</span>
          <b>{formatMoney(quote.amount)}</b>
          <div className="doc-actions">
            <button type="button" onClick={() => onStatus(quote, 'sent')}>Sent</button>
            <button type="button" onClick={() => onStatus(quote, 'lost')}>Lost</button>
            <button type="button" onClick={() => onConvert(quote)}>Order</button>
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

function UsersPage({ users, newUser, setNewUser, onCreate, onToggle }) {
  return (
    <section className="table-module">
      <div className="module-title"><Users size={18} /><h3>User Management</h3></div>
      <form className="user-form" onSubmit={onCreate}>
        <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
        <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
        <input placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
        <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="sales">sales</option><option value="manager">manager</option><option value="admin">admin</option></select>
        <button type="submit">Create User</button>
      </form>
      {users.map((item) => <div className="user-row" key={item.id}><strong>{item.name}</strong><span>{item.email} - {item.role}</span><button type="button" onClick={() => onToggle(item)}>{item.active ? 'Deactivate' : 'Activate'}</button></div>)}
    </section>
  )
}

function SettingsPage({ whatsappConfig, testMessage, setTestMessage, testResult, onTest, simulator, setSimulator, onSimulate }) {
  return (
    <section className="table-module">
      <div className="module-title"><Settings size={18} /><h3>WhatsApp Setup</h3></div>
      <div className="setup-grid">
        <span className={whatsappConfig?.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
        <span className={whatsappConfig?.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
        <span className={whatsappConfig?.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
      </div>
      <p className="setup-copy">Webhook: {whatsappConfig?.callbackUrl || '-'}</p>
      <form className="dual-form" onSubmit={onTest}>
        <input placeholder="Customer number" value={testMessage.to} onChange={(e) => setTestMessage({ ...testMessage, to: e.target.value })} />
        <input placeholder="Test message" value={testMessage.text} onChange={(e) => setTestMessage({ ...testMessage, text: e.target.value })} />
        <button type="submit">Send Test</button>
      </form>
      {testResult && <small>{testResult}</small>}
      <div className="module-title"><MessageCircle size={18} /><h3>Local Inbound Test</h3></div>
      <form className="sim-form" onSubmit={onSimulate}>
        <input placeholder="Customer number" value={simulator.phone} onChange={(e) => setSimulator({ ...simulator, phone: e.target.value })} />
        <input placeholder="Customer name" value={simulator.name} onChange={(e) => setSimulator({ ...simulator, name: e.target.value })} />
        <textarea placeholder="Customer WhatsApp message" value={simulator.message} onChange={(e) => setSimulator({ ...simulator, message: e.target.value })} />
        <button type="submit">Capture Message</button>
      </form>
    </section>
  )
}

export default App
