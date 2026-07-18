import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

type ShowToast = (text: string, type?: 'success' | 'error') => void

const CONTACT_IMPORT_LIMIT = 1000
const CONTACT_IMPORT_MAX_FILE_SIZE_BYTES = 1024 * 1024

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

type ContactsPageProps = {
  apiUrl: string
  showToast: ShowToast
}

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

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json()

    if (typeof data.message === 'string') {
      return data.message
    }

    if (typeof data.message?.message === 'string') {
      return data.message.message
    }

    if (typeof data.error === 'string') {
      return data.error
    }

    return fallback
  } catch {
    return fallback
  }
}

export function ContactsPage({ apiUrl, showToast }: ContactsPageProps) {
  const [contactsTab, setContactsTab] = useState<ContactsTab>('list')
  const [contactSearch, setContactSearch] = useState('')
  const [contactTypeFilter, setContactTypeFilter] = useState('all')
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all')
  const [contactSort, setContactSort] = useState<ContactSort>('newest')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTypes, setContactTypes] = useState<ContactType[]>([])
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

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

  async function loadContactTypes() {
    const response = await fetch(`${apiUrl}/contact-types`, {
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
    const response = await fetch(`${apiUrl}/contacts`, {
      credentials: 'include',
    })

    if (!response.ok) {
      setContacts([])
      return
    }

    const data = await response.json()
    setContacts(data)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContacts()
      void loadContactTypes()
    }, 0)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreateContactType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const color = String(form.get('color') || '').trim()

    if (!name) {
      showToast('Contact type name is required', 'error')
      return
    }

    const response = await fetch(`${apiUrl}/contact-types`, {
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

    const response = await fetch(`${apiUrl}/contact-types/${contactTypeId}`, {
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
      const response = await fetch(`${apiUrl}/contacts/export.csv`, {
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

      const response = await fetch(`${apiUrl}/contacts/import`, {
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

    const response = await fetch(`${apiUrl}/contacts`, {
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

    const response = await fetch(`${apiUrl}/contacts/${editingContact.id}`, {
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
    const response = await fetch(`${apiUrl}/contacts/${contactId}/opt-out`, {
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

    const response = await fetch(`${apiUrl}/contacts/${contactId}/opt-in`, {
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

    const response = await fetch(`${apiUrl}/contacts/${contactId}`, {
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
