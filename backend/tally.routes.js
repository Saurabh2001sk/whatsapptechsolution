function registerTallyRoutes(app, ctx) {
  const {
    axios,
    query,
    asyncHandler,
    rateLimit,
    requireAuth,
    canMonitor,
    recordAudit,
    safeErrorLog,
    isProduction,
  } = ctx;

  const DEFAULT_TALLY_SETTINGS = {
    enabled: false,
    productType: 'tallyprime',
    gatewayUrl: '',
    companyName: '',
    salesVoucherType: 'Sales',
    salesLedgerName: 'Sales',
    salesLedgerParent: 'Sales Accounts',
    customerLedgerParent: 'Sundry Debtors',
  };

  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    return next();
  }

  function cleanText(value = '', maxLength = 160) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  function cleanGatewayUrl(value = '') {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Valid Tally gateway URL required');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Tally gateway URL must start with http:// or https://');
    }

    if (isProduction && parsed.protocol !== 'https:') {
      throw new Error('Production Tally gateway URL must use HTTPS.');
    }

    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isPrivateHost = /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    if (isProduction && (isLocalHost || isPrivateHost)) {
      throw new Error('Render backend cannot reach local/private Tally URL. Use a public HTTPS bridge or deploy backend inside the same office network.');
    }

    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  function normalizeSettings(body = {}) {
    const gatewayUrl = cleanGatewayUrl(body.gatewayUrl || body.gateway_url || '');
    const enabled = body.enabled === true || body.enabled === 'true';
    const allowedProductTypes = new Set(['tallyprime', 'tally_erp9', 'other']);
    const productType = String(body.productType || body.product_type || DEFAULT_TALLY_SETTINGS.productType).trim().toLowerCase();

    if (enabled && !gatewayUrl) {
      throw new Error('Tally gateway URL required before enabling integration');
    }

    if (!allowedProductTypes.has(productType)) {
      throw new Error('Select a valid Tally product type');
    }

    return {
      enabled,
      productType,
      gatewayUrl,
      companyName: cleanText(body.companyName || body.company_name || '', 120),
      salesVoucherType: cleanText(body.salesVoucherType || body.sales_voucher_type || DEFAULT_TALLY_SETTINGS.salesVoucherType, 80) || DEFAULT_TALLY_SETTINGS.salesVoucherType,
      salesLedgerName: cleanText(body.salesLedgerName || body.sales_ledger_name || DEFAULT_TALLY_SETTINGS.salesLedgerName, 120) || DEFAULT_TALLY_SETTINGS.salesLedgerName,
      salesLedgerParent: cleanText(body.salesLedgerParent || body.sales_ledger_parent || DEFAULT_TALLY_SETTINGS.salesLedgerParent, 120) || DEFAULT_TALLY_SETTINGS.salesLedgerParent,
      customerLedgerParent: cleanText(body.customerLedgerParent || body.customer_ledger_parent || DEFAULT_TALLY_SETTINGS.customerLedgerParent, 120) || DEFAULT_TALLY_SETTINGS.customerLedgerParent,
    };
  }

  function publicSettings(row = null) {
    if (!row) return { ...DEFAULT_TALLY_SETTINGS, lastTestedAt: null, lastTestStatus: '', lastError: '' };

    return {
      enabled: row.enabled === true,
      productType: row.product_type || DEFAULT_TALLY_SETTINGS.productType,
      gatewayUrl: row.gateway_url || '',
      companyName: row.company_name || '',
      salesVoucherType: row.sales_voucher_type || DEFAULT_TALLY_SETTINGS.salesVoucherType,
      salesLedgerName: row.sales_ledger_name || DEFAULT_TALLY_SETTINGS.salesLedgerName,
      salesLedgerParent: row.sales_ledger_parent || DEFAULT_TALLY_SETTINGS.salesLedgerParent,
      customerLedgerParent: row.customer_ledger_parent || DEFAULT_TALLY_SETTINGS.customerLedgerParent,
      lastTestedAt: row.last_tested_at || null,
      lastTestStatus: row.last_test_status || '',
      lastError: row.last_error || '',
    };
  }

  function xmlEscape(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function tallyDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return tallyDate(new Date());
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  function amountValue(value) {
    return Math.max(0, Number(value || 0)).toFixed(2);
  }

  function companyStaticVariables(settings) {
    if (!settings.companyName) return '';

    return `
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${xmlEscape(settings.companyName)}</SVCURRENTCOMPANY>
          </STATICVARIABLES>`;
  }

  function buildConnectionTestXml(settings) {
    return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>${companyStaticVariables(settings)}
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  function buildLedgerMastersXml(settings, order) {
    const partyLedgerName = cleanText(order.contact_name || order.phone || 'WhatsApp Customer', 120);

    return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>${companyStaticVariables(settings)}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${xmlEscape(partyLedgerName)}" ACTION="Create">
            <NAME>${xmlEscape(partyLedgerName)}</NAME>
            <PARENT>${xmlEscape(settings.customerLedgerParent)}</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
          <LEDGER NAME="${xmlEscape(settings.salesLedgerName)}" ACTION="Create">
            <NAME>${xmlEscape(settings.salesLedgerName)}</NAME>
            <PARENT>${xmlEscape(settings.salesLedgerParent)}</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  function buildSalesVoucherXml(settings, order) {
    const partyLedgerName = cleanText(order.contact_name || order.phone || 'WhatsApp Customer', 120);
    const amount = amountValue(order.amount);
    const itemSummary = (order.items || [])
      .map((item) => `${item.description || 'Item'} ${Number(item.quantity || 0)} ${item.unit || ''} x ${Number(item.rate || 0)}`.trim())
      .join('; ')
      .slice(0, 800);
    const narration = cleanText([order.notes, itemSummary, `Source: ${order.source || 'WhatsApp'}`].filter(Boolean).join(' | '), 1000);

    return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>${companyStaticVariables(settings)}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${xmlEscape(settings.salesVoucherType)}" ACTION="Create">
            <GUID>BOS-WA-${xmlEscape(order.id)}</GUID>
            <DATE>${tallyDate(order.created_at)}</DATE>
            <VOUCHERTYPENAME>${xmlEscape(settings.salesVoucherType)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(order.order_no)}</VOUCHERNUMBER>
            <REFERENCE>${xmlEscape(order.order_no)}</REFERENCE>
            <PARTYLEDGERNAME>${xmlEscape(partyLedgerName)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <NARRATION>${xmlEscape(narration)}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(partyLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(order.order_no)}</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>-${amount}</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(settings.salesLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  function tagNumber(xml = '', tagName = '') {
    const match = String(xml || '').match(new RegExp(`<${tagName}>\\s*(-?\\d+)\\s*</${tagName}>`, 'i'));
    return match ? Number(match[1]) : 0;
  }

  function tagText(xml = '', tagName = '') {
    const match = String(xml || '').match(new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, 'i'));
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  function parseTallyResponse(xml = '') {
    const responseText = String(xml || '');
    const created = tagNumber(responseText, 'CREATED');
    const altered = tagNumber(responseText, 'ALTERED');
    const errors = tagNumber(responseText, 'ERRORS');
    const exceptions = tagNumber(responseText, 'EXCEPTIONS');
    const lineError = tagText(responseText, 'LINEERROR') || tagText(responseText, 'LASTVCHID');
    const hasEnvelope = /<ENVELOPE[\s>]/i.test(responseText) || /<RESPONSE[\s>]/i.test(responseText);

    return {
      ok: hasEnvelope && errors === 0 && exceptions === 0 && !tagText(responseText, 'LINEERROR'),
      created,
      altered,
      errors,
      exceptions,
      lineError,
      raw: responseText.slice(0, 20000),
    };
  }

  function isAlreadyExistsResponse(parsed) {
    return /already\s+exists|duplicate/i.test(parsed.lineError || '');
  }

  async function postTallyXml(settings, xml) {
    const response = await axios.post(settings.gatewayUrl, xml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: Number(process.env.TALLY_REQUEST_TIMEOUT_MS || 20000),
      responseType: 'text',
      transformResponse: [(data) => data],
    });

    return parseTallyResponse(response.data);
  }

  async function getSavedSettings(tenantId) {
    const result = await query(
      `SELECT *
       FROM tally_settings
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );

    return result.rows[0] || null;
  }

  async function getOrderForTally(tenantId, orderId) {
    const result = await query(
      `SELECT o.*, c.name AS contact_name, c.phone,
              COALESCE(json_agg(soi ORDER BY soi.created_at) FILTER (WHERE soi.id IS NOT NULL), '[]') AS items
       FROM sales_orders o
       LEFT JOIN contacts c ON c.id = o.contact_id AND c.tenant_id = o.tenant_id
       LEFT JOIN sales_order_items soi ON soi.order_id = o.id AND soi.tenant_id = o.tenant_id
       WHERE o.id = $1
         AND o.tenant_id = $2
       GROUP BY o.id, c.name, c.phone
       LIMIT 1`,
      [orderId, tenantId],
    );

    return result.rows[0] || null;
  }

  async function createSyncLog({ tenantId, userId, entityType, entityId, action, status, requestXml, responseXml, error, tallyReference }) {
    const result = await query(
      `INSERT INTO tally_sync_logs
         (tenant_id, entity_type, entity_id, action, status, tally_reference, request_xml, response_xml, error, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       RETURNING *`,
      [tenantId, entityType, entityId, action, status, tallyReference || null, requestXml || null, responseXml || null, error || null, userId],
    );

    return result.rows[0];
  }

  app.get('/api/tally/settings', requireAuth, asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const settings = await getSavedSettings(req.user.tenantId);
    res.json(publicSettings(settings));
  }));

  app.put('/api/tally/settings', requireAuth, requireAdmin, rateLimit({
    bucketName: 'tally-settings',
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    let settings;
    try {
      settings = normalizeSettings(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const result = await query(
      `INSERT INTO tally_settings
         (tenant_id, enabled, product_type, gateway_url, company_name, sales_voucher_type, sales_ledger_name, sales_ledger_parent, customer_ledger_parent, created_by, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,now())
       ON CONFLICT (tenant_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     product_type = EXCLUDED.product_type,
                     gateway_url = EXCLUDED.gateway_url,
                     company_name = EXCLUDED.company_name,
                     sales_voucher_type = EXCLUDED.sales_voucher_type,
                     sales_ledger_name = EXCLUDED.sales_ledger_name,
                     sales_ledger_parent = EXCLUDED.sales_ledger_parent,
                     customer_ledger_parent = EXCLUDED.customer_ledger_parent,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()
       RETURNING *`,
      [
        req.user.tenantId,
        settings.enabled,
        settings.productType,
        settings.gatewayUrl,
        settings.companyName,
        settings.salesVoucherType,
        settings.salesLedgerName,
        settings.salesLedgerParent,
        settings.customerLedgerParent,
        req.user.id,
      ],
    );

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'tally.settings_saved',
      entityType: 'tally_settings',
      entityId: req.user.tenantId,
      metadata: {
        enabled: settings.enabled,
        productType: settings.productType,
        gatewayHost: settings.gatewayUrl ? new URL(settings.gatewayUrl).host : '',
      },
    });

    res.json(publicSettings(result.rows[0]));
  }));

  app.post('/api/tally/test', requireAuth, requireAdmin, rateLimit({
    bucketName: 'tally-test',
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    const saved = await getSavedSettings(req.user.tenantId);
    const merged = normalizeSettings({
      ...publicSettings(saved),
      ...req.body,
      enabled: req.body?.enabled ?? publicSettings(saved).enabled,
    });

    if (!merged.gatewayUrl) {
      return res.status(400).json({ error: 'Save Tally gateway URL first' });
    }

    const requestXml = buildConnectionTestXml(merged);

    try {
      const parsed = await postTallyXml(merged, requestXml);
      const status = parsed.ok ? 'connected' : 'failed';
      const errorText = parsed.ok ? '' : (parsed.lineError || 'Tally returned an error response');

      await query(
        `UPDATE tally_settings
         SET last_tested_at = now(),
             last_test_status = $3,
             last_error = $4,
             updated_by = $5,
             updated_at = now()
         WHERE tenant_id = $1
           AND gateway_url = $2`,
        [req.user.tenantId, merged.gatewayUrl, status, errorText, req.user.id],
      );

      await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'tally_connection',
        entityId: req.user.tenantId,
        action: 'test_connection',
        status,
        requestXml,
        responseXml: parsed.raw,
        error: errorText,
      });

      if (!parsed.ok) {
        return res.status(502).json({ ok: false, error: errorText, response: parsed });
      }

      return res.json({ ok: true, message: 'Tally gateway connected', response: parsed });
    } catch (error) {
      const safeError = safeErrorLog(error);
      await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'tally_connection',
        entityId: req.user.tenantId,
        action: 'test_connection',
        status: 'failed',
        requestXml,
        responseXml: null,
        error: safeError.message,
      });

      return res.status(502).json({ ok: false, error: safeError.message || 'Tally gateway connection failed' });
    }
  }));

  app.get('/api/tally/logs', requireAuth, asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const result = await query(
      `SELECT id, entity_type, entity_id, action, status, tally_reference, error, created_at, updated_at
       FROM tally_sync_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.tenantId],
    );

    res.json(result.rows);
  }));

  app.post('/api/tally/orders/:id/sync', requireAuth, rateLimit({
    bucketName: 'tally-order-sync',
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const settingsRow = await getSavedSettings(req.user.tenantId);
    const settings = publicSettings(settingsRow);

    if (!settings.enabled || !settings.gatewayUrl) {
      return res.status(400).json({ error: 'Tally integration is not enabled for this company' });
    }

    const order = await getOrderForTally(req.user.tenantId, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (Number(order.amount || 0) <= 0) {
      return res.status(400).json({ error: 'Order amount must be greater than zero before Tally sync' });
    }

    const alreadySynced = await query(
      `SELECT id, tally_reference, created_at
       FROM tally_sync_logs
       WHERE tenant_id = $1
         AND entity_type = 'sales_order'
         AND entity_id = $2
         AND action = 'push_sales_voucher'
         AND status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.tenantId, order.id],
    );

    if (alreadySynced.rows[0] && req.body?.force !== true) {
      return res.status(409).json({
        error: 'Order already synced to Tally. Use force sync only after checking duplicates in Tally.',
        syncedAt: alreadySynced.rows[0].created_at,
        tallyReference: alreadySynced.rows[0].tally_reference,
      });
    }

    const mastersXml = buildLedgerMastersXml(settings, order);
    const voucherXml = buildSalesVoucherXml(settings, order);
    const combinedRequest = `${mastersXml}\n\n---VOUCHER---\n\n${voucherXml}`;

    try {
      const mastersResponse = await postTallyXml(settings, mastersXml);
      if (!mastersResponse.ok && !isAlreadyExistsResponse(mastersResponse)) {
        const log = await createSyncLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          entityType: 'sales_order',
          entityId: order.id,
          action: 'push_sales_voucher',
          status: 'failed',
          tallyReference: order.order_no,
          requestXml: combinedRequest,
          responseXml: mastersResponse.raw,
          error: mastersResponse.lineError || 'Tally ledger master creation failed',
        });

        return res.status(502).json({ ok: false, error: log.error, logId: log.id });
      }

      const voucherResponse = await postTallyXml(settings, voucherXml);
      if (!voucherResponse.ok) {
        const log = await createSyncLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          entityType: 'sales_order',
          entityId: order.id,
          action: 'push_sales_voucher',
          status: 'failed',
          tallyReference: order.order_no,
          requestXml: combinedRequest,
          responseXml: voucherResponse.raw,
          error: voucherResponse.lineError || 'Tally voucher import failed',
        });

        return res.status(502).json({ ok: false, error: log.error, response: voucherResponse, logId: log.id });
      }

      const log = await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'sales_order',
        entityId: order.id,
        action: 'push_sales_voucher',
        status: 'success',
        tallyReference: order.order_no,
        requestXml: combinedRequest,
        responseXml: voucherResponse.raw,
        error: '',
      });

      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'tally.sales_order_synced',
        entityType: 'sales_order',
        entityId: order.id,
        metadata: {
          orderNo: order.order_no,
          amount: order.amount,
          logId: log.id,
        },
      });

      return res.json({ ok: true, message: 'Order synced to Tally', log, response: voucherResponse });
    } catch (error) {
      const safeError = safeErrorLog(error);
      const log = await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'sales_order',
        entityId: order.id,
        action: 'push_sales_voucher',
        status: 'failed',
        tallyReference: order.order_no,
        requestXml: combinedRequest,
        responseXml: null,
        error: safeError.message,
      });

      return res.status(502).json({ ok: false, error: safeError.message || 'Tally sync failed', logId: log.id });
    }
  }));
}

module.exports = {
  registerTallyRoutes,
};
