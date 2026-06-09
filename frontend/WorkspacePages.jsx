/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Headphones,
  HelpCircle,
  Info,
  Inbox,
  Link2,
  Megaphone,
  MessageCircle,
  PackageCheck,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingCart,
  Bot,
  Clock3,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { api } from './apiClient'
import {
  DEFAULT_BILLING_FIELDS,
  DEFAULT_VOICE_WEEKLY_HOURS,
  WEEK_DAYS,
  downloadCsv,
  formatMoney,
  fromCsv,
  initials,
  parseCsv,
  toCsv,
} from './utils.jsx'

export function PlatformPage({
  activePage,
  tenants,
  tenantForm,
  setTenantForm,
  clientAdminForm,
  setClientAdminForm,
  selectedTenantId,
  setSelectedTenantId,
  platformStatus,
  platformLoading,
  onCreateTenant,
  onCreateClientAdmin,
  onOpenStatus,
  onLoadStatus,
  onEnterClientCrm,
  onRemoveClientAccess,
}) {
  const clientTenants = tenants.filter((tenant) => tenant.slug !== 'platform')
  const selectedTenant = clientTenants.find((tenant) => tenant.id === selectedTenantId) || clientTenants[0]
  const connectedClients = clientTenants.filter((tenant) => tenant.onboardingStatus === 'whatsapp_mapped').length
  const activeClients = clientTenants.filter((tenant) => tenant.status === 'active').length

  function selectTenant(tenantId) {
    setSelectedTenantId(tenantId)
    setClientAdminForm({ ...clientAdminForm, tenantId })
  }

  return (
    <section className="workspace-page platform-page">
      <div className="workspace-head">
        <div>
          <h2>Client Company Control</h2>
        <span>Create client companies, assign the first admin, verify WhatsApp account status, and access client CRM workspaces for approved support.</span>
        </div>
      </div>

      <div className="kpi-grid platform-kpis">
        <button type="button"><strong>{clientTenants.length}</strong><span>Client Companies</span></button>
        <button type="button"><strong>{activeClients}</strong><span>Active Clients</span></button>
        <button type="button"><strong>{connectedClients}</strong><span>WhatsApp Mapped</span></button>
        <button type="button"><strong>{tenants.length}</strong><span>Total Tenants</span></button>
      </div>

      {activePage === 'platformTenants' && (
        <div className="platform-grid">
          <section className="table-module">
            <div className="module-title"><Building2 size={18} /><h3>Create Client Company</h3></div>
            <form className="platform-form" onSubmit={onCreateTenant}>
              <label>Company Name<input value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} placeholder="ABC Steels Pvt Ltd" /></label>
              <label>Slug<input value={tenantForm.slug} onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value })} placeholder="abc-steels" /></label>
              <label>Industry<input value={tenantForm.industry} onChange={(e) => setTenantForm({ ...tenantForm, industry: e.target.value })} placeholder="Steel / Retail / Service" /></label>
              <label>Plan<input value={tenantForm.plan} onChange={(e) => setTenantForm({ ...tenantForm, plan: e.target.value })} placeholder="starter" /></label>
              <label>Status<select value={tenantForm.status} onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
              <label>Business Phone<input value={tenantForm.businessPhone} onChange={(e) => setTenantForm({ ...tenantForm, businessPhone: e.target.value })} placeholder="919876543210" /></label>
              <label>Business Email<input value={tenantForm.businessEmail} onChange={(e) => setTenantForm({ ...tenantForm, businessEmail: e.target.value })} placeholder="admin@abcsteels.com" /></label>
              <label>Meta Business ID<input value={tenantForm.metaBusinessId} onChange={(e) => setTenantForm({ ...tenantForm, metaBusinessId: e.target.value })} placeholder="Optional" /></label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit"><CheckCircle2 size={16} /> Create Client</button>
              </div>
            </form>
          </section>

          <section className="table-module">
            <div className="module-title"><UserPlus size={18} /><h3>Create First Client Admin</h3></div>
            <form className="platform-form" onSubmit={onCreateClientAdmin}>
              <label>Client Company<select value={clientAdminForm.tenantId || selectedTenant?.id || ''} onChange={(e) => selectTenant(e.target.value)}><option value="">Select client</option>{clientTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
              <label>Admin Name<input value={clientAdminForm.name} onChange={(e) => setClientAdminForm({ ...clientAdminForm, name: e.target.value })} placeholder="Company Admin" /></label>
              <label>Admin Email<input value={clientAdminForm.email} onChange={(e) => setClientAdminForm({ ...clientAdminForm, email: e.target.value })} placeholder="admin@client.com" /></label>
              <label>Temporary Password<input type="password" value={clientAdminForm.password} onChange={(e) => setClientAdminForm({ ...clientAdminForm, password: e.target.value })} placeholder="12+ chars with number & symbol" /></label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit"><UserPlus size={16} /> Create Admin</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {activePage === 'platformTenants' && (
        <section className="table-module">
          <div className="module-title"><Users size={18} /><h3>Client Companies</h3></div>
          <div className="platform-tenant-list">
            {!clientTenants.length && <EmptyState title="No client companies" text="Create the first client company to start onboarding." />}
            {clientTenants.map((tenant) => (
              <div className="platform-tenant-row" key={tenant.id}>
                <div>
                  <strong>{tenant.name}</strong>
                  <span>{tenant.slug} - {tenant.industry || 'General'} - {tenant.plan || 'starter'}</span>
                  <small>{tenant.businessEmail || 'No email'} - {tenant.businessPhone || 'No phone'}</small>
                </div>
                <b className={`status-${tenant.status === 'active' ? 'active' : 'inactive'}`}>{tenant.status}</b>
                <i>{tenant.onboardingStatus || 'pending'}</i>
                <span>{tenant.activeUserCount || 0}/{tenant.userCount || 0} users</span>
                <button type="button" onClick={() => onOpenStatus(tenant.id)}>Status</button>
                <button
                  className="platform-enter-btn"
                  type="button"
                  onClick={() => onEnterClientCrm(tenant.id)}
                  disabled={tenant.status !== 'active'}
                >
                  Enter CRM
                </button>
                <button
                  className="platform-remove-btn"
                  type="button"
                  onClick={() => onRemoveClientAccess(tenant)}
                  disabled={tenant.status === 'suspended'}
                >
                  Remove Access
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {activePage === 'platformStatus' && (
        <section className="table-module">
          <div className="module-title"><Activity size={18} /><h3>Client Status</h3></div>
          <div className="platform-status-toolbar">
            <select value={selectedTenant?.id || ''} onChange={(e) => selectTenant(e.target.value)}>
              <option value="">Select client</option>
              {clientTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
            <button type="button" onClick={() => onLoadStatus(selectedTenant?.id)} disabled={!selectedTenant || platformLoading}>Load Status</button>
          </div>

          {!platformStatus && <EmptyState title="No client selected" text="Select a client company and load status." />}

          {platformStatus && (
            <div className="platform-status-grid">
              <div className="mini-row">
                <strong>{platformStatus.tenant?.name}</strong>
                <span>{platformStatus.tenant?.slug} - {platformStatus.tenant?.status} - {platformStatus.tenant?.onboardingStatus}</span>
              </div>
              <div className="mini-row">
                <strong>{platformStatus.totals?.contacts || 0}</strong>
                <span>Contacts</span>
              </div>
              <div className="mini-row">
                <strong>{platformStatus.totals?.messages || 0}</strong>
                <span>Messages</span>
              </div>
              <section className="table-module">
                <div className="module-title"><Users size={18} /><h3>User Summary</h3></div>
                {platformStatus.users?.map((item) => (
                  <div className="mini-row" key={`${item.role}-${item.active}`}>
                    <strong>{item.role} - {item.active ? 'active' : 'inactive'}</strong>
                    <span>{item.count} users</span>
                  </div>
                ))}
                {!platformStatus.users?.length && <EmptyState title="No users" text="Create the first admin for this client." />}
              </section>
              <section className="table-module">
                <div className="module-title"><MessageCircle size={18} /><h3>WhatsApp Accounts</h3></div>
                {platformStatus.whatsappAccounts?.map((account) => (
                  <div className="mini-row" key={account.id}>
                    <strong>{account.displayPhoneNumber || 'No display number'}</strong>
                    <span>Phone ID: {account.phoneNumberId || '-'}</span>
                    <small>{account.active ? 'Active mapping' : 'Inactive mapping'}</small>
                  </div>
                ))}
                {!platformStatus.whatsappAccounts?.length && <EmptyState title="WhatsApp not mapped" text="Client Admin must map/connect their WhatsApp phone number before inbound routing is live." />}
              </section>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

export function ConnectionStrip({ status, whatsappConfig, canMonitor }) {
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

export function ConversationList({ conversations, selectedId, onSelect, onReset }) {
  return (
    <div className="conversation-list">
      {!conversations.length && (
        <div className="empty-list">
          <strong>No conversations found</strong>
          <span>Clear the current filters or capture a test inbound message from Settings to verify the inbox flow.</span>
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

export function getReplyWindowInfo(selected, currentTime) {
  if (!selected) {
    return {
      open: false,
      label: 'No conversation selected',
      helper: 'Select a customer to see reply-window status.',
      className: 'neutral',
    }
  }

  if (selected.opted_out) {
    return {
      open: false,
      label: 'Sending Locked',
      helper: 'Customer has opted out.',
      className: 'danger',
    }
  }

  if (!selected.last_inbound_at) {
    return {
      open: false,
      label: 'Template Required',
      helper: 'No inbound customer message found.',
      className: 'warn',
    }
  }

  const expiresAt = new Date(selected.last_inbound_at).getTime() + (24 * 60 * 60 * 1000)
  const remainingMs = Math.max(0, expiresAt - currentTime)

  if (selected.reply_window_open && remainingMs > 0) {
    const totalMinutes = Math.ceil(remainingMs / (60 * 1000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return {
      open: true,
      label: 'Reply Window Open',
      helper: `${hours}h ${minutes}m left for free-form reply.`,
      className: 'ok',
    }
  }

  return {
    open: false,
    label: 'Reply Window Expired',
    helper: 'Use approved WhatsApp template.',
    className: 'warn',
  }
}

export function ChatHeader({ selected, onProfile, currentTime }) {
  const windowInfo = getReplyWindowInfo(selected, currentTime)

  return (
    <header className="chat-header">
      <span className="avatar large">{initials(selected?.name || selected?.phone)}</span>

      <div className="chat-title-block">
        <h2>{selected?.name || 'No conversation selected'}</h2>
        <span>{selected?.phone || ''}</span>
      </div>

      <div className="reply-window-badge-wrap">
        <span className={`reply-window-badge ${windowInfo.className}`}>
          {windowInfo.label}
        </span>
        <small>{windowInfo.helper}</small>
      </div>

      <span className={`status-pill ${selected?.reply_window_open ? 'ok' : 'warn'}`}>
        {selected?.label || 'No label'}
      </span>

      <button className="profile-toggle" type="button" onClick={onProfile} disabled={!selected}>
        <UserRound size={18} />
      </button>
    </header>
  )
}

export function ProfilePanel({ selected, leadForm, setLeadForm, users, canMonitor, stages, labels, onSave, assignmentHistory, timeline }) {
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

export function DraftsPanel({ drafts, quoteRates, setQuoteRates, onQuote, onErp }) {
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

export function DashboardPage({ dashboard, conversations, drafts, products, lowStockProducts, quotations, orders, onboarding, whatsappHealth, isAdmin, canManage, onOpenPage }) {
  
    const healthStatusLabel = whatsappHealth?.setupComplete
    ? 'Healthy'
    : whatsappHealth?.connected
      ? 'Needs Review'
      : 'Not Connected'

  const healthStatusClass = whatsappHealth?.setupComplete
    ? 'ok'
    : whatsappHealth?.connected
      ? 'warn'
      : 'danger'

  const tokenModeLabel = whatsappHealth?.tokenMode === 'tenant_embedded_signup'
    ? 'Tenant Embedded Signup'
    : whatsappHealth?.tokenMode === 'env_fallback'
      ? 'Environment Fallback'
      : 'Not Configured'

  const formatHealthTime = (value) => (
    value ? new Date(value).toLocaleString() : '-'
  )
  
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
      <section className="dashboard-launchpad">
        <div className="launchpad-copy">
          <span className="launchpad-kicker">Workspace setup</span>
          <h3>{onboarding?.connected ? 'Your WhatsApp operations workspace is connected.' : 'Complete your business workspace setup.'}</h3>
          <p>
            {onboarding?.connected
              ? 'Manage conversations, templates and operations controls from the secure dashboard.'
              : 'Connect Meta WhatsApp, configure templates and prepare your team before customer messaging.'}
          </p>
        </div>
        <div className="launchpad-actions">
          {isAdmin && (
            <button type="button" className={onboarding?.connected ? 'complete' : 'primary'} onClick={() => onOpenPage(onboarding?.connected ? 'settings' : 'connectWhatsApp')}>
              <MessageCircle size={17} />
              {onboarding?.connected ? 'Meta Connected' : 'Connect Meta WhatsApp'}
            </button>
          )}
          {canManage && <button type="button" onClick={() => onOpenPage('settings')}><Settings size={17} /> Settings & Templates</button>}
          <button type="button" onClick={() => onOpenPage('inbox')}><Inbox size={17} /> Inbox & Contacts</button>
          <button type="button" onClick={() => onOpenPage('orders')}><ShoppingCart size={17} /> Orders</button>
        </div>
      </section>

      {canManage && (
        <section className="whatsapp-health-card">
          <div className="health-head">
            <div>
              <span className="launchpad-kicker">WhatsApp Health</span>
              <h3>Connection & activity status</h3>
            </div>
            <span className={`health-pill ${healthStatusClass}`}>
              {healthStatusLabel}
            </span>
          </div>

          <div className="health-grid">
            <div>
              <small>Connection</small>
              <strong>{whatsappHealth?.connected ? 'Connected' : 'Not connected'}</strong>
            </div>
            <div>
              <small>Token Mode</small>
              <strong>{tokenModeLabel}</strong>
            </div>
            <div>
              <small>Phone</small>
              <strong>{whatsappHealth?.account?.displayPhoneNumber || '-'}</strong>
            </div>
            <div>
              <small>Phone Number ID</small>
              <strong>{whatsappHealth?.account?.phoneNumberId || '-'}</strong>
            </div>
            <div>
              <small>Last Inbound</small>
              <strong>{formatHealthTime(whatsappHealth?.activity?.lastInboundAt)}</strong>
            </div>
            <div>
              <small>Last Outbound</small>
              <strong>{formatHealthTime(whatsappHealth?.activity?.lastOutboundAt)}</strong>
            </div>
          </div>

          <div className="health-webhook">
            <small>Webhook URL</small>
            <code>{whatsappHealth?.webhookUrl || '-'}</code>
          </div>

          {whatsappHealth?.setupIssues?.length > 0 && (
            <div className="health-issues">
              {whatsappHealth.setupIssues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          )}

          <div className="inline-actions">
            {isAdmin && !whatsappHealth?.connected && (
              <button type="button" onClick={() => onOpenPage('connectWhatsApp')}>
                Connect Meta WhatsApp
              </button>
            )}
            <button type="button" onClick={() => onOpenPage('settings')}>
              Open WhatsApp Settings
            </button>
          </div>
        </section>
      )}

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

export function AutoReplyRulesManager({
  rules = [],
  form,
  setForm,
  editingId,
  saving,
  loading,
  actionLoadingId,
  canManage = true,
  onSave,
  onEdit,
  onCancelEdit,
  onToggle,
  onDelete,
}) {
  const activeRules = rules.filter((rule) => rule.active !== false)

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
  }

  return (
    <section className="table-module">
      <div className="module-title">
        <Bot size={18} />
        <h3>Auto Reply Rules</h3>
      </div>

      <div className="suite-policy-note">
        Rules reply only after a customer inbound message. Backend still enforces opt-out and WhatsApp 24-hour customer service window.
        {!canManage && ' Admin access is required to change rules.'}
      </div>

      <div className="kpi-grid">
        <button type="button">
          <strong>{rules.length}</strong>
          <span>Total Rules</span>
        </button>
        <button type="button">
          <strong>{activeRules.length}</strong>
          <span>Active Rules</span>
        </button>
        <button type="button">
          <strong>{rules.filter((rule) => rule.send_once_per_contact).length}</strong>
          <span>Once Per Contact</span>
        </button>
        <button type="button">
          <strong>{loading ? '...' : 'Ready'}</strong>
          <span>Rule Engine</span>
        </button>
      </div>

      <form className="knowledge-form" onSubmit={onSave}>
        <input
          placeholder="Rule name, example: Price enquiry auto reply"
          value={form.name}
          onChange={(event) => patchForm({ name: event.target.value })}
          disabled={!canManage}
        />

        <div className="settings-form-grid compact">
          <label>
            Trigger Type
            <select
              value={form.triggerType}
              onChange={(event) => patchForm({ triggerType: event.target.value })}
              disabled={!canManage}
            >
              <option value="contains">Contains</option>
              <option value="starts_with">Starts with</option>
              <option value="exact">Exact match</option>
            </select>
          </label>

          <label>
            Trigger Text
            <input
              value={form.triggerValue}
              onChange={(event) => patchForm({ triggerValue: event.target.value })}
              placeholder="price"
              disabled={!canManage}
            />
          </label>

          <label>
            Priority
            <input
              type="number"
              min="1"
              max="10000"
              value={form.priority}
              onChange={(event) => patchForm({ priority: event.target.value })}
              disabled={!canManage}
            />
          </label>
        </div>

        <textarea
          placeholder="Reply text to send inside the 24-hour customer service window"
          value={form.replyText}
          onChange={(event) => patchForm({ replyText: event.target.value.slice(0, 4096) })}
          disabled={!canManage}
        />

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(form.active)}
            onChange={(event) => patchForm({ active: event.target.checked })}
            disabled={!canManage}
          />
          Active
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(form.sendOncePerContact)}
            onChange={(event) => patchForm({ sendOncePerContact: event.target.checked })}
            disabled={!canManage}
          />
          Send only once per contact
        </label>

        <div className="doc-actions">
          {editingId && (
            <button type="button" onClick={onCancelEdit} disabled={saving || !canManage}>
              Cancel Edit
            </button>
          )}

          <button type="submit" disabled={saving || !canManage}>
            {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Add Rule'}
          </button>
        </div>
      </form>

      <div className="knowledge-list">
        {!rules.length && (
          <EmptyState
            title="No auto reply rules"
            text="Add rules like price, catalogue, dispatch, payment, or support keywords."
          />
        )}

        {rules.map((rule) => (
          <div className="knowledge-row" key={rule.id}>
            <strong>{rule.name}</strong>
            <span>
              {rule.trigger_type} &quot;{rule.trigger_value}&quot; | Priority {rule.priority} | {rule.active ? 'Active' : 'Inactive'}
            </span>
            <p>{rule.reply_text}</p>
            <small>
              {rule.send_once_per_contact ? 'Sends once per contact' : 'Can send every time it matches'}
              {rule.updated_at ? ` | Updated ${new Date(rule.updated_at).toLocaleString()}` : ''}
            </small>

            <div className="doc-actions">
              <button type="button" onClick={() => onEdit(rule)} disabled={Boolean(actionLoadingId) || !canManage}>
                Edit
              </button>

              <button type="button" onClick={() => onToggle(rule)} disabled={actionLoadingId === rule.id || !canManage}>
                {actionLoadingId === rule.id ? 'Updating...' : rule.active ? 'Disable' : 'Enable'}
              </button>

              <button type="button" onClick={() => onDelete(rule)} disabled={actionLoadingId === rule.id || !canManage}>
                {actionLoadingId === rule.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function BotStudioPage({
  appSettings,
  products,
  drafts,
  lowStockProducts,
  onOpenSettings,
  autoReplyRules,
  autoReplyRuleForm,
  setAutoReplyRuleForm,
  editingAutoReplyRuleId,
  autoReplyRulesLoading,
  autoReplyRuleSaving,
  autoReplyRuleActionLoading,
  canManageAutoReplyRules = true,
  onSaveAutoReplyRule,
  onEditAutoReplyRule,
  onCancelAutoReplyRuleEdit,
  onToggleAutoReplyRule,
  onDeleteAutoReplyRule,
}) {
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
                <AutoReplyRulesManager
          rules={autoReplyRules}
          form={autoReplyRuleForm}
          setForm={setAutoReplyRuleForm}
          editingId={editingAutoReplyRuleId}
          loading={autoReplyRulesLoading}
          saving={autoReplyRuleSaving}
          actionLoadingId={autoReplyRuleActionLoading}
          canManage={canManageAutoReplyRules}
          onSave={onSaveAutoReplyRule}
          onEdit={onEditAutoReplyRule}
          onCancelEdit={onCancelAutoReplyRuleEdit}
          onToggle={onToggleAutoReplyRule}
          onDelete={onDeleteAutoReplyRule}
        />
      </div>
    </section>
  )
}

export function EmptyState({ title, text }) {
  return <div className="empty-list"><strong>{title}</strong><span>{text}</span></div>
}

export function WorkspaceHeading({ title, description, action }) {
  return (
    <div className="workspace-head workspace-head-structured">
      <div>
        <span className="workspace-eyebrow">Workspace Module</span>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>
      {action}
    </div>
  )
}

export function WorkspaceTabs({ tabs, activeTab, onChangeTab }) {
  return (
    <nav className="workspace-tabs" aria-label="Module sections">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => onChangeTab(tab.id)}>
            <Icon size={17} />
            <span>{tab.label}</span>
            {tab.count > 0 && <b>{tab.count}</b>}
          </button>
        )
      })}
    </nav>
  )
}

export function MessagePreview({
  selected,
  body,
  emptyText = 'Select content to see preview',
  type = 'text',
  statusText = '',
}) {
  const cleanBody = String(body || '').trim()
  const label = type === 'template'
    ? 'Template'
    : type === 'text'
      ? 'Text'
      : type

  return (
    <aside className="suite-preview-card suite-preview-card-pro">
      <div className="suite-preview-head">
        <div>
          <h3>WhatsApp Preview</h3>
          <span>{selected ? `To: ${selected.name || selected.phone}` : 'Select a contact'}</span>
        </div>
        <b>{label}</b>
      </div>

      <div className="suite-preview-phone suite-preview-phone-pro">
        <small>Today</small>

        {cleanBody ? (
          <div className="suite-preview-bubble">
            <p>{cleanBody}</p>
            <time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ) : (
          <div className="suite-preview-empty">
            <MessageCircle size={45} />
            <span>{emptyText}</span>
          </div>
        )}
      </div>

      <div className="suite-preview-footer">
        {selected ? (
          <>
            <span>{selected.phone}</span>
            <span className={selected.opted_out ? 'danger' : selected.reply_window_open ? 'ok' : 'warn'}>
              {selected.opted_out ? 'Opted out' : selected.reply_window_open ? '24h open' : 'Template only'}
            </span>
          </>
        ) : (
          <span>No customer selected</span>
        )}
      </div>

      {statusText && <div className="suite-preview-status">{statusText}</div>}
    </aside>
  )
}

export function SingleMessagePage({
  contacts,
  selected,
  selectedId,
  onSelectContact,
  templates,
  draft,
  setDraft,
  templateName,
  setTemplateName,
  onSend,
  sendError,
  sending,
}) {
  const [messageType, setMessageType] = useState('text')
  const [guideOpen, setGuideOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
const [mediaType, setMediaType] = useState('image')
const [mediaUrl, setMediaUrl] = useState('')
const [caption, setCaption] = useState('')
const [fileName, setFileName] = useState('')
const [mediaFileName, setMediaFileName] = useState('')

  const selectedTemplate = templates.find((template) => (
    template.id === templateName || template.name === templateName
  ))

  const cleanSearch = contactSearch.trim().toLowerCase()

  const filteredContacts = contacts.filter((contact) => {
    if (!cleanSearch) return true

    return [
      contact.name,
      contact.phone,
      contact.company,
      contact.label,
      contact.stage,
    ].some((value) => String(value || '').toLowerCase().includes(cleanSearch))
  })

  const messageTypes = [
    {
      id: 'text',
      label: 'Text',
      enabled: true,
      helper: 'Free-form message. Allowed only inside the WhatsApp 24-hour customer service window.',
    },
    {
      id: 'template',
      label: 'Template',
      enabled: true,
      helper: 'Approved WhatsApp template. Required outside the 24-hour customer service window.',
    },
    {
      id: 'media',
      label: 'Media',
      enabled: true,
      helper: 'Send image, video, document, or audio by device upload or public HTTPS media URL.',
    },
    {
      id: 'interactive',
      label: 'Interactive',
      enabled: false,
      helper: 'Needs backend interactive list/button payload support.',
    },
    {
      id: 'payment',
      label: 'Payment',
      enabled: false,
      helper: 'Needs Meta payment/commercial setup and backend order/payment route.',
    },
    {
      id: 'catalog',
      label: 'Catalog',
      enabled: false,
      helper: 'Needs Meta Commerce catalog/product IDs connected to this tenant.',
    },
    {
      id: 'location',
      label: 'Location',
      enabled: false,
      helper: 'Needs backend location payload send route.',
    },
  ]

  const activeType = messageTypes.find((type) => type.id === messageType) || messageTypes[0]
  const mediaSourceLabel = mediaFileName || mediaUrl

  const mediaPreviewText = mediaSourceLabel
    ? `[${mediaType.toUpperCase()}] ${caption || fileName || mediaSourceLabel}`
    : `[${mediaType.toUpperCase()}] Upload a file or add a public HTTPS URL`
  const previewBody = messageType === 'template'
    ? selectedTemplate?.body
    : messageType === 'media'
      ? mediaPreviewText
      : draft

  const textLocked = !selected || selected.opted_out || !selected.reply_window_open
  const templateLocked = !selected || selected.opted_out
  const mediaLocked = !selected || selected.opted_out || !selected.reply_window_open

  const canSubmit = Boolean(selected)
    && !selected.opted_out
    && !sending
    && activeType.enabled
    && (
      (messageType === 'text' && selected.reply_window_open && draft.trim())
      || (messageType === 'template' && selectedTemplate)
      || (messageType === 'media' && selected.reply_window_open && mediaType && (mediaUrl.trim() || mediaFileName))
    )

  function switchType(type) {
    const nextType = messageTypes.find((item) => item.id === type)

    if (!nextType?.enabled) return

    setMessageType(type)

    if (type === 'text') {
      setTemplateName('')
    }

    if (type === 'template') {
      setDraft('')
    }

    if (type === 'media') {
      setDraft('')
      setTemplateName('')
    }
  }

  function chooseContact(event) {
    onSelectContact(event.target.value)
  }

  function chooseTemplate(event) {
    setDraft('')
    setTemplateName(event.target.value)
  }

  function changeText(event) {
    setTemplateName('')
    setDraft(event.target.value.slice(0, 4096))
  }

  return (
    <section className="suite-page send-single-pro">
      <div className="send-single-title">
        <div>
          <span className="workspace-eyebrow">Send Message</span>
          <h2>Single WhatsApp Message</h2>
          <p>Send a policy-safe text, template, or media message to one tenant contact.</p>
        </div>

        <div className="send-single-status">
          <span className={selected?.opted_out ? 'danger' : selected?.reply_window_open ? 'ok' : 'warn'}>
            {selected
              ? selected.opted_out
                ? 'Sending locked'
                : selected.reply_window_open
                  ? '24h window open'
                  : 'Template required'
              : 'Select contact'}
          </span>
        </div>
      </div>

      <button className="suite-guide-toggle send-guide-toggle" type="button" onClick={() => setGuideOpen((open) => !open)}>
        <ChevronDown size={17} />
        How to use? Click to expand
      </button>

      {guideOpen && (
        <div className="suite-guide send-guide-panel">
          <div>
            <p>Use this screen only for one-to-one customer communication.</p>
            <ul>
              <li><strong>Text:</strong> allowed only when the customer has messaged inside the last 24 hours.</li>
              <li><strong>Template:</strong> use an approved Meta template when the 24-hour window is closed.</li>
              <li><strong>Media:</strong> allowed inside the 24-hour window using a public HTTPS media URL.</li>
              <li><strong>Opt-out:</strong> opted-out contacts are blocked from all sends.</li>
            </ul>
          </div>
          <div className="suite-guide-visual">
            <Shield size={42} />
            <strong>Policy guarded</strong>
            <span>Tenant-safe WhatsApp delivery</span>
          </div>
        </div>
      )}

      <div className="suite-compose-layout send-single-layout">
        <form className="suite-send-form send-single-form" onSubmit={onSend}>
          <input type="hidden" name="messageType" value={messageType} />

          <section className="send-card">
            <div className="send-card-head">
              <h3>Customer</h3>
              <span>Tenant contacts only</span>
            </div>

            <div className="send-contact-grid">
              <label>
                Search Contact
                <input
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Search by name, phone, company, label"
                />
              </label>

              <label>
                Phone Number / Contact
                <select value={selectedId || ''} onChange={chooseContact} required>
                  <option value="">Select tenant contact</option>
                  {filteredContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.phone} - {contact.name || 'Customer'}{contact.opted_out ? ' - Opted out' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selected && (
              <div className="send-contact-summary">
                <div>
                  <strong>{selected.name || 'Customer'}</strong>
                  <span>{selected.phone}</span>
                </div>
                <b className={selected.opted_out ? 'danger' : selected.reply_window_open ? 'ok' : 'warn'}>
                  {selected.opted_out ? 'Opted out' : selected.reply_window_open ? 'Text/media allowed' : 'Template only'}
                </b>
              </div>
            )}
          </section>

          <section className="send-card">
            <div className="send-card-head">
              <h3>Message Type</h3>
              <span>{activeType.helper}</span>
            </div>

            <div className="suite-type-tabs send-type-tabs">
              {messageTypes.map((type) => (
                <button
                  className={`${messageType === type.id ? 'active' : ''} ${!type.enabled ? 'locked' : ''}`}
                  key={type.id}
                  type="button"
                  onClick={() => switchType(type.id)}
                  disabled={!type.enabled}
                  title={type.helper}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <div className="send-locked-note">
              <Info size={16} />
              <span>
                Interactive, Payment, Catalog and Location remain locked until their backend + Meta payload routes are added.
              </span>
            </div>
          </section>

          <section className="send-card send-message-body-card">
            {messageType === 'text' && (
              <>
                <div className="send-card-head">
                  <h3>Text Message</h3>
                  <span>{draft.length}/4096</span>
                </div>

                <label>
                  Message
                  <textarea
                    value={draft}
                    onChange={changeText}
                    placeholder={selected?.reply_window_open ? 'Type your WhatsApp reply...' : 'Free-form text requires an open 24-hour window'}
                    disabled={textLocked}
                    rows={6}
                  />
                </label>

                {!selected && <div className="suite-policy-note">Select a contact before typing a message.</div>}
                {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
                {!selected?.opted_out && selected && !selected.reply_window_open && (
                  <div className="suite-policy-note">24-hour window expired. Switch to Template to send an approved WhatsApp template.</div>
                )}
              </>
            )}

            {messageType === 'template' && (
              <>
                <div className="send-card-head">
                  <h3>Approved Template</h3>
                  <span>{templates.length} available</span>
                </div>

                <label>
                  Select Template
                  <select value={templateName} onChange={chooseTemplate} disabled={templateLocked}>
                    <option value="">Select approved template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.language})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedTemplate && (
                  <div className="send-template-preview">
                    <strong>{selectedTemplate.name}</strong>
                    <span>{selectedTemplate.language || 'en'} · {selectedTemplate.category || 'template'}</span>
                    <p>{selectedTemplate.body}</p>
                  </div>
                )}

                {!selected && <div className="suite-policy-note">Select a contact before choosing a template.</div>}
                {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
              </>
            )}

{messageType === 'media' && (
  <>
    <div className="send-card-head">
      <h3>Media Message</h3>
      <span>Upload from device or send by public HTTPS URL.</span>
    </div>

    <div className="send-media-grid">
      <label>
        Media Type
        <select name="mediaType" value={mediaType} onChange={(event) => setMediaType(event.target.value)} disabled={mediaLocked}>
          <option value="image">Image</option>
          <option value="document">Document</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
      </label>

      <label>
        Upload From Device
       <input
  name="mediaFile"
  type="file"
  accept={
    mediaType === 'image'
      ? 'image/jpeg,image/png,image/webp'
      : mediaType === 'video'
        ? 'video/mp4,video/3gpp'
        : mediaType === 'audio'
          ? 'audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg'
          : '.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  disabled={mediaLocked}
  onChange={(event) => {
    const file = event.target.files?.[0]
    setMediaFileName(file?.name || '')

    if (file?.name && mediaType === 'document' && !fileName) {
      setFileName(file.name.slice(0, 240))
    }
  }}
/>
      </label>

      {mediaFileName && (
        <div className="send-selected-file">
          <strong>Selected file</strong>
          <span>{mediaFileName}</span>
        </div>
      )}
    </div>

    <div className="send-or-divider">
      <span>OR</span>
    </div>

    <label>
      Public HTTPS Media URL
      <input
        name="mediaUrl"
        value={mediaUrl}
        onChange={(event) => setMediaUrl(event.target.value)}
        placeholder="https://example.com/file.jpg"
        disabled={mediaLocked}
      />
    </label>

    {mediaType === 'document' && (
      <label>
        Document File Name
        <input
          name="fileName"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          placeholder="quotation.pdf"
          disabled={mediaLocked}
        />
      </label>
    )}

    {mediaType !== 'audio' && (
      <label>
        Caption
        <textarea
          name="caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value.slice(0, 1024))}
          placeholder="Optional caption"
          disabled={mediaLocked}
          rows={4}
        />
        <small>{caption.length}/1024</small>
      </label>
    )}

    <div className="suite-policy-note">
      Device upload sends media through backend to Meta first, then sends WhatsApp by media ID. URL mode sends by public HTTPS link.
    </div>

    <div className="suite-policy-note">
      Media sends are allowed only inside the 24-hour customer service window. Outside 24h, use an approved template.
    </div>

    {!selected && <div className="suite-policy-note">Select a contact before adding media.</div>}
    {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
    {!selected?.opted_out && selected && !selected.reply_window_open && (
      <div className="suite-policy-note danger">24-hour window expired. Media messages are locked. Use Template.</div>
    )}
  </>
)}

            {sendError && <div className="suite-policy-note danger">{sendError}</div>}
          </section>

          <div className="send-actions-bar">
            <div>
              <strong>Compliance check</strong>
              <span>
                {messageType === 'template'
                  ? 'Template must be active and approved for this tenant.'
                  : messageType === 'media'
                    ? 'Media requires open 24h window and a device file or public HTTPS URL.'
                    : 'Text requires open 24h customer service window.'}
              </span>
            </div>

            <button className="suite-primary-button send-submit-button" type="submit" disabled={!canSubmit}>
              <Send size={16} />
              {sending
                ? 'Sending...'
                : messageType === 'template'
                  ? 'Send Template'
                  : messageType === 'media'
                    ? 'Send Media'
                    : 'Send Text'}
            </button>
          </div>
        </form>

        <MessagePreview
          selected={selected}
          body={previewBody}
          type={messageType}
          emptyText={
            messageType === 'template'
              ? 'Select a template to preview'
              : messageType === 'media'
                ? 'Add media URL to preview'
                : 'Type a message to preview'
          }
          statusText={activeType.helper}
        />
      </div>
    </section>
  )
}

export function BulkMessagePage({ templates, contacts }) {
  const [activeTab, setActiveTab] = useState('csv')
  const [campaignName, setCampaignName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [rows, setRows] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [sendMode, setSendMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')

  const disabledTabs = new Set(['manual', 'filters', 'retargeting'])

  function csvPhone(row = {}) {
    return String(row.phone || row.Phone || row.mobile || row.Mobile || row.whatsapp || row.WhatsApp || '').replace(/\D/g, '')
  }

  function csvProof(row = {}) {
    return String(row.opt_in_proof || row['Opt In Proof'] || row.proof || row.Proof || '').trim()
  }

  function csvOptInSource(row = {}) {
    return String(row.opt_in_source || row['Opt In Source'] || row.source || row.Source || '').trim()
  }

  const selectedTemplate = templates.find((template) => (
    template.id === templateName || template.name === templateName
  ))

  const contactPhoneMap = new Map(contacts.map((contact) => [String(contact.phone || '').replace(/\D/g, ''), contact]))
  const csvPhones = rows.map(csvPhone).filter(Boolean)

  const phoneCounts = csvPhones.reduce((acc, phone) => {
    acc.set(phone, (acc.get(phone) || 0) + 1)
    return acc
  }, new Map())

  const duplicatePhones = [...phoneCounts.entries()].filter(([, count]) => count > 1).map(([phone]) => phone)
  const matchedRows = rows.map((row) => contactPhoneMap.get(csvPhone(row))).filter(Boolean)
  const unknownRows = rows.filter((row) => csvPhone(row) && !contactPhoneMap.get(csvPhone(row)))
  const blankPhoneRows = rows.filter((row) => !csvPhone(row))
  const blockedRows = matchedRows.filter((contact) => contact.opted_out)

  const missingConsentRows = rows.filter((row) => {
    const phone = csvPhone(row)
    const contact = contactPhoneMap.get(phone)
    if (!phone || !contact || contact.opted_out) return false
    return !csvOptInSource(row) || !csvProof(row)
  })

  const weakProofRows = rows.filter((row) => {
    const proof = csvProof(row)
    return proof && proof.length < 8
  })

  const csvValidationError =
    activeTab !== 'csv' ? 'This campaign builder is not enabled yet. Use CSV Upload for production-safe sending.' :
    blankPhoneRows.length ? 'CSV contains a row without phone number.' :
    duplicatePhones.length ? `Duplicate phone found: ${duplicatePhones[0]}` :
    unknownRows.length ? `Unknown contact found: ${csvPhone(unknownRows[0])}. Add/contact sync this customer before campaign sending.` :
    blockedRows.length ? `Opted-out contact found: ${blockedRows[0].phone}. Remove opted-out customers before campaign sending.` :
    missingConsentRows.length ? `Consent source/proof missing for ${csvPhone(missingConsentRows[0])}` :
    weakProofRows.length ? `Opt-in proof too short for ${csvPhone(weakProofRows[0])}` :
    ''
  const scheduleDate = scheduledAt ? new Date(scheduledAt) : null
  const scheduleValidationError =
    sendMode === 'schedule' && !scheduledAt ? 'Choose a future schedule time.' :
    sendMode === 'schedule' && Number.isNaN(scheduleDate?.getTime()) ? 'Choose a valid schedule time.' :
    ''

  async function uploadCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setResult(null)

    try {
      const parsedRows = parseCsv(await file.text())
      setRows(parsedRows)
    } catch {
      setRows([])
      setError('CSV file could not be read. Please upload a valid CSV file.')
    } finally {
      event.target.value = ''
    }
  }

  async function submitCampaign() {
    if (csvValidationError) {
      setError(csvValidationError)
      return
    }

    if (!campaignName.trim()) {
      setError('Campaign name is required.')
      return
    }

    if (!selectedTemplate) {
      setError('Select an approved template before sending campaign.')
      return
    }

    if (!matchedRows.length) {
      setError('CSV contacts must match existing tenant contacts before campaign sending.')
      return
    }

    const scheduleSubmitError = scheduleValidationError ||
      (sendMode === 'schedule' && scheduleDate.getTime() <= Date.now() ? 'Schedule time must be in the future.' : '')

    if (scheduleSubmitError) {
      setError(scheduleSubmitError)
      return
    }

    const actionText = sendMode === 'schedule'
      ? `schedule this WhatsApp template campaign for ${scheduleDate.toLocaleString()}`
      : 'send this WhatsApp template campaign now'

    const confirmed = window.confirm(
      `Confirm to ${actionText}?\n\nCampaign: ${campaignName.trim()}\nTemplate: ${selectedTemplate.name}\nRecipients: ${matchedRows.length}\n\nOnly opted-in tenant contacts will be sent.`
    )

    if (!confirmed) return

    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      const allowedPhones = new Set(matchedRows.map((contact) => String(contact.phone || '').replace(/\D/g, '')))
      const safeRows = rows.filter((row) => allowedPhones.has(csvPhone(row)))

      const res = await api.post('/api/campaigns', {
        name: campaignName.trim(),
        templateName: selectedTemplate.name,
        language: selectedTemplate.language || 'en',
        rows: safeRows,
        sendNow: sendMode === 'now',
        scheduledAt: sendMode === 'schedule' ? scheduleDate.toISOString() : null,
      })

      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Campaign create/send failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="suite-page">
      <h2>Send Bulk Messages</h2>

      <div className="suite-subtabs">
        {[
          ['csv', Upload, 'CSV Upload'],
          ['manual', Boxes, 'Manual Grid'],
          ['filters', Search, 'Contact Filters'],
          ['retargeting', Megaphone, 'Re-Targeting'],
        ].map(([id, Icon, label]) => {
          const disabled = disabledTabs.has(id)

          return (
            <button
              className={`${activeTab === id ? 'active' : ''} ${disabled ? 'is-disabled' : ''}`}
              key={id}
              type="button"
              onClick={() => {
                if (disabled) {
                  setActiveTab(id)
                  setError(`${label} is not enabled yet. Use CSV Upload for production-safe campaign sending.`)
                  return
                }

                setActiveTab(id)
                setError('')
              }}
              aria-disabled={disabled}
            >
              <Icon size={17} />{label}
            </button>
          )
        })}
      </div>

      {activeTab !== 'csv' && (
        <div className="suite-policy-note">
          This builder is not enabled yet. CSV Upload is the only production-safe bulk campaign flow currently enabled.
        </div>
      )}

      <div className="suite-compose-layout bulk-layout">
        <div className="suite-send-form">
          <div className="suite-guide-toggle static"><ChevronDown size={17} /> How to use CSV Upload?</div>

          <label>
            <span className="required">*</span> Campaign Name
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              placeholder="Campaign Name"
              disabled={activeTab !== 'csv'}
            />
          </label>

          <label>
            <span className="required">*</span> Select Template
            <select
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              disabled={activeTab !== 'csv'}
            >
              <option value="">Select an approved template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name} ({template.language})</option>
              ))}
            </select>
          </label>

          <div className="suite-inline-actions">
            <button
              type="button"
              className={sendMode === 'now' ? 'active' : ''}
              disabled={activeTab !== 'csv'}
              onClick={() => {
                setSendMode('now')
                setError('')
              }}
            >
              <Send size={16} /> Send Now
            </button>
            <button
              type="button"
              className={sendMode === 'schedule' ? 'active' : ''}
              disabled={activeTab !== 'csv'}
              onClick={() => {
                setSendMode('schedule')
                setError('')
              }}
            >
              <CalendarClock size={16} /> Schedule
            </button>
          </div>

          {sendMode === 'schedule' && (
            <label>
              <span className="required">*</span> Schedule Time
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                disabled={activeTab !== 'csv'}
              />
            </label>
          )}

          <div className="suite-inline-actions">
            <button
              type="button"
              disabled={activeTab !== 'csv'}
              onClick={() => downloadCsv(
                'bulk-message-template.csv',
                ['phone', 'name', 'opt_in_source', 'opt_in_proof'],
                ['919876543210', 'Customer', 'website_form', 'Customer submitted WhatsApp updates checkbox on 2026-05-29'],
              )}
            >
              Download Sample CSV
            </button>

            <label className={`suite-file-button ${activeTab !== 'csv' ? 'is-disabled' : ''}`}>
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={uploadCsv} disabled={activeTab !== 'csv'} />
            </label>
          </div>

          {!!rows.length && (
            <div className="suite-validation">
              <strong>{rows.length} CSV row(s) loaded</strong>
              <span>{matchedRows.length} matched; {unknownRows.length} unknown; {blockedRows.length} opted-out; {duplicatePhones.length} duplicate.</span>
              {missingConsentRows.length > 0 && <span>{missingConsentRows.length} row(s) missing consent source/proof.</span>}
              {weakProofRows.length > 0 && <span>{weakProofRows.length} row(s) have weak opt-in proof.</span>}
              {csvValidationError && <span className="danger">{csvValidationError}</span>}
            </div>
          )}

          <div className="suite-policy-note">
            Meta safety: campaign sends only to existing tenant contacts with consent proof. Unknown and opted-out contacts are blocked before sending.
          </div>

          {error && <div className="suite-policy-note danger">{error}</div>}

          {result?.summary && (
            <div className="suite-validation">
              <strong>Campaign {result.campaign?.status}</strong>
              <span>
                Total {result.summary.total} - Sent {result.summary.sent} - Failed {result.summary.failed} - Skipped {result.summary.skipped}
              </span>
              {result.queue?.status && <span>Queue status: {result.queue.status}</span>}
            </div>
          )}

          <button
            className="suite-primary-button"
            type="button"
            disabled={submitting || activeTab !== 'csv' || !campaignName.trim() || !selectedTemplate || !rows.length || Boolean(csvValidationError) || Boolean(scheduleValidationError) || !matchedRows.length}
            onClick={submitCampaign}
          >
            {submitting ? 'Submitting...' : sendMode === 'schedule' ? 'Schedule Campaign' : 'Send Campaign'}
          </button>
        </div>

        <MessagePreview body={selectedTemplate?.body} emptyText="Select a template to preview campaign message" />
      </div>
    </section>
  )
}

export function CannedMessagePage({
  contacts,
  selected,
  selectedId,
  onSelectContact,
  templates,
  templateName,
  setTemplateName,
  setDraft,
  onSend,
  sendError,
  sending,
}) {
  const [tab, setTab] = useState('single')
  const disabledTabs = new Set(['csv', 'manual', 'filters'])

  const selectedTemplate = templates.find((template) => (
    template.id === templateName || template.name === templateName
  ))

  function chooseTemplate(event) {
    setDraft('')
    setTemplateName(event.target.value)
  }

  function handleTabClick(id) {
    setTab(id)

    if (disabledTabs.has(id)) {
      setDraft('')
      setTemplateName('')
    }
  }

  const lockedBatchMode = tab !== 'single'

  return (
    <section className="suite-page">
      <h2>Send Canned Messages</h2>

      <div className="suite-subtabs">
        {[
          ['single', PhoneCall, 'Single Number'],
          ['csv', Upload, 'CSV Upload'],
          ['manual', Boxes, 'Manual Grid'],
          ['filters', Search, 'Contact Filters'],
        ].map(([id, Icon, label]) => {
          const disabled = disabledTabs.has(id)

          return (
            <button
              className={`${tab === id ? 'active' : ''} ${disabled ? 'is-disabled' : ''}`}
              key={id}
              type="button"
              onClick={() => handleTabClick(id, label)}
              aria-disabled={disabled}
            >
              <Icon size={17} />{label}
            </button>
          )
        })}
      </div>

      {lockedBatchMode && (
        <div className="suite-policy-note">
          {tab === 'csv' && 'CSV canned sending is not enabled here. Use Bulk Messages for consent-backed template campaigns.'}
          {tab === 'manual' && 'Manual grid sending is not enabled yet. Use Single Number for safe one-to-one sending.'}
          {tab === 'filters' && 'Contact filter sending is not enabled yet. Use Bulk Messages after consent-backed audience filtering is enabled.'}
        </div>
      )}

      <div className="suite-compose-layout bulk-layout">
        <form className="suite-send-form" onSubmit={onSend}>
          <div className="suite-guide-toggle static"><ChevronDown size={17} /> How to send canned messages?</div>

          <label>
            <span className="required">*</span> Phone Number
            <select value={selectedId} onChange={(event) => onSelectContact(event.target.value)} required disabled={lockedBatchMode}>
              <option value="">Select tenant contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.phone} - {contact.name || 'Customer'}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="required">*</span> Select Canned Message
            <select value={templateName} onChange={chooseTemplate} disabled={lockedBatchMode || !selected || selected.opted_out}>
              <option value="">Choose an approved canned message</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name} ({template.language})</option>
              ))}
            </select>
          </label>

          {selected?.opted_out && <div className="suite-policy-note danger">This contact is opted out. Sending is locked.</div>}
          {lockedBatchMode && <div className="suite-policy-note danger">This mode is locked to prevent non-compliant bulk/canned sending.</div>}
          {sendError && <div className="suite-policy-note danger">{sendError}</div>}

          <button className="suite-primary-button" type="submit" disabled={lockedBatchMode || !selected || !templateName || selected.opted_out || sending}>
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        <MessagePreview selected={selected} body={selectedTemplate?.body} emptyText="Select a canned message to see preview" />
      </div>
    </section>
  )
}

export function ContactsListPage({ contacts, onOpenChat }) {
  return (
    <section className="suite-page">
      <h2>Contacts List</h2>
      <div className="suite-table-card">
        <div className="suite-table-head"><span>Contact</span><span>Phone</span><span>Label / Stage</span><span>Reply Window</span><span>Action</span></div>
        {contacts.map((contact) => (
          <div className="suite-table-row" key={contact.id}>
            <strong>{contact.name || 'Customer'}</strong>
            <span>{contact.phone}</span>
            <span>{contact.label || '-'} / {contact.stage || '-'}</span>
            <span>{contact.opted_out ? 'Blocked' : contact.reply_window_open ? 'Open' : 'Template only'}</span>
            <button type="button" onClick={() => onOpenChat(contact.id)}>Open Chat</button>
          </div>
        ))}
        {!contacts.length && <EmptyState title="No contacts" text="Contacts created by incoming WhatsApp conversations will appear here." />}
      </div>
    </section>
  )
}

export function FeatureGatePage({ title, text, actionLabel, actionPage, onOpenPage }) {
  return (
    <section className="suite-page">
      <h2>{title}</h2>
      <div className="suite-gate-card">
        <Shield size={26} />
        <h3>Setup required before production use</h3>
        <p>{text}</p>
        <small>This screen stays locked until tenant data, role access, audit logging, and WhatsApp policy checks exist for the full flow.</small>
        {actionLabel && actionPage && (
          <button type="button" onClick={() => onOpenPage(actionPage)}>
            <ArrowRight size={16} /> {actionLabel}
          </button>
        )}
      </div>
    </section>
  )
}

export function SalesWorkspacePage({ activeTab, onChangeTab, quotations, orders, activeOrders, onQuoteStatus, onConvertQuote, onDownloadQuote, onSendManagerApproval, onSendCustomer, onUpdateOrder, onSyncTallyOrder, tallySyncingOrderId, tallyEnabled }) {
  const tabs = [
    { id: 'quotes', label: 'Quotations', icon: ClipboardList, count: quotations.length },
    { id: 'orders', label: 'All Orders', icon: ShoppingCart, count: orders.length },
    { id: 'activeOrders', label: 'Active Orders', icon: Clock3, count: activeOrders.length },
  ]

  return (
    <section className="workspace-page workspace-hub-page">
      <WorkspaceHeading
        title="Sales Workspace"
        description="Quotations and orders are organized as subpages so each workflow stays focused and easy to review."
      />
      <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChangeTab={onChangeTab} />
      {activeTab === 'quotes' && (
        <QuotesPage quotations={quotations} onStatus={onQuoteStatus} onConvert={onConvertQuote} onDownload={onDownloadQuote} onSendManagerApproval={onSendManagerApproval} onSendCustomer={onSendCustomer} />
      )}
      {activeTab === 'orders' && <OrdersPage orders={orders} onUpdate={onUpdateOrder} onSyncTallyOrder={onSyncTallyOrder} tallySyncingOrderId={tallySyncingOrderId} tallyEnabled={tallyEnabled} />}
      {activeTab === 'activeOrders' && <OrdersPage orders={activeOrders} onUpdate={onUpdateOrder} onSyncTallyOrder={onSyncTallyOrder} tallySyncingOrderId={tallySyncingOrderId} tallyEnabled={tallyEnabled} title="Active Orders" />}
    </section>
  )
}

export function ControlCenterPage({
  activeTab,
  onChangeTab,
  onboarding,
  onOpenMetaSetup,
  userRole,
  webhookEvents,
  webhookActionLoading,
  onRetryWebhook,
  onRecoverStuck,
  outboundEvents,
  outboundActionLoading,
  onRetryOutbound,
  onRetryFailedOutbound,
  optOutContacts,
  optOutActionLoading,
  onManualOptOut,
  onManualOptIn,
  auditEvents,
  ...settingsProps
}) {
  const tabs = [
    { id: 'settings', label: 'Settings & Templates', icon: Settings },
    { id: 'webhooks', label: 'Webhooks', icon: Activity, count: webhookEvents.length },
    { id: 'outbound', label: 'Outbound', icon: Send, count: outboundEvents.length },
    { id: 'optOuts', label: 'Opt-outs', icon: Shield, count: optOutContacts.length },
    { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  ]

  return (
    <section className="workspace-page workspace-hub-page">
      <WorkspaceHeading
        title="Control Center"
        description="Business setup, Meta monitoring and compliance checks are grouped into secure operational subpages."
      />
      <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChangeTab={onChangeTab} />

      {activeTab === 'settings' && (
        <>
          {onboarding && !onboarding.connected && userRole === 'admin' && (
            <div className="setup-card">
              <h3>Meta WhatsApp Embedded Signup</h3>
              <p>This company is not connected through Meta Embedded Signup yet. Connect official WhatsApp Business API to unlock production messaging.</p>
              <div className="inline-actions">
                <button type="button" onClick={onOpenMetaSetup}>Connect Meta WhatsApp</button>
              </div>
            </div>
          )}

          {onboarding?.connected && onboarding?.whatsappAccount && (
            <div className="setup-card">
              <h3>Meta WhatsApp Connected</h3>
              <div className="setup-grid">
                <span className="ok">Connected</span>
                <span className={onboarding.whatsappAccount.active ? 'ok' : 'warn'}>
                  {onboarding.whatsappAccount.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="setup-copy">Phone: {onboarding.whatsappAccount.displayPhoneNumber || '-'}</p>
              <p className="setup-copy">Phone Number ID: {onboarding.whatsappAccount.phoneNumberId || '-'}</p>
              <p className="setup-copy">WABA ID: {onboarding.whatsappAccount.wabaId || '-'}</p>
              <p className="setup-copy">
                Connected At: {onboarding.whatsappAccount.connectedAt ? new Date(onboarding.whatsappAccount.connectedAt).toLocaleString() : '-'}
              </p>
              <small className="setup-copy">Tokens are stored securely on backend only. Access token is never exposed to frontend.</small>
            </div>
          )}

          <SettingsPage {...settingsProps} userRole={userRole} />
        </>
      )}

      {activeTab === 'webhooks' && (
        <WebhookEventsPage
          events={webhookEvents}
          loadingId={webhookActionLoading}
          isAdmin={userRole === 'admin'}
          onRetry={onRetryWebhook}
          onRecoverStuck={onRecoverStuck}
        />
      )}
      {activeTab === 'outbound' && (
        <OutboundQueuePage events={outboundEvents} loadingId={outboundActionLoading} onRetry={onRetryOutbound} onRetryFailed={onRetryFailedOutbound} />
      )}
      {activeTab === 'optOuts' && (
        <OptOutManagementPage contacts={optOutContacts} loadingId={optOutActionLoading} onManualOptOut={onManualOptOut} onManualOptIn={onManualOptIn} />
      )}
      {activeTab === 'audit' && <AuditPage events={auditEvents} />}
    </section>
  )
}

export function InventoryPage({ products, productForm, setProductForm, editingProductId, onSave, onEdit, onDelete, onCancel, productSearch, setProductSearch, onSearch, canManage, currency, inventoryColumnsText, setInventoryColumnsText, onImport, importResult }) {
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

export function QuotesPage({ quotations, onStatus, onConvert, onDownload, onSendManagerApproval, onSendCustomer }) {
  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Quotations</h3></div>
      {!quotations.length && <EmptyState title="No quotations" text="Quotation drafts created from WhatsApp enquiries will appear here." />}
      {quotations.map((quote) => (
        <div className="doc-row" key={quote.id}>
          <strong>{quote.quote_no}</strong>
          <span>
            {quote.contact_name || 'Customer'} - {quote.status}
            {quote.manager_approval_status && quote.manager_approval_status !== 'not_requested'
              ? ` / Manager: ${quote.manager_approval_status}`
              : ''}
          </span>

          {quote.manager_rejection_reason && (
            <small className="quote-reason">Manager reason: {quote.manager_rejection_reason}</small>
          )}

          <b>{formatMoney(quote.amount)}</b>

          <div className="doc-actions">
            {quote.manager_approval_status !== 'pending' && quote.status !== 'customer_sent' && quote.status !== 'converted' && (
              <button type="button" onClick={() => onSendManagerApproval(quote)}>Manager Approval</button>
            )}

            {quote.manager_approval_status === 'approved' && quote.status !== 'customer_sent' && (
              <button type="button" onClick={() => onSendCustomer(quote)}>Send Customer</button>
            )}

            <button type="button" onClick={() => onStatus(quote, 'lost')}>Lost</button>
            {quote.status === 'accepted' && quote.approval_status === 'customer_approved' && (
  <button type="button" onClick={() => onConvert(quote)}>Create Order</button>
)}
            <button type="button" onClick={() => onDownload(quote)}>Download</button>
          </div>
        </div>
      ))}
    </section>
  )
}

export function OrdersPage({ orders, onUpdate, onSyncTallyOrder, tallySyncingOrderId, tallyEnabled, title = 'Orders' }) {
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
            {onSyncTallyOrder && (
              <button type="button" onClick={() => onSyncTallyOrder(order.id)} disabled={!tallyEnabled || tallySyncingOrderId === order.id}>
                {tallySyncingOrderId === order.id ? 'Syncing...' : 'Sync Tally'}
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}

export function TallyIntegrationPage({
  settings,
  logs,
  orders,
  onSave,
  onTest,
  onSyncOrder,
  saving,
  testing,
  syncingOrderId,
  userRole,
}) {
  const [form, setForm] = useState(settings)
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    // Settings props hydrate this local editable form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(settings)
  }, [settings])

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function submit(event) {
    event.preventDefault()
    onSave(form)
  }

  return (
    <section className="workspace-page workspace-hub-page">
      <WorkspaceHeading
        title="Tally Integration"
        description="Connect tenant orders with TallyPrime or Tally ERP 9 sales vouchers through a secure backend gateway."
      />

      <div className="dashboard-grid">
        <section className="settings-card">
          <div className="settings-card-title"><Activity size={22} /><h3>Connection</h3></div>
          <form className="settings-form" onSubmit={submit}>
            <label className="settings-switch-row large">
              <span>
                <strong>Enable Tally sync</strong>
                <small>{form.enabled ? 'Enabled for this company' : 'Disabled'}</small>
              </span>
              <input type="checkbox" checked={Boolean(form.enabled)} disabled={!isAdmin} onChange={(e) => patchForm({ enabled: e.target.checked })} />
            </label>

            <label>Tally Product<select disabled={!isAdmin} value={form.productType || 'tallyprime'} onChange={(e) => patchForm({ productType: e.target.value })}><option value="tallyprime">TallyPrime</option><option value="tally_erp9">Tally ERP 9 / Tally</option><option value="other">Other Tally XML Gateway</option></select></label>
            <label>Gateway URL<input disabled={!isAdmin} placeholder="https://your-tally-bridge.example.com or http://office-ip:9000" value={form.gatewayUrl || ''} onChange={(e) => patchForm({ gatewayUrl: e.target.value })} /></label>
            <label>Tally Company Name<input disabled={!isAdmin} placeholder="Exact company name in Tally" value={form.companyName || ''} onChange={(e) => patchForm({ companyName: e.target.value })} /></label>

            <div className="settings-grid two">
              <label>Sales Voucher Type<input disabled={!isAdmin} value={form.salesVoucherType || 'Sales'} onChange={(e) => patchForm({ salesVoucherType: e.target.value })} /></label>
              <label>Sales Ledger<input disabled={!isAdmin} value={form.salesLedgerName || 'Sales'} onChange={(e) => patchForm({ salesLedgerName: e.target.value })} /></label>
              <label>Sales Ledger Parent<input disabled={!isAdmin} value={form.salesLedgerParent || 'Sales Accounts'} onChange={(e) => patchForm({ salesLedgerParent: e.target.value })} /></label>
              <label>Customer Ledger Parent<input disabled={!isAdmin} value={form.customerLedgerParent || 'Sundry Debtors'} onChange={(e) => patchForm({ customerLedgerParent: e.target.value })} /></label>
            </div>

            <div className="settings-form-actions">
              {isAdmin && <button className="settings-primary-button" type="submit" disabled={saving}><Save size={17} /> {saving ? 'Saving...' : 'Save'}</button>}
              {isAdmin && <button className="settings-outline-button" type="button" onClick={() => onTest(form)} disabled={testing}><RefreshCw size={17} /> {testing ? 'Testing...' : 'Test'}</button>}
            </div>
          </form>

          <div className="setup-grid">
            <span className={settings.enabled ? 'ok' : 'warn'}>{settings.enabled ? 'Enabled' : 'Disabled'}</span>
            <span className={settings.lastTestStatus === 'connected' ? 'ok' : 'warn'}>{settings.lastTestStatus || 'Not Tested'}</span>
          </div>
          {settings.lastTestedAt && <small className="settings-muted">Last tested: {new Date(settings.lastTestedAt).toLocaleString()}</small>}
          {settings.lastError && <small className="danger-text">{settings.lastError}</small>}
        </section>

        <section className="table-module">
          <div className="module-title"><PackageCheck size={18} /><h3>Orders To Sync</h3></div>
          {orders.slice(0, 8).map((order) => (
            <div className="doc-row" key={order.id}>
              <strong>{order.order_no}</strong>
              <span>{order.contact_name || 'Customer'} - {order.status}</span>
              <b>{formatMoney(order.amount)}</b>
              <div className="doc-actions">
                <button type="button" onClick={() => onSyncOrder(order.id)} disabled={!settings.enabled || syncingOrderId === order.id}>
                  {syncingOrderId === order.id ? 'Syncing...' : 'Sync Tally'}
                </button>
              </div>
            </div>
          ))}
          {!orders.length && <EmptyState title="No orders" text="Converted quotations and confirmed orders will appear here." />}
        </section>
      </div>

      <section className="table-module">
        <div className="module-title"><ClipboardList size={18} /><h3>Tally Sync Logs</h3></div>
        {logs.map((log) => (
          <div className="audit-row" key={log.id}>
            <strong>{log.action} - {log.status}</strong>
            <span>{log.tally_reference || log.entity_type}</span>
            <small>{new Date(log.created_at).toLocaleString()}</small>
            {log.error && <small className="danger-text">{log.error}</small>}
          </div>
        ))}
        {!logs.length && <EmptyState title="No Tally sync logs" text="Connection tests and order sync results will appear here." />}
      </section>
    </section>
  )
}

export function UsersPage({ users, newUser, setNewUser, editingUserId, onCreate, onEdit, onCancel, onToggle, onDelete }) {
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
          <label>Password<input type="password" autoComplete="new-password" placeholder={editingUserId ? 'Leave blank to keep old password' : '12+ chars with number & symbol'} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
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

export function WebhookEventsPage({ events, loadingId, isAdmin, onRetry, onRecoverStuck }) {
  const failedCount = events.length
  const totalAttempts = events.reduce((sum, event) => sum + Number(event.attempts || 0), 0)

  return (
    <section className="table-module webhook-monitor-module">
      <div className="module-title webhook-monitor-head">
        <div>
          <Activity size={18} />
          <h3>Webhook Events Monitor</h3>
        </div>
        <div className="webhook-monitor-actions">
          <span>{failedCount} failed</span>
          <span>{totalAttempts} retry attempts</span>
          {isAdmin && (
            <button
              type="button"
              onClick={onRecoverStuck}
              disabled={loadingId === 'recover-stuck'}
            >
              {loadingId === 'recover-stuck' ? 'Recovering...' : 'Recover stuck'}
            </button>
          )}
        </div>
      </div>

      <p className="module-helper">
        Failed Meta webhook events appear here. Retry only after fixing token, mapping, media, or processing errors.
      </p>

      {!events.length && (
        <EmptyState
          title="No failed webhook events"
          text="Meta webhooks are processing normally. Failed events will appear here for review."
        />
      )}

      {!!events.length && (
        <div className="webhook-event-table">
          <div className="webhook-event-head">
            <span>Event</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Received</span>
            <span>Action</span>
          </div>

          {events.map((event) => (
            <div className="webhook-event-row" key={event.id}>
              <div className="webhook-event-main">
                <strong>{event.event_type || 'webhook'}</strong>
                <small>Phone ID: {event.phone_number_id || '-'}</small>
                {event.last_error && <p>{event.last_error}</p>}
              </div>

              <span className={`webhook-status-pill ${event.status || 'failed'}`}>
                {event.status || 'failed'}
              </span>

              <span>{Number(event.attempts || 0)}</span>

              <span>
                {event.received_at ? new Date(event.received_at).toLocaleString() : '-'}
              </span>

              <button
                type="button"
                onClick={() => onRetry(event.id)}
                disabled={loadingId === event.id}
              >
                {loadingId === event.id ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function OutboundQueuePage({ events, loadingId, onRetry, onRetryFailed }) {
  const failedCount = events.length
  const totalAttempts = events.reduce((sum, event) => sum + Number(event.attempts || 0), 0)
  const templateCount = events.filter((event) => event.message_type === 'template').length
  const textCount = events.filter((event) => event.message_type === 'text').length

  return (
    <section className="table-module outbound-monitor-module">
      <div className="module-title outbound-monitor-head">
        <div>
          <Send size={18} />
          <h3>Outbound Queue Monitor</h3>
        </div>
        <div className="outbound-monitor-actions">
          <span>{failedCount} failed</span>
          <span>{textCount} text</span>
          <span>{templateCount} template</span>
          <span>{totalAttempts} attempts</span>
          <button
            type="button"
            onClick={onRetryFailed}
            disabled={!events.length || loadingId === 'retry-all'}
          >
            {loadingId === 'retry-all' ? 'Retrying...' : 'Bulk retry 10'}
          </button>
        </div>
      </div>

      <p className="module-helper">
        Failed outbound WhatsApp messages appear here. Retry only after checking opt-out, 24-hour window, template approval, and Meta API errors.
      </p>

      {!events.length && (
        <EmptyState
          title="No failed outbound messages"
          text="Failed outbound WhatsApp messages will appear here for review and retry."
        />
      )}

      {!!events.length && (
        <div className="outbound-event-table">
          <div className="outbound-event-head">
            <span>Message</span>
            <span>Type</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Updated</span>
            <span>Action</span>
          </div>

          {events.map((event) => (
            <div className="outbound-event-row" key={event.id}>
              <div className="outbound-event-main">
                <strong>{event.template_name || event.to_phone || 'Outbound message'}</strong>
                <small>To: {event.to_phone || '-'}</small>
                {event.body && <em>{String(event.body).slice(0, 180)}</em>}
                {event.last_error && <p>{event.last_error}</p>}
              </div>

              <span className="outbound-type-pill">
                {event.message_type || 'text'}
              </span>

              <span className={`outbound-status-pill ${event.status || 'failed'}`}>
                {event.status || 'failed'}
              </span>

              <span>{Number(event.attempts || 0)}</span>

              <span>
                {event.updated_at ? new Date(event.updated_at).toLocaleString() : '-'}
              </span>

              <button
                type="button"
                onClick={() => onRetry(event.id)}
                disabled={loadingId === event.id}
              >
                {loadingId === event.id ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function OptOutManagementPage({ contacts, loadingId, onManualOptOut, onManualOptIn }) {
  return (
    <section className="table-module optout-module">
      <div className="module-title">
        <Shield size={18} />
        <h3>Opt-out Compliance</h3>
      </div>

      <div className="optout-summary">
        <div>
          <strong>{contacts.length}</strong>
          <span>Opted-out contacts</span>
        </div>
        <p>
          These customers must not receive WhatsApp campaigns or manual messages unless they clearly opt in again.
        </p>
      </div>

      {!contacts.length && (
        <EmptyState
          title="No opted-out contacts"
          text="STOP, UNSUBSCRIBE, DND, DO NOT MESSAGE and manual opt-outs will appear here."
        />
      )}

      {!!contacts.length && (
        <div className="optout-table">
          <div className="optout-table-head">
            <span>Customer</span>
            <span>Phone</span>
            <span>Reason</span>
            <span>Opted-out at</span>
            <span>Action</span>
          </div>

          {contacts.map((contact) => (
            <div className="optout-row" key={contact.id}>
              <div>
                <strong>{contact.name || 'Unknown customer'}</strong>
                <small>{contact.company || contact.label || '-'}</small>
              </div>

              <span>{contact.phone || contact.wa_id || '-'}</span>

              <span>{contact.opted_out_reason || 'Customer opt-out / compliance update'}</span>

              <span>
                {contact.opted_out_at
                  ? new Date(contact.opted_out_at).toLocaleString()
                  : '-'}
              </span>

              <div className="optout-actions">
                <button
                  type="button"
                  className="optout-in-btn"
                  onClick={() => onManualOptIn(contact)}
                  disabled={loadingId === contact.id}
                >
                  {loadingId === contact.id ? 'Updating...' : 'Mark Opt-in'}
                </button>

                <button
                  type="button"
                  className="optout-out-btn"
                  onClick={() => onManualOptOut(contact)}
                  disabled={loadingId === contact.id}
                >
                  Keep Opt-out
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function AuditPage({ events }) {
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

export function KnowledgeBaseManager() {
  const emptyKnowledge = { title: '', category: 'general', content: '', keywordsText: '', active: true }
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyKnowledge)
  const [editingId, setEditingId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function loadKnowledge() {
    const res = await api.get('/api/knowledge-base')
    setItems(res.data)
  }

  useEffect(() => {
    // Knowledge base rows are fetched once when this manager mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadKnowledge().catch(() => setMessage('Unable to load knowledge base'))
  }, [])

  async function saveKnowledge(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      title: form.title,
      category: form.category,
      content: form.content,
      keywords: fromCsv(form.keywordsText),
      active: Boolean(form.active),
    }

    try {
      if (editingId) {
        await api.patch(`/api/knowledge-base/${editingId}`, payload)
        setMessage('Knowledge updated')
      } else {
        await api.post('/api/knowledge-base', payload)
        setMessage('Knowledge added')
      }

      setForm(emptyKnowledge)
      setEditingId('')
      await loadKnowledge()
    } catch (err) {
      setMessage(err.response?.data?.error || 'Knowledge save failed')
    } finally {
      setSaving(false)
    }
  }

  function editKnowledge(item) {
    setEditingId(item.id)
    setForm({
      title: item.title || '',
      category: item.category || 'general',
      content: item.content || '',
      keywordsText: toCsv(item.keywords || []),
      active: item.active !== false,
    })
  }

  async function deactivateKnowledge(item) {
    await api.delete(`/api/knowledge-base/${item.id}`)
    setMessage('Knowledge deactivated')
    if (editingId === item.id) {
      setEditingId('')
      setForm(emptyKnowledge)
    }
    await loadKnowledge()
  }

  return (
    <section className="table-module">
      <div className="module-title"><FileText size={18} /><h3>Company Knowledge Base</h3></div>

      <form className="knowledge-form" onSubmit={saveKnowledge}>
        <input
          placeholder="Title, example: Payment Terms"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <input
          placeholder="Category, example: payment / delivery / company"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />

        <textarea
          placeholder="Write company-approved answer/policy here. Bot will use this only when relevant."
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />

        <input
          placeholder="Keywords comma separated, example: payment terms, advance, credit"
          value={form.keywordsText}
          onChange={(e) => setForm({ ...form, keywordsText: e.target.value })}
        />

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={Boolean(form.active)}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>

        <div className="doc-actions">
          {editingId && <button type="button" onClick={() => { setEditingId(''); setForm(emptyKnowledge) }}>Cancel Edit</button>}
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update Knowledge' : 'Add Knowledge'}</button>
        </div>

        {message && <small className="success-text">{message}</small>}
      </form>

      <div className="knowledge-list">
        {!items.length && <EmptyState title="No knowledge added" text="Add company FAQ, policies, delivery terms, payment terms, and safe bot answers here." />}

        {items.map((item) => (
          <div className="knowledge-row" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.category} | {item.active ? 'Active' : 'Inactive'}</span>
            <p>{item.content}</p>
            <small>Keywords: {(item.keywords || []).join(', ') || '-'}</small>
            <div className="doc-actions">
              <button type="button" onClick={() => editKnowledge(item)}>Edit</button>
              {item.active && <button type="button" onClick={() => deactivateKnowledge(item)}>Deactivate</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function SettingsPage({
  status,
  whatsappConfig,
  testMessage,
  setTestMessage,
  testResult,
  onTest,
  onMapPhone,
  simulator,
  setSimulator,
  onSimulate,
  customForm,
  setCustomForm,
  onSaveCustomization,
  onSaveSettings,
  settingsSaved,
  templates,
  templateForm,
  setTemplateForm,
  editingTemplateId,
  onSaveTemplate,
  onEditTemplate,
  onToggleTemplate,
  onCancelTemplateEdit,
  onSyncTemplates,
  templateSyncing,
  userRole,
  isProduction,
  currentUser,
  users = [],
  newUser,
  setNewUser,
  editingUserId,
  onCreateUser,
  onEditUser,
  onCancelUserEdit,
  onToggleUser,
  onDeleteUser,
}) {
  const warnings = status?.warnings || []
  const [activeSettingsTab, setActiveSettingsTab] = useState('profile')
  const [activePeopleTab, setActivePeopleTab] = useState('agents')
  const [agentFormOpen, setAgentFormOpen] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false)
  const activeCount = users.filter((item) => item.active).length
  const voiceWeeklyHours = normalizeVoiceWeeklyHours(customForm.voiceWeeklyHours)
  const unavailableHours = Array.isArray(customForm.voiceUnavailableHours) ? customForm.voiceUnavailableHours : []

const settingsTabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'agents', label: 'Agents and Permissions' },
  { id: 'waba', label: 'WABA Settings' },
  { id: 'billing', label: 'Billing & GST Details' },
  { id: 'usage', label: 'Usage & Limits' },
  { id: 'voice', label: 'Voice Call Settings' },
  { id: 'inbox', label: 'Inbox Settings' },
]

  function patchForm(patch) {
    setCustomForm({ ...customForm, ...patch })
  }

  async function savePatch(patch, message) {
    const nextForm = { ...customForm, ...patch }
    setCustomForm(nextForm)
    await onSaveSettings(nextForm, message)
  }

  function openAgentForm() {
    if (userRole !== 'admin') return
    if (onCancelUserEdit) onCancelUserEdit()
    setAgentFormOpen(true)
  }

  async function submitAgent(event) {
    if (!onCreateUser) return
    const saved = await onCreateUser(event)
    if (saved) setAgentFormOpen(false)
  }

  function editAgent(userItem) {
    if (!onEditUser) return
    onEditUser(userItem)
    setAgentFormOpen(true)
  }

  function updateVoiceDay(day, patch) {
    patchForm({
      voiceWeeklyHours: {
        ...voiceWeeklyHours,
        [day]: { ...voiceWeeklyHours[day], ...patch },
      },
    })
  }

  function updateVoiceSlot(day, slotIndex, field, value) {
    const slots = voiceWeeklyHours[day].slots.map((slot, index) => (
      index === slotIndex ? { ...slot, [field]: value } : slot
    ))
    updateVoiceDay(day, { slots })
  }

  function addVoiceSlot(day) {
    const slots = [...voiceWeeklyHours[day].slots, { start: '09:00', end: '18:00' }]
    updateVoiceDay(day, { slots })
  }

  function removeVoiceSlot(day, slotIndex) {
    const slots = voiceWeeklyHours[day].slots.filter((slot, index) => index !== slotIndex)
    updateVoiceDay(day, { slots: slots.length ? slots : [{ start: '00:00', end: '23:59' }] })
  }

  function addUnavailableHours() {
    patchForm({
      voiceUnavailableHours: [
        ...unavailableHours,
        { date: new Date().toISOString().slice(0, 10), start: '00:00', end: '23:59', reason: '' },
      ],
    })
  }

  function updateUnavailableHours(index, field, value) {
    patchForm({
      voiceUnavailableHours: unavailableHours.map((entry, itemIndex) => (
        itemIndex === index ? { ...entry, [field]: value } : entry
      )),
    })
  }

  function removeUnavailableHours(index) {
    patchForm({
      voiceUnavailableHours: unavailableHours.filter((entry, itemIndex) => itemIndex !== index),
    })
  }

  async function saveVoiceSettings(event) {
    event.preventDefault()
    await onSaveSettings({ ...customForm, voiceWeeklyHours }, 'Voice call settings saved')
  }

  async function deleteBillingProfile() {
    if (!window.confirm('Delete billing profile details for this company?')) return
    await savePatch(DEFAULT_BILLING_FIELDS, 'Billing profile deleted')
  }

  return (
    <div className="settings-reference-shell">
      <nav className="settings-reference-tabs" aria-label="Settings pages">
        {settingsTabs.map((tab) => (
          <button key={tab.id} className={activeSettingsTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveSettingsTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeSettingsTab === 'profile' && (
        <div className="settings-profile-grid">
          <section className="settings-card">
            <div className="settings-card-title"><UserRound size={22} /><h3>User Information</h3></div>
            <div className="settings-info-row"><strong>Username:</strong><span>{currentUser?.name || currentUser?.email || '-'}</span></div>
            <div className="settings-info-row"><strong>FTP Access:</strong><SwitchControl checked={Boolean(customForm.ftpAccessEnabled)} label={customForm.ftpAccessEnabled ? 'ON' : 'OFF'} onChange={(checked) => savePatch({ ftpAccessEnabled: checked }, 'Profile setting saved')} /></div>
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><b className="google-mark">G</b><h3>Google Integration</h3></div>
            <div className="settings-info-row">
              <strong>Status:</strong>
              <span className="connection-pill warn"><Link2 size={15} /> Not Connected</span>
            </div>
            <p className="settings-muted">Connect your Google account to enable Sheets integration and other Google services.</p>
            <button className="settings-outline-button" type="button" onClick={() => setGoogleMessage('Google OAuth backend route is not configured yet. No token was requested or exposed.')}>
              <b className="google-color">G</b> Connect with Google
            </button>
            {googleMessage && <small className="settings-safe-note">{googleMessage}</small>}
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><Shield size={22} /><h3>Two-Factor Authentication</h3></div>
            <div className="settings-info-row">
              <div>
                <strong>Status:</strong>
                <p className="settings-muted">Add an extra layer of security to your account by enabling two-factor authentication.</p>
              </div>
              <SwitchControl checked={Boolean(customForm.twoFactorEnabled)} label={customForm.twoFactorEnabled ? 'Enabled' : 'Disabled'} onChange={(checked) => savePatch({ twoFactorEnabled: checked }, 'Profile setting saved')} />
            </div>
          </section>

          <form className="settings-card settings-customization-card" onSubmit={onSaveCustomization}>
            <div className="settings-card-title"><Settings size={22} /><h3>Business Customization</h3></div>
            <div className="settings-form-grid compact">
              <label>App Name<input value={customForm.appName} onChange={(e) => patchForm({ appName: e.target.value })} /></label>
              <label>Company Name<input value={customForm.companyName} onChange={(e) => patchForm({ companyName: e.target.value })} /></label>
              <label>Industry<input value={customForm.industry} onChange={(e) => patchForm({ industry: e.target.value })} /></label>
              <label>Theme Color<input type="color" value={customForm.primaryColor} onChange={(e) => patchForm({ primaryColor: e.target.value })} /></label>
              <label>Currency<input value={customForm.currency} onChange={(e) => patchForm({ currency: e.target.value })} /></label>
              <label>Quotation Prefix<input value={customForm.quotationPrefix} onChange={(e) => patchForm({ quotationPrefix: e.target.value })} /></label>
              <label>Order Prefix<input value={customForm.orderPrefix} onChange={(e) => patchForm({ orderPrefix: e.target.value })} /></label>
              <label className="wide">Labels<textarea value={customForm.labelsText} onChange={(e) => patchForm({ labelsText: e.target.value })} /></label>
              <label className="wide">Sales Stages<textarea value={customForm.stagesText} onChange={(e) => patchForm({ stagesText: e.target.value })} /></label>
              <label className="wide">Bot Greeting<textarea value={customForm.botGreeting} onChange={(e) => patchForm({ botGreeting: e.target.value })} /></label>
              <label className="wide">Handoff Keywords<textarea value={customForm.handoffKeywordsText} onChange={(e) => patchForm({ handoffKeywordsText: e.target.value })} /></label>
              <label className="wide">Inventory Fields<textarea value={customForm.inventoryFieldsText} onChange={(e) => patchForm({ inventoryFieldsText: e.target.value })} /></label>
            </div>
            <label className="settings-switch-row">
              <SwitchControl checked={Boolean(customForm.botEnabled)} onChange={(checked) => patchForm({ botEnabled: checked })} />
              Enable Auto Bot
            </label>
            <div className="approval-settings-box">
              <strong>Quotation Approval Workflow</strong>
              <small>Customer quotation will go to manager first. Customer will receive it only after manager approval.</small>
              <label className="settings-switch-row">
                <SwitchControl checked={Boolean(customForm.quoteApprovalEnabled)} onChange={(checked) => patchForm({ quoteApprovalEnabled: checked })} />
                Enable Manager Approval Before Customer Quote
              </label>
              <div className="settings-form-grid compact">
                <label>Manager Name<input value={customForm.quoteApprovalManagerName || ''} onChange={(e) => patchForm({ quoteApprovalManagerName: e.target.value })} placeholder="Example: Sales Manager" /></label>
                <label>Manager WhatsApp Number<input value={customForm.quoteApprovalManagerPhone || ''} onChange={(e) => patchForm({ quoteApprovalManagerPhone: e.target.value.replace(/\D/g, '') })} placeholder="Example: 919876543210" /></label>
                <label>Manager Approval Template Name<input value={customForm.quoteApprovalTemplateName || ''} onChange={(e) => patchForm({ quoteApprovalTemplateName: e.target.value })} placeholder="quote_manager_approval_request" /></label>
                <label>Manager Approval Template Language<input value={customForm.quoteApprovalTemplateLanguage || 'en'} onChange={(e) => patchForm({ quoteApprovalTemplateLanguage: e.target.value })} placeholder="en" /></label>
                <label>Customer Quote Template Name<input value={customForm.customerQuoteTemplateName || ''} onChange={(e) => patchForm({ customerQuoteTemplateName: e.target.value })} placeholder="quote_customer_approval_request" /></label>
                <label>Customer Quote Template Language<input value={customForm.customerQuoteTemplateLanguage || 'en'} onChange={(e) => patchForm({ customerQuoteTemplateLanguage: e.target.value })} placeholder="en" /></label>
                <label>Order Acknowledgement Template Name<input value={customForm.orderAcknowledgementTemplateName || ''} onChange={(e) => patchForm({ orderAcknowledgementTemplateName: e.target.value })} placeholder="order_acknowledgement" /></label>
                <label>Order Acknowledgement Template Language<input value={customForm.orderAcknowledgementTemplateLanguage || 'en'} onChange={(e) => patchForm({ orderAcknowledgementTemplateLanguage: e.target.value })} placeholder="en" /></label>
              </div>
            </div>
            <button className="settings-primary-button" type="submit"><Save size={16} /> Save Customization</button>
            {settingsSaved && <small className="success-text">{settingsSaved}</small>}
          </form>
        </div>
      )}

      {activeSettingsTab === 'agents' && (
        <section className="settings-card settings-agents-card">
          <nav className="settings-subtabs" aria-label="Agents sections">
            <button className={activePeopleTab === 'agents' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('agents')}>Agents Management</button>
            <button className={activePeopleTab === 'teams' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('teams')}>Teams Management</button>
            <button className={activePeopleTab === 'roles' ? 'active' : ''} type="button" onClick={() => setActivePeopleTab('roles')}>Role Permissions</button>
          </nav>

          {activePeopleTab === 'agents' && (
            <>
              <div className="settings-table-toolbar">
                <span>{users.length} agents, {activeCount} active</span>
                {userRole === 'admin' && <button className="settings-primary-button" type="button" onClick={openAgentForm}><Plus size={18} /> Create Agent</button>}
              </div>
              {agentFormOpen && (
                <form className="settings-agent-form" onSubmit={submitAgent}>
                  <label>Name<input placeholder="Full name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
                  <label>Email<input placeholder="name@company.com" value={newUser.email} disabled={Boolean(editingUserId)} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
                  <label>Password<input placeholder={editingUserId ? 'Leave blank to keep old password' : '12+ chars with number & symbol'} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
                  <label>Role<select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="sales">Sales</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
                  <div className="settings-form-actions">
                    <button className="settings-primary-button" type="submit">{editingUserId ? 'Update Agent' : 'Save Agent'}</button>
                    <button className="settings-outline-button" type="button" onClick={() => { if (onCancelUserEdit) onCancelUserEdit(); setAgentFormOpen(false) }}>Cancel</button>
                  </div>
                </form>
              )}
              <div className="settings-agent-table">
                <div className="settings-agent-head"><span>Name</span><span>Username</span><span>Email</span><span>Role</span><span>Actions</span></div>
                {!users.length && <EmptyState title="No data" text="Create an agent to give this tenant access." />}
                {users.map((item) => (
                  <div className="settings-agent-row" key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.email?.split('@')[0] || '-'}</span>
                    <span>{item.email}</span>
                    <b className={`role-badge role-${item.role}`}>{item.role}</b>
                    <div className="settings-row-actions">
                      {userRole === 'admin' ? (
                        <>
                          <button type="button" onClick={() => editAgent(item)}><Pencil size={14} /> Edit</button>
                          <button type="button" onClick={() => onToggleUser(item)}>{item.active ? 'Deactivate' : 'Activate'}</button>
                          <button className="danger" type="button" onClick={() => onDeleteUser(item)}><Trash2 size={14} /> Delete</button>
                        </>
                      ) : <span>Admin only</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activePeopleTab === 'teams' && (
            <div className="settings-empty-panel">
              <Users size={34} />
              <strong>No teams configured</strong>
              <span>Create agents first. Team routing can be added safely after a tenant-scoped teams table exists.</span>
              {userRole === 'admin' && <button className="settings-outline-button" type="button" onClick={() => { setActivePeopleTab('agents'); openAgentForm() }}><Plus size={16} /> Create Agent</button>}
            </div>
          )}

          {activePeopleTab === 'roles' && (
            <div className="settings-role-grid">
              {[
                ['Admin', 'Full settings, users, WhatsApp setup and audit access'],
                ['Manager', 'Inbox monitoring, templates, settings review and reports'],
                ['Sales', 'Assigned inbox conversations and sales workflow actions'],
              ].map(([role, detail]) => (
                <div key={role}><strong>{role}</strong><span>{detail}</span></div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeSettingsTab === 'waba' && (
        <div className="settings-stack">
          <SettingToggleCard title="Marketing Messages Lite (MM Lite Status)" checked={Boolean(customForm.wabaMmLiteEnabled)} onChange={(checked) => savePatch({ wabaMmLiteEnabled: checked }, 'WABA setting saved')} />
          <SettingToggleCard title="Healthy Ecosystem Message Retry" checked={Boolean(customForm.wabaHealthyRetryEnabled)} onChange={(checked) => savePatch({ wabaHealthyRetryEnabled: checked }, 'WABA setting saved')} />
          <SettingToggleCard title="Whatsapp conversion events push to Meta" checked={Boolean(customForm.wabaConversionEventsEnabled)} onChange={(checked) => savePatch({ wabaConversionEventsEnabled: checked }, 'WABA setting saved')} />

          <section className="settings-card">
            <div className="settings-card-title"><Settings size={22} /><h3>WhatsApp Setup</h3></div>
            <div className="setup-grid">
              <span className={whatsappConfig?.accessTokenSet ? 'ok' : 'warn'}>Access token</span>
              <span className={whatsappConfig?.phoneNumberIdSet ? 'ok' : 'warn'}>Phone number ID</span>
              <span className={whatsappConfig?.phoneNumberMapped ? 'ok' : 'warn'}>Phone mapped</span>
              <span className={whatsappConfig?.verifyTokenSet ? 'ok' : 'warn'}>Verify token</span>
              <span className={whatsappConfig?.appSecretSet || !whatsappConfig?.webhookSignatureRequired ? 'ok' : 'warn'}>App secret</span>
              <span className={whatsappConfig?.testNumbersSet || status?.whatsappTestNumbersSet ? 'ok' : 'warn'}>Test numbers</span>
            </div>
            {whatsappConfig?.phoneNumberMappedTenantSlug && <p className="setup-copy">Incoming messages map to tenant: {whatsappConfig.phoneNumberMappedTenantSlug}</p>}
            {userRole === 'admin' && whatsappConfig?.phoneNumberIdSet && !whatsappConfig?.phoneNumberMappedToCurrentTenant && (
              <div className="inline-actions">
                <span className="setup-copy">Phone number ID is not mapped to this company.</span>
                <button type="button" onClick={onMapPhone}>Map Phone To This Company</button>
              </div>
            )}
            {warnings.length > 0 && <div className="warning-list">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
            <p className="setup-copy">Webhook: {whatsappConfig?.callbackUrl || '-'}</p>
            {userRole === 'admin' ? (
              <>
                <form className="dual-form" onSubmit={onTest}>
                  <input placeholder="Customer number" value={testMessage.to} onChange={(e) => setTestMessage({ ...testMessage, to: e.target.value })} />
                  <input placeholder="Test message inside 24-hour window only" value={testMessage.text} onChange={(e) => setTestMessage({ ...testMessage, text: e.target.value })} />
                  <button type="submit">Send Test</button>
                  <div className="suite-policy-note">
  Test message is a free-form WhatsApp message. It is allowed only when the customer has messaged within the last 24 hours, or backend will block it. Outside 24 hours, use an approved template.
</div>
                </form>
                <small className="setup-copy">Free-form test messages are allowed only inside the customer&apos;s 24-hour WhatsApp reply window.</small>
                {testResult && <small>{testResult}</small>}
              </>
            ) : <p className="setup-copy">WhatsApp test message is admin-only.</p>}
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

          <KnowledgeBaseManager />

          <section className="settings-card">
            <div className="module-title template-sync-head">
              <div><MessageCircle size={18} /><h3>Approved WhatsApp Templates</h3></div>
              <button type="button" onClick={onSyncTemplates} disabled={templateSyncing}>{templateSyncing ? 'Syncing...' : 'Sync from Meta'}</button>
            </div>
            <small className="setup-copy">Add only templates that are already approved in Meta WhatsApp Manager. This does not create templates inside Meta.</small>
            <form className="custom-form" onSubmit={onSaveTemplate}>
              <label>Template Name<input placeholder="quotation_followup" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></label>
              <label>Language<input placeholder="en_US" value={templateForm.language} onChange={(e) => setTemplateForm({ ...templateForm, language: e.target.value })} /></label>
              <label>Body Preview<textarea placeholder="Your quotation is ready. Please confirm." value={templateForm.body} onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })} /></label>
              <label className="settings-switch-row"><SwitchControl checked={Boolean(templateForm.active)} onChange={(checked) => setTemplateForm({ ...templateForm, active: checked })} /> Active</label>
              <div className="user-form-actions">
                <button className="user-action-primary" type="submit">{editingTemplateId ? 'Update Template' : 'Save Template'}</button>
                {editingTemplateId && <button className="user-action-neutral" type="button" onClick={onCancelTemplateEdit}>Cancel</button>}
              </div>
            </form>
            {!templates.length && <EmptyState title="No templates" text="Add approved Meta templates for expired 24-hour conversations." />}
            {!!templates.length && (
              <div className="user-table">
                <div className="user-table-head template-table-head"><span>Name</span><span>Language</span><span>Meta Status</span><span>Category</span><span>Active</span><span>Body</span><span>Actions</span></div>
                {templates.map((template) => (
                  <div className="user-row" key={template.id}>
                    <div className="user-name-cell"><strong>{template.name}</strong><small>ID: {String(template.id).slice(0, 8)}</small></div>
                    <span>{template.language}</span>
                    <i className={`meta-status-pill ${template.meta_status || 'manual'}`}>{template.meta_status || 'manual'}</i>
                    <span>{template.category || '-'}</span>
                    <i className={template.active ? 'status-active' : 'status-inactive'}>{template.active ? 'Active' : 'Inactive'}</i>
                    <span>{template.body}</span>
                    <div className="user-actions">
                      <button className="user-action-edit" type="button" onClick={() => onEditTemplate(template)}>Edit</button>
                      <button className={template.active ? 'user-action-pause' : 'user-action-enable'} type="button" onClick={() => onToggleTemplate(template)}>{template.active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeSettingsTab === 'billing' && (
        <form className="settings-card billing-form" onSubmit={(event) => { event.preventDefault(); onSaveSettings(customForm, 'Billing profile saved') }}>
          <div className="settings-card-title split"><div><CreditCard size={22} /><h3>Billing & GST Details / Business Information</h3></div><button className="settings-danger-outline" type="button" onClick={deleteBillingProfile}><Trash2 size={17} /> Delete Profile</button></div>
          <div className="settings-form-grid">
            <label><span className="required">*</span> Business Name<input required placeholder="Enter your business name" value={customForm.billingBusinessName || ''} onChange={(e) => patchForm({ billingBusinessName: e.target.value })} /></label>
            <label>GST Number<input placeholder="Enter GST number (optional)" value={customForm.billingGstNumber || ''} onChange={(e) => patchForm({ billingGstNumber: e.target.value.toUpperCase() })} /></label>
            <label>PAN Number<input placeholder="ENTER PAN NUMBER (OPTIONAL)" value={customForm.billingPanNumber || ''} onChange={(e) => patchForm({ billingPanNumber: e.target.value.toUpperCase() })} /></label>
            <label><span className="required">*</span> Country<select required value={customForm.billingCountry || 'India'} onChange={(e) => patchForm({ billingCountry: e.target.value })}><option value="India">India</option></select></label>
          </div>
          <div className="settings-section-divider"><Building2 size={21} /><strong>Billing Address</strong></div>
          <div className="settings-form-grid">
            <label><span className="required">*</span> State<input required placeholder="Select State" value={customForm.billingState || ''} onChange={(e) => patchForm({ billingState: e.target.value })} /></label>
            <label>City<input placeholder="Enter city name" value={customForm.billingCity || ''} onChange={(e) => patchForm({ billingCity: e.target.value })} /></label>
            <label className="wide"><span className="required">*</span> Billing Address<textarea required maxLength={200} placeholder="Enter complete billing address" value={customForm.billingAddress || ''} onChange={(e) => patchForm({ billingAddress: e.target.value })} /><small>{String(customForm.billingAddress || '').length} / 200</small></label>
            <label><span className="required">*</span> Pin Code<input required inputMode="numeric" maxLength={6} placeholder="Enter 6-digit pin code" value={customForm.billingPinCode || ''} onChange={(e) => patchForm({ billingPinCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
            <label><span className="required">*</span> Email<input required type="email" placeholder="Enter email address" value={customForm.billingEmail || ''} onChange={(e) => patchForm({ billingEmail: e.target.value })} /></label>
            <label><span className="required">*</span> Contact Number<input required inputMode="numeric" maxLength={10} placeholder="Enter 10-digit contact number" value={customForm.billingContactNumber || ''} onChange={(e) => patchForm({ billingContactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} /></label>
          </div>
          <div className="settings-form-actions bottom">
            <button className="settings-outline-button" type="button" onClick={() => patchForm(DEFAULT_BILLING_FIELDS)}>Reset</button>
            <button className="settings-primary-button" type="submit"><Save size={17} /> Save Profile</button>
          </div>
          {settingsSaved && <small className="success-text">{settingsSaved}</small>}
        </form>
      )}

      {activeSettingsTab === 'usage' && (
  <section className="settings-card">
    <div className="settings-card-title">
      <h3>Usage & Limits</h3>
    </div>

    <div className="settings-role-grid">
      <div>
        <strong>Contacts</strong>
        <span>Usage metrics are not connected yet</span>
      </div>

      <div>
        <strong>Messages</strong>
        <span>Usage metrics are not connected yet</span>
      </div>

      <div>
        <strong>Campaigns</strong>
        <span>Usage metrics are not connected yet</span>
      </div>

      <div>
        <strong>Storage</strong>
        <span>Usage metrics are not connected yet</span>
      </div>
    </div>
  </section>
)}

      {activeSettingsTab === 'voice' && (
        <form className="voice-settings-form" onSubmit={saveVoiceSettings}>
          <section className="settings-card">
            <div className="settings-card-title split">
              <div><PhoneCall size={22} /><h3>Voice Call Settings</h3></div>
              <div className="settings-form-actions">
                <button className="settings-outline-button" type="button" onClick={() => setVoiceHelpOpen((current) => !current)}><HelpCircle size={17} /> How it Works</button>
                <button className="settings-outline-button" type="button" onClick={() => setActiveSettingsTab('agents')}><Users size={17} /> Manage Agents</button>
              </div>
            </div>
            {voiceHelpOpen && <div className="settings-safe-note">These controls store tenant voice preferences only. WhatsApp calling availability depends on Meta account eligibility and approved product access.</div>}
            <VoiceToggleRow icon={PhoneCall} title="Allow voice calls" text="Make and receive calls with this phone number." checked={Boolean(customForm.voiceCallsEnabled)} onChange={(checked) => patchForm({ voiceCallsEnabled: checked })} />
            <VoiceToggleRow icon={Headphones} title="Allow people to request a callback for missed calls" text="If you're unable to answer a call, let people request a call back." checked={Boolean(customForm.voiceCallbackEnabled)} onChange={(checked) => patchForm({ voiceCallbackEnabled: checked })} />
            <VoiceToggleRow icon={Info} title="Display call buttons" text="People could still call this number from a message containing a call button." checked={customForm.voiceDisplayCallButtons !== false} onChange={(checked) => patchForm({ voiceDisplayCallButtons: checked })} />
          </section>

          <section className="settings-card">
            <div className="settings-card-title"><Clock3 size={22} /><h3>Available call hours</h3></div>
            <p className="settings-muted">Set regular calling hours for your business. If you don&apos;t set your call hours, people will always be able to call you.</p>
            <div className="settings-radio-row">
              <label><input type="radio" checked={(customForm.voiceCallHoursMode || 'specific') === 'all'} onChange={() => patchForm({ voiceCallHoursMode: 'all' })} /> All time</label>
              <label><input type="radio" checked={(customForm.voiceCallHoursMode || 'specific') === 'specific'} onChange={() => patchForm({ voiceCallHoursMode: 'specific' })} /> Specific time</label>
            </div>
            <label className="timezone-field">Time zone<select value={customForm.voiceTimeZone || 'Asia/Kolkata (GMT+05:30)'} onChange={(e) => patchForm({ voiceTimeZone: e.target.value })}><option>Asia/Kolkata (GMT+05:30)</option><option>UTC (GMT+00:00)</option></select></label>
            {(customForm.voiceCallHoursMode || 'specific') === 'specific' && (
              <div className="voice-hours-grid">
                {WEEK_DAYS.map((day) => (
                  <div className="voice-day-row" key={day}>
                    <SwitchControl checked={voiceWeeklyHours[day].enabled} onChange={(checked) => updateVoiceDay(day, { enabled: checked })} />
                    <strong>{day}</strong>
                    <div className="voice-slots">
                      {voiceWeeklyHours[day].slots.map((slot, slotIndex) => (
                        <div className="voice-slot-row" key={`${day}-${slotIndex}`}>
                          <span>Slot {slotIndex + 1}</span>
                          <input type="time" value={slot.start} onChange={(e) => updateVoiceSlot(day, slotIndex, 'start', e.target.value)} />
                          <span>to</span>
                          <input type="time" value={slot.end} onChange={(e) => updateVoiceSlot(day, slotIndex, 'end', e.target.value)} />
                          <button type="button" aria-label={`Add ${day} slot`} onClick={() => addVoiceSlot(day)}><Plus size={18} /></button>
                          {voiceWeeklyHours[day].slots.length > 1 && <button type="button" aria-label={`Remove ${day} slot`} onClick={() => removeVoiceSlot(day, slotIndex)}><X size={18} /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="settings-section-divider"><CalendarClock size={21} /><strong>Holiday list / Unavailable call hours</strong></div>
            <p className="settings-muted">Set custom times, such as holidays or special events, when your business is unable to receive calls.</p>
            {!unavailableHours.length && <div className="settings-no-entries">No entries</div>}
            {unavailableHours.map((entry, index) => (
              <div className="unavailable-row" key={`${entry.date}-${index}`}>
                <input type="date" value={entry.date || ''} onChange={(e) => updateUnavailableHours(index, 'date', e.target.value)} />
                <input type="time" value={entry.start || '00:00'} onChange={(e) => updateUnavailableHours(index, 'start', e.target.value)} />
                <input type="time" value={entry.end || '23:59'} onChange={(e) => updateUnavailableHours(index, 'end', e.target.value)} />
                <input placeholder="Reason" value={entry.reason || ''} onChange={(e) => updateUnavailableHours(index, 'reason', e.target.value)} />
                <button type="button" onClick={() => removeUnavailableHours(index)}><Trash2 size={16} /></button>
              </div>
            ))}
            <button className="settings-outline-button add-unavailable" type="button" onClick={addUnavailableHours}><Plus size={17} /> Add unavailable hours</button>
          </section>
          <button className="settings-primary-button centered" type="submit">Save</button>
          {settingsSaved && <small className="success-text centered-text">{settingsSaved}</small>}
        </form>
      )}

      {activeSettingsTab === 'inbox' && (
        <section className="settings-card inbox-settings-card">
          <div className="settings-card-title"><Inbox size={22} /><h3>Default Chat Assignment</h3></div>
          <label className="settings-switch-row large">
            <SwitchControl checked={Boolean(customForm.inboxAutoAssign)} onChange={(checked) => patchForm({ inboxAutoAssign: checked })} />
            Auto-assign new chats
          </label>
          <button className="settings-primary-button centered" type="button" onClick={() => onSaveSettings(customForm, 'Inbox settings saved')}>Save</button>
          {settingsSaved && <small className="success-text centered-text">{settingsSaved}</small>}
        </section>
      )}
    </div>
  )
}

export function normalizeVoiceWeeklyHours(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return WEEK_DAYS.reduce((acc, day) => {
    const dayValue = source[day] && typeof source[day] === 'object' ? source[day] : DEFAULT_VOICE_WEEKLY_HOURS[day]
    const slots = Array.isArray(dayValue.slots) && dayValue.slots.length
      ? dayValue.slots.map((slot) => ({
        start: String(slot.start || '00:00').slice(0, 5),
        end: String(slot.end || '23:59').slice(0, 5),
      }))
      : [{ start: '00:00', end: '23:59' }]
    acc[day] = { enabled: dayValue.enabled !== false, slots }
    return acc
  }, {})
}

export function SwitchControl({ checked, label, onChange }) {
  return (
    <button className={`settings-switch ${checked ? 'on' : ''}`} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span />
      {label && <b>{label}</b>}
    </button>
  )
}

export function SettingToggleCard({ title, checked, onChange }) {
  return (
    <section className="settings-card setting-toggle-card">
      <div className="settings-card-title"><h3>{title}</h3><Info size={18} /></div>
      <SwitchControl checked={checked} label={checked ? 'ON' : 'OFF'} onChange={onChange} />
    </section>
  )
}

export function VoiceToggleRow({ icon: Icon, title, text, checked, onChange }) {
  return (
    <div className="voice-toggle-row">
      <span><Icon size={22} /></span>
      <div><strong>{title}</strong><small>{text}</small></div>
      <SwitchControl checked={checked} onChange={onChange} />
    </div>
  )
}
