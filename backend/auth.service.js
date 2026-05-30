function createAuthService({
  jwt,
  jwtSecret,
  isProduction,
  query,
  getCookie,
}) {
  function signUser(user) {
    return jwt.sign(
      { id: user.id, tenantId: user.tenant_id, name: user.name, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '12h' },
    );
  }

  function publicUser(user) {
    return {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }

  function authCookieOptions() {
    const cookieNeedsCrossSiteMode =
      isProduction ||
      process.env.COOKIE_SECURE === 'true' ||
      process.env.RENDER === 'true' ||
      String(process.env.FRONTEND_URL || '').startsWith('https://') ||
      String(process.env.FRONTEND_URLS || '').includes('https://') ||
      String(process.env.PUBLIC_BASE_URL || '').startsWith('https://');

    return {
      httpOnly: true,
      secure: cookieNeedsCrossSiteMode,
      sameSite: cookieNeedsCrossSiteMode ? 'none' : 'lax',
      partitioned: cookieNeedsCrossSiteMode || undefined,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    };
  }

  function setAuthCookie(res, user) {
    res.cookie('bosAuthToken', signUser(user), authCookieOptions());
  }

  function clearAuthCookie(res) {
    const cookieNeedsCrossSiteMode =
      isProduction ||
      process.env.COOKIE_SECURE === 'true' ||
      process.env.RENDER === 'true' ||
      String(process.env.FRONTEND_URL || '').startsWith('https://') ||
      String(process.env.FRONTEND_URLS || '').includes('https://') ||
      String(process.env.PUBLIC_BASE_URL || '').startsWith('https://');

    res.clearCookie('bosAuthToken', {
      httpOnly: true,
      secure: cookieNeedsCrossSiteMode,
      sameSite: cookieNeedsCrossSiteMode ? 'none' : 'lax',
      partitioned: cookieNeedsCrossSiteMode || undefined,
      path: '/',
    });
  }

  async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : getCookie(req, 'bosAuthToken');

    if (!token) {
      return res.status(401).json({ error: 'Login required' });
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);

      if (!decoded.id || !decoded.tenantId) {
        return res.status(401).json({ error: 'Invalid login session' });
      }

      const result = await query(
        `SELECT
           users.id,
           users.tenant_id,
           users.name,
           users.email,
           users.role,
           users.active,
           tenants.status AS tenant_status
         FROM users
         JOIN tenants ON tenants.id = users.tenant_id
         WHERE users.id = $1
           AND users.tenant_id = $2
         LIMIT 1`,
        [decoded.id, decoded.tenantId],
      );

      const user = result.rows[0];

      if (!user || !user.active || user.tenant_status !== 'active') {
        return res.status(401).json({ error: 'User or company is inactive' });
      }

      req.user = {
        id: user.id,
        tenantId: user.tenant_id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function isSuperAdmin(user) {
    return user?.role === 'super_admin';
  }

  function canMonitor(user) {
    return isSuperAdmin(user) || user.role === 'admin' || user.role === 'manager';
  }

  function requireSuperAdmin(req, res, next) {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Super admin only' });
    }

    return next();
  }

  return {
    signUser,
    publicUser,
    authCookieOptions,
    setAuthCookie,
    clearAuthCookie,
    requireAuth,
    isSuperAdmin,
    canMonitor,
    requireSuperAdmin,
  };
}

module.exports = {
  createAuthService,
};
