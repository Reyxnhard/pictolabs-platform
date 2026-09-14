import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:4000/api';

export const ProvisioningTestPage: React.FC = () => {
  // Auth state
  const [email, setEmail] = useState('admin@pictolabs.id');
  const [password, setPassword] = useState('pictolabs2026');
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('pictolabs_auth_token') || '');
  const [currentUser, setCurrentUser] = useState<string>('');

  // Fleet & Device data
  const [devices, setDevices] = useState<any[]>([]);
  const [booths, setBooths] = useState<any[]>([]);
  const [selectedBoothId, setSelectedBoothId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Action Inputs
  const [ttlMinutes, setTtlMinutes] = useState<number>(15);
  const [tokenToValidate, setTokenToValidate] = useState('');
  const [tokenToActivate, setTokenToActivate] = useState('');
  const [machineGuid, setMachineGuid] = useState(`WIN-GUID-${Math.floor(1000 + Math.random() * 9000)}`);
  const [hostname, setHostname] = useState('DESKTOP-KIOSK-01');

  // Results / Logs
  const [actionLog, setActionLog] = useState<any>(null);
  const [lastGeneratedToken, setLastGeneratedToken] = useState<string>('');

  const logResult = (action: string, status: number | string, data: any) => {
    setActionLog({
      action,
      status,
      timestamp: new Date().toLocaleTimeString(),
      data,
    });
  };

  const getHeaders = (useAuth = true) => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (useAuth && authToken) {
      h['Authorization'] = `Bearer ${authToken}`;
    }
    return h;
  };

  // 1. Admin Login
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
      const token = res.data.accessToken;
      setAuthToken(token);
      localStorage.setItem('pictolabs_auth_token', token);
      setCurrentUser(res.data.user?.email || email);
      logResult('Admin Login', res.status, res.data);
      fetchFleetData(token);
    } catch (err: any) {
      logResult('Admin Login FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setCurrentUser('');
    localStorage.removeItem('pictolabs_auth_token');
    logResult('Logout', 'OK', { message: 'Logged out successfully' });
  };

  // Fetch Fleet / Devices
  const fetchFleetData = async (token = authToken) => {
    if (!token) return;
    try {
      const [devRes, boothRes] = await Promise.all([
        axios.get(`${API_BASE}/provisioning/devices`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/provisioning/booths`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setDevices(devRes.data || []);
      setBooths(boothRes.data || []);
      if (boothRes.data?.length > 0 && !selectedBoothId) {
        setSelectedBoothId(boothRes.data[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching fleet data:', err);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchFleetData();
    }
  }, [authToken]);

  // 2. Generate Token
  const handleGenerateToken = async () => {
    if (!selectedBoothId) {
      alert('Pilih Booth terlebih dahulu');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/provisioning/tokens/generate`,
        { boothId: selectedBoothId, ttlMinutes: Number(ttlMinutes) },
        { headers: getHeaders(true) }
      );
      setLastGeneratedToken(res.data.token);
      setTokenToValidate(res.data.token);
      setTokenToActivate(res.data.token);
      logResult('Generate Token', res.status, res.data);
      fetchFleetData();
    } catch (err: any) {
      logResult('Generate Token FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Validate Token
  const handleValidateToken = async () => {
    if (!tokenToValidate) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/provisioning/tokens/${encodeURIComponent(tokenToValidate)}/validate`);
      logResult('Validate Token', res.status, res.data);
    } catch (err: any) {
      logResult('Validate Token FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Activate Device
  const handleActivateDevice = async () => {
    if (!tokenToActivate) {
      alert('Masukkan Token untuk aktivasi');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/provisioning/activate`, {
        token: tokenToActivate,
        deviceFingerprint: {
          machineGuid,
          hostname,
          osVersion: 'Windows 11 Pro 23H2',
          electronVersion: '28.2.0',
          appVersion: '1.2.0',
        },
      });
      logResult('Activate Device', res.status, res.data);
      fetchFleetData();
    } catch (err: any) {
      logResult('Activate Device FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. Re-pair Device
  const handleRePair = async (boothIdToRepair = selectedBoothId) => {
    if (!boothIdToRepair) return;
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/provisioning/re-pair`,
        { boothId: boothIdToRepair },
        { headers: getHeaders(true) }
      );
      setLastGeneratedToken(res.data.token);
      setTokenToValidate(res.data.token);
      setTokenToActivate(res.data.token);
      logResult('Re-pair Hardware', res.status, res.data);
      fetchFleetData();
    } catch (err: any) {
      logResult('Re-pair Hardware FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // 6. Revoke Device
  const handleRevoke = async (boothIdToRevoke = selectedBoothId) => {
    if (!boothIdToRevoke) return;
    if (!confirm('Yakin ingin melakukan emergency revoke untuk booth ini?')) return;
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/provisioning/devices/${boothIdToRevoke}/revoke`,
        {},
        { headers: getHeaders(true) }
      );
      logResult('Revoke Device', res.status, res.data);
      fetchFleetData();
    } catch (err: any) {
      logResult('Revoke Device FAILED', err.response?.status || 'ERR', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace, sans-serif', padding: '24px', maxWidth: '1200px', margin: '0 auto', background: '#0f172a', color: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #334155', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#38bdf8' }}>PICTOLABS PROVISIONING — TEST UI</h1>
          <span style={{ fontSize: '12px', background: '#f59e0b', color: '#000', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
            TEMPORARY LOCAL TESTING BENCH
          </span>
        </div>
        <div>
          {authToken ? (
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: '#4ade80', marginRight: '12px' }}>● Authenticated: {currentUser || 'Admin'}</span>
              <button onClick={handleLogout} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                Logout
              </button>
            </div>
          ) : (
            <span style={{ color: '#f87171' }}>● Unauthenticated (Login required for admin actions)</span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Column: Forms */}
        <div>
          {/* SECTION 1: Admin Login */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#93c5fd' }}>1. Admin Authentication</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin Email"
                style={{ flex: 1, minWidth: '180px', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
              />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                style={{ flex: 1, minWidth: '140px', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
              />
              <button
                id="btn-admin-login"
                type="submit"
                disabled={loading}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Login
              </button>
            </form>
          </div>

          {/* SECTION 2: Provisioning Operations */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#93c5fd' }}>2. Provisioning Operations</h2>

            {/* Target Booth Selector */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Target Booth:</label>
              <select
                id="select-target-booth"
                value={selectedBoothId}
                onChange={(e) => setSelectedBoothId(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
              >
                {booths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.branch?.name || 'No Branch'}) - [{b.id.slice(0, 8)}...]
                  </option>
                ))}
              </select>
            </div>

            {/* Action A: Generate Token */}
            <div style={{ padding: '12px', background: '#0f172a', borderRadius: '6px', marginBottom: '12px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#38bdf8' }}>A. Generate Activation Token (Admin Only)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="input-ttl-minutes"
                  type="number"
                  value={ttlMinutes}
                  onChange={(e) => setTtlMinutes(Number(e.target.value))}
                  placeholder="TTL (mins)"
                  style={{ width: '90px', padding: '6px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
                />
                <button
                  id="btn-generate-token"
                  onClick={handleGenerateToken}
                  disabled={loading || !authToken}
                  style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Generate Token
                </button>
              </div>
              {lastGeneratedToken && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#a7f3d0' }}>
                  Latest Token: <b style={{ fontSize: '14px', color: '#34d399' }}>{lastGeneratedToken}</b>
                </div>
              )}
            </div>

            {/* Action B: Validate Token */}
            <div style={{ padding: '12px', background: '#0f172a', borderRadius: '6px', marginBottom: '12px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#38bdf8' }}>B. Validate Token (Public Kiosk Check)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="input-validate-token"
                  type="text"
                  value={tokenToValidate}
                  onChange={(e) => setTokenToValidate(e.target.value)}
                  placeholder="e.g. ACT-XXXX-XXXX"
                  style={{ flex: 1, padding: '6px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
                />
                <button
                  id="btn-validate-token"
                  onClick={handleValidateToken}
                  disabled={loading}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Validate
                </button>
              </div>
            </div>

            {/* Action C: Activate Device */}
            <div style={{ padding: '12px', background: '#0f172a', borderRadius: '6px', marginBottom: '12px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#38bdf8' }}>C. Activate Physical Device (Handshake)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <input
                  id="input-activate-token"
                  type="text"
                  value={tokenToActivate}
                  onChange={(e) => setTokenToActivate(e.target.value)}
                  placeholder="Token (ACT-...)"
                  style={{ padding: '6px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
                />
                <input
                  id="input-activate-hostname"
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="Hostname"
                  style={{ padding: '6px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
                />
              </div>
              <input
                id="input-activate-guid"
                type="text"
                value={machineGuid}
                onChange={(e) => setMachineGuid(e.target.value)}
                placeholder="Machine GUID"
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: '4px', marginBottom: '8px' }}
              />
              <button
                id="btn-activate-device"
                onClick={handleActivateDevice}
                disabled={loading}
                style={{ width: '100%', background: '#0284c7', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Perform Device Activation Handshake
              </button>
            </div>

            {/* Action D: Re-pair & Revoke */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                id="btn-repair-device"
                onClick={() => handleRePair()}
                disabled={loading || !authToken}
                style={{ flex: 1, background: '#f59e0b', color: '#000', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Re-Pair (Swap)
              </button>
              <button
                id="btn-revoke-device"
                onClick={() => handleRevoke()}
                disabled={loading || !authToken}
                style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Revoke Device
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Real-time Response & Console */}
        <div>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#93c5fd' }}>API Response Inspector</h2>
              {actionLog && (
                <span style={{ fontSize: '12px', background: String(actionLog.status).startsWith('2') ? '#15803d' : '#b91c1c', padding: '2px 8px', borderRadius: '4px' }}>
                  HTTP {actionLog.status}
                </span>
              )}
            </div>

            {actionLog ? (
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Action: <b style={{ color: '#38bdf8' }}>{actionLog.action}</b> at {actionLog.timestamp}
                </div>
                <pre
                  id="api-response-output"
                  style={{
                    background: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '12px',
                    overflowX: 'auto',
                    maxHeight: '460px',
                    color: '#e2e8f0',
                  }}
                >
                  {JSON.stringify(actionLog.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '13px', paddingTop: '40px', textAlign: 'center' }}>
                No API calls made yet. Trigger any action on the left to see live HTTP status and JSON payloads here.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: Device & Fleet List */}
      <div style={{ marginTop: '24px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#93c5fd' }}>
            3. Registered Booths & Paired Devices ({devices.length} devices)
          </h2>
          <button
            id="btn-refresh-devices"
            onClick={() => fetchFleetData()}
            disabled={loading || !authToken}
            style={{ background: '#475569', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            ↻ Refresh List
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '2px solid #334155' }}>
                <th style={{ padding: '8px' }}>Booth Name</th>
                <th style={{ padding: '8px' }}>Booth ID</th>
                <th style={{ padding: '8px' }}>Device Status</th>
                <th style={{ padding: '8px' }}>Hostname / GUID</th>
                <th style={{ padding: '8px' }}>Device Secret</th>
                <th style={{ padding: '8px' }}>Paired At</th>
                <th style={{ padding: '8px' }}>Last Seen</th>
                <th style={{ padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {booths.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                    {authToken ? 'No booths found.' : 'Please login to view registered fleet devices.'}
                  </td>
                </tr>
              ) : (
                booths.map((b) => {
                  const dev = b.device;
                  const devStatus = dev?.status || 'UNPAIRED';
                  const statusBg =
                    devStatus === 'ACTIVE'
                      ? '#166534'
                      : devStatus === 'REVOKED'
                      ? '#991b1b'
                      : devStatus === 'DECOMMISSIONED'
                      ? '#854d0e'
                      : '#334155';

                  const hasSecret = Boolean(dev?.deviceSecret || b.deviceSecret);
                  const secretPreview = (dev?.deviceSecret || b.deviceSecret || '').slice(0, 14) + '...';

                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#38bdf8' }}>{b.name}</td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>{b.id}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: statusBg, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                          {devStatus}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>
                        {dev?.hostname ? (
                          <div>
                            <div>{dev.hostname}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>{dev.machineGuid}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', color: hasSecret ? '#a7f3d0' : '#f87171' }}>
                        {hasSecret ? <span title={dev?.deviceSecret || b.deviceSecret}>{secretPreview}</span> : 'NONE'}
                      </td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>
                        {dev?.pairedAt ? new Date(dev.pairedAt).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>
                        {dev?.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : b.lastSeen ? new Date(b.lastSeen).toLocaleString() : '-'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              setSelectedBoothId(b.id);
                              handleGenerateToken();
                            }}
                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '3px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Token
                          </button>
                          <button
                            onClick={() => handleRePair(b.id)}
                            style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '3px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Swap
                          </button>
                          <button
                            onClick={() => handleRevoke(b.id)}
                            style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '3px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
