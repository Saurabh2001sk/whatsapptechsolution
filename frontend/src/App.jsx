import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Send,
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

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: 'admin@bos.com', password: 'admin123' })
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
      <form className="login-box" onSubmit={submit}>
        <div className="brand compact">
          <MessageCircle size={30} />
          <div>
            <h1>BOS WhatsApp CRM</h1>
            <span>One API number, role-wise team access</span>
          </div>
        </div>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
        {error && <p className="error-text">{error}</p>}
        <button type="submit">Login</button>
        <div className="demo-logins">
          <span>admin@bos.com / admin123</span>
          <span>manager@bos.com / manager123</span>
          <span>sales@bos.com / sales123</span>
        </div>
      </form>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('bosUser') || 'null'))
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
  const [testMessage, setTestMessage] = useState({ to: '', text: 'BOS WhatsApp CRM test message' })
  const [testResult, setTestResult] = useState('')
  const [simulator, setSimulator] = useState({
    phone: '',
    name: '',
    message: 'Need quotation for round bar grade EN8 size 20mm qty 25 pcs',
  })
  const [quoteRates, setQuoteRates] = useState({})
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [windowFilter, setWindowFilter] = useState('all')
  const [assignmentHistory, setAssignmentHistory] = useState([])
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'sales' })
  const [draft, setDraft] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [leadForm, setLeadForm] = useState({ name: '', company: '', stage: 'new', owner: '', notes: '', label: 'New Enquiry', assigned_to: '' })
  const [loading, setLoading] = useState(false)

  const token = localStorage.getItem('bosToken')
  const canMonitor = user?.role === 'admin' || user?.role === 'manager'
  const selected = useMemo(() => conversations.find((item) => item.id === selectedId) || conversations[0], [conversations, selectedId])

  useEffect(() => {
    setAuth(token)
  }, [token])

  async function loadAll() {
    if (!localStorage.getItem('bosToken')) return
    setLoading(true)
    try {
      const baseCalls = [
        api.get('/api/settings/status'),
        api.get('/api/dashboard'),
        api.get('/api/conversations', { params: { label: filter, q: search, window: windowFilter } }),
        api.get('/api/templates'),
        api.get('/api/enquiry-drafts'),
        api.get('/api/quotations'),
        api.get('/api/orders'),
      ]
      if (canMonitor) {
        baseCalls.push(api.get('/api/users'))
        baseCalls.push(api.get('/api/whatsapp/config'))
      }
      const [statusRes, dashRes, convoRes, templateRes, draftRes, quoteRes, orderRes, usersRes, whatsappConfigRes] = await Promise.all(baseCalls)
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
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(contactId) {
    if (!contactId) return
    const res = await api.get(`/api/conversations/${contactId}/messages`)
    setMessages(res.data)
  }

  useEffect(() => {
    loadAll()
  }, [user?.id, filter, windowFilter])

  useEffect(() => {
    if (selected?.id) {
      loadMessages(selected.id)
      if (canMonitor) {
        api.get(`/api/contacts/${selected.id}/assignment-history`).then((res) => setAssignmentHistory(res.data))
      }
      setLeadForm({
        name: selected.name || '',
        company: selected.company || '',
        stage: selected.stage || 'new',
        owner: selected.owner || '',
        notes: selected.notes || '',
        label: selected.label || 'New Enquiry',
        assigned_to: selected.assigned_to || '',
      })
    }
  }, [selected?.id])

  if (!user) return <Login onLogin={setUser} />

  function logout() {
    localStorage.removeItem('bosToken')
    localStorage.removeItem('bosUser')
    setAuth(null)
    setUser(null)
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!selected) return
    const payload = templateName ? { templateName } : { text: draft.trim() }
    if (!payload.templateName && !payload.text) return
    await api.post(`/api/conversations/${selected.id}/messages`, payload)
    setDraft('')
    setTemplateName('')
    await Promise.all([loadMessages(selected.id), loadAll()])
  }

  async function saveLead(event) {
    event.preventDefault()
    if (!selected) return
    await api.patch(`/api/contacts/${selected.id}`, leadForm)
    await loadAll()
    if (selected?.id && canMonitor) {
      const res = await api.get(`/api/contacts/${selected.id}/assignment-history`)
      setAssignmentHistory(res.data)
    }
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

  async function createErp(draftId) {
    await api.post(`/api/enquiry-drafts/${draftId}/create-erp`)
    await loadAll()
  }

  async function simulateInbound(event) {
    event.preventDefault()
    await api.post('/api/local/inbound-message', simulator)
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

  async function updateQuote(quote, status) {
    await api.patch(`/api/quotations/${quote.id}`, { status })
    await loadAll()
  }

  async function convertQuote(quote) {
    await api.post(`/api/quotations/${quote.id}/convert-order`)
    await loadAll()
  }

  async function updateOrder(order, patch) {
    await api.patch(`/api/orders/${order.id}`, patch)
    await loadAll()
  }

  async function sendTestMessage(event) {
    event.preventDefault()
    setTestResult('')
    try {
      const res = await api.post('/api/whatsapp/test-message', testMessage)
      setTestResult(`Accepted by Meta. To: ${res.data.to}. Message ID: ${res.data.messageId || 'not returned'}`)
    } catch (err) {
      setTestResult(err.response?.data?.error || 'Test message failed')
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <MessageCircle size={28} />
          <div>
            <h1>BOS WhatsApp CRM</h1>
            <span>Single number sales inbox</span>
          </div>
        </div>

        <div className="user-card">
          <Shield size={17} />
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button type="button" onClick={logout} title="Logout"><LogOut size={17} /></button>
        </div>

        <div className="filter-box">
          <Tag size={16} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {labels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
        <input className="sidebar-input" placeholder="Search customer / phone" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadAll() }} />
        <select className="sidebar-input" value={windowFilter} onChange={(e) => setWindowFilter(e.target.value)}>
          <option value="all">All windows</option>
          <option value="open">24h open</option>
          <option value="expired">Expired</option>
        </select>

        <button className="refresh-btn" type="button" onClick={loadAll} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              className={`conversation ${selected?.id === conversation.id ? 'active' : ''}`}
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
            >
              <span className="avatar"><UserRound size={18} /></span>
              <span className="conversation-copy">
                <strong>{conversation.name || conversation.phone}</strong>
                <small>{conversation.label} - {conversation.assigned_name || 'Unassigned'}</small>
                <small>{conversation.last_message || 'No message yet'}</small>
              </span>
              <span className={`window-dot ${conversation.reply_window_open ? 'open' : 'expired'}`} title="24-hour window" />
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">WhatsApp Sales Inbox</span>
            <h2>{selected?.name || 'No conversation selected'}</h2>
          </div>
          <div className="status-strip">
            <span className={status?.whatsappTokenSet ? 'ok' : 'warn'}><CheckCircle2 size={15} /> API Token</span>
            <span className={selected?.reply_window_open ? 'ok' : 'warn'}><Clock3 size={15} /> {selected?.reply_window_open ? '24h Open' : 'Template Required'}</span>
          </div>
        </header>

        {canMonitor && dashboard && (
          <section className="metrics">
            <div><BarChart3 size={18} /><strong>{dashboard.total_conversations}</strong><span>Total</span></div>
            <div><Users size={18} /><strong>{dashboard.unassigned}</strong><span>Unassigned</span></div>
            <div><Clock3 size={18} /><strong>{dashboard.open_windows}</strong><span>Open Window</span></div>
            <div><AlertTriangle size={18} /><strong>{dashboard.expired_windows}</strong><span>Expired</span></div>
          </section>
        )}

        <div className="work-grid">
          <section className="chat-panel">
            <div className="message-list">
              {messages.map((message) => (
                <div className={`message ${message.direction}`} key={message.id}>
                  <span>{message.body}</span>
                  <small>{message.type} - {message.status}</small>
                </div>
              ))}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selected?.reply_window_open ? 'Type WhatsApp reply' : '24-hour window expired, use template'} disabled={Boolean(templateName)} />
              <select value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
                <option value="">Text Reply</option>
                {templates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}
              </select>
              <button type="submit" title="Send"><Send size={18} /></button>
            </form>
          </section>

          <aside className="lead-panel">
            <form className="form-block" onSubmit={saveLead}>
              <div className="section-title"><UserRound size={18} /><h3>Lead Control</h3></div>
              <input placeholder="Customer name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
              <input placeholder="Company" value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} />
              <select value={leadForm.label} onChange={(e) => setLeadForm({ ...leadForm, label: e.target.value })}>
                {labels.filter((label) => label !== 'all').map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
              <select value={leadForm.stage} onChange={(e) => setLeadForm({ ...leadForm, stage: e.target.value })}>
                {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
              {canMonitor && (
                <select value={leadForm.assigned_to} onChange={(e) => setLeadForm({ ...leadForm, assigned_to: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.filter((item) => item.role === 'sales').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
              {canMonitor && <input placeholder="Assignment reason" value={leadForm.assignment_reason || ''} onChange={(e) => setLeadForm({ ...leadForm, assignment_reason: e.target.value })} />}
              <textarea placeholder="Notes" value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} />
              <button type="submit">Save Lead</button>
            </form>

            {canMonitor && (
              <div className="data-section embedded setup-panel">
                <div className="section-title"><Users size={18} /><h3>Assignment History</h3></div>
                <div className="mini-list">
                  {assignmentHistory.slice(0, 5).map((item) => (
                    <div className="mini-row" key={item.id}>
                      <strong>{item.from_user_name || 'Unassigned'} {'->'} {item.to_user_name || 'Unassigned'}</strong>
                      <span>{item.changed_by_name || 'System'} - {item.reason || 'No reason'}</span>
                    </div>
                  ))}
                  {!assignmentHistory.length && <small className="test-result">No reassignment yet</small>}
                </div>
              </div>
            )}

            {canMonitor && whatsappConfig && (
              <div className="data-section embedded setup-panel">
                <div className="section-title"><MessageCircle size={18} /><h3>Meta WhatsApp Setup</h3></div>
                <div className="setup-grid">
                  <span className={whatsappConfig.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
                  <span className={whatsappConfig.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
                  <span className={whatsappConfig.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
                </div>
                <div className="setup-copy">
                  <span>Webhook: {whatsappConfig.callbackUrl}</span>
                  <span>Verify token: {whatsappConfig.verifyToken}</span>
                  <span>API version: {whatsappConfig.apiVersion}</span>
                </div>
                <form className="test-form" onSubmit={sendTestMessage}>
                  <input placeholder="Customer number with country code" value={testMessage.to} onChange={(e) => setTestMessage({ ...testMessage, to: e.target.value })} />
                  <input placeholder="Test message" value={testMessage.text} onChange={(e) => setTestMessage({ ...testMessage, text: e.target.value })} />
                  <button type="submit">Send Test</button>
                </form>
                {testResult && <small className="test-result">{testResult}</small>}
              </div>
            )}

            {canMonitor && (
              <div className="data-section embedded setup-panel">
                <div className="section-title"><MessageCircle size={18} /><h3>Local WhatsApp Inbound Test</h3></div>
                <form className="sim-form" onSubmit={simulateInbound}>
                  <input placeholder="Customer number with country code" value={simulator.phone} onChange={(e) => setSimulator({ ...simulator, phone: e.target.value })} />
                  <input placeholder="Customer name" value={simulator.name} onChange={(e) => setSimulator({ ...simulator, name: e.target.value })} />
                  <textarea placeholder="Customer WhatsApp message" value={simulator.message} onChange={(e) => setSimulator({ ...simulator, message: e.target.value })} />
                  <button type="submit">Capture Message</button>
                </form>
              </div>
            )}

            <div className="data-section embedded">
              <div className="section-title"><FileText size={18} /><h3>WhatsApp Enquiry Drafts</h3></div>
              <div className="draft-list">
                {drafts.slice(0, 5).map((item) => (
                  <div className="draft-row" key={item.id}>
                    <strong>{item.contact_name || selected?.name || 'Customer'}</strong>
                    <span>Grade: {item.grade || '-'} | Size: {item.size || '-'} | Qty: {item.quantity || '-'}</span>
                    <small>{item.source} - {item.status}</small>
                    {item.status === 'draft' && (
                      <div className="draft-actions">
                        <input placeholder="Rate" value={quoteRates[item.id] || ''} onChange={(e) => setQuoteRates({ ...quoteRates, [item.id]: e.target.value })} />
                        <button type="button" onClick={() => createQuoteFromDraft(item)}>Create Quote</button>
                      </div>
                    )}
                    {item.status === 'draft' && <button type="button" onClick={() => createErp(item.id)}>Create ERP</button>}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {canMonitor && dashboard?.labels && (
          <section className="label-grid">
            {dashboard.labels.map((item) => (
              <button key={item.label} type="button" onClick={() => setFilter(item.label)}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </section>
        )}

        {user.role === 'admin' && (
          <section className="data-section">
            <div className="section-title"><Users size={18} /><h3>User Management</h3></div>
            <form className="user-form" onSubmit={createUser}>
              <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <input placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="sales">sales</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit">Create User</button>
            </form>
            <div className="mini-list">
              {users.map((item) => (
                <div className="user-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.email} - {item.role}</span>
                  <button type="button" onClick={() => toggleUser(item)}>{item.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="sales-docs">
          <div className="data-section">
            <div className="section-title"><FileText size={18} /><h3>Quotations</h3></div>
            <div className="doc-list">
              {quotations.slice(0, 8).map((quote) => (
                <div className="doc-row" key={quote.id}>
                  <strong>{quote.quote_no}</strong>
                  <span>{quote.contact_name || 'Customer'} - {quote.status}</span>
                  <b>₹{Number(quote.amount || 0).toLocaleString('en-IN')}</b>
                  <div className="doc-actions">
                    <button type="button" onClick={() => updateQuote(quote, 'sent')}>Sent</button>
                    <button type="button" onClick={() => updateQuote(quote, 'lost')}>Lost</button>
                    <button type="button" onClick={() => convertQuote(quote)}>Order</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="data-section">
            <div className="section-title"><PackageCheck size={18} /><h3>Sales Orders</h3></div>
            <div className="doc-list">
              {orders.slice(0, 8).map((order) => (
                <div className="doc-row" key={order.id}>
                  <strong>{order.order_no}</strong>
                  <span>{order.contact_name || 'Customer'} - Pay: {order.payment_status} - Dispatch: {order.dispatch_status}</span>
                  <b>₹{Number(order.amount || 0).toLocaleString('en-IN')}</b>
                  <div className="doc-actions">
                    <button type="button" onClick={() => updateOrder(order, { payment_status: 'paid' })}>Paid</button>
                    <button type="button" onClick={() => updateOrder(order, { dispatch_status: 'dispatched' })}>Dispatch</button>
                    <button type="button" onClick={() => updateOrder(order, { status: 'closed' })}>Close</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
