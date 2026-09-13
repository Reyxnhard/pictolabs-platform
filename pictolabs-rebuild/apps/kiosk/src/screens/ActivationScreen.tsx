import React, { useState } from 'react';
import { kiosk } from '../ipc/bridge';

interface ActivationScreenProps {
  onActivated: (identity: any) => void;
}

export const ActivationScreen: React.FC<ActivationScreenProps> = ({ onActivated }) => {
  const [token, setToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(
    (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:4000'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<any | null>(null);

  const formatTokenInput = (val: string) => {
    let clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.startsWith('ACT')) {
      clean = clean.slice(3);
    }
    if (clean.length > 8) clean = clean.slice(0, 8);

    if (clean.length > 4) {
      return `ACT-${clean.slice(0, 4)}-${clean.slice(4)}`;
    } else if (clean.length > 0) {
      return `ACT-${clean}`;
    }
    return '';
  };

  const handleKeyPress = (char: string) => {
    setError(null);
    let currentRaw = token.replace(/[^A-Z0-9]/g, '').replace(/^ACT/, '');
    if (currentRaw.length < 8) {
      setToken(formatTokenInput(currentRaw + char));
    }
  };

  const handleBackspace = () => {
    setError(null);
    let currentRaw = token.replace(/[^A-Z0-9]/g, '').replace(/^ACT/, '');
    if (currentRaw.length > 0) {
      setToken(formatTokenInput(currentRaw.slice(0, -1)));
    }
  };

  const handleClear = () => {
    setError(null);
    setToken('');
  };

  const handleActivate = async () => {
    if (!token || token.length < 10) {
      setError('Masukkan kode aktivasi 8-karakter yang valid (contoh: ACT-XXXX-XXXX)');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await kiosk.identity?.activate(apiBaseUrl, token);
      if (res && res.success && res.identity) {
        setSuccessInfo(res.identity);
        setTimeout(() => {
          onActivated(res.identity);
        }, 2000);
      } else {
        setError(res?.error || 'Aktivasi gagal. Periksa kembali kode atau hubungi admin.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal menghubungi server aktivasi.');
    } finally {
      setIsLoading(false);
    }
  };

  const keypadChars = [
    ['2', '3', '4', '5'],
    ['6', '7', '8', '9'],
    ['A', 'B', 'C', 'D'],
    ['E', 'F', 'G', 'H'],
    ['J', 'K', 'L', 'M'],
    ['N', 'P', 'Q', 'R'],
    ['S', 'T', 'U', 'V'],
    ['W', 'X', 'Y', 'Z'],
  ];

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0F172A',
      color: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '24px',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}>
      <div style={{
        maxWidth: '680px',
        width: '100%',
        backgroundColor: '#1E293B',
        borderRadius: '24px',
        padding: '36px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        border: '1px solid #334155',
        textAlign: 'center',
      }}>
        {/* Header */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#38BDF8' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '2px', color: '#94A3B8' }}>
            PICTOLABS FLEET PROVISIONING
          </span>
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 6px 0', color: '#FFFFFF' }}>
          Aktivasi Unit Kiosk
        </h1>
        <p style={{ fontSize: '14px', color: '#94A3B8', margin: '0 0 24px 0' }}>
          Masukkan kode aktivasi 8-karakter dari Admin Dashboard untuk memasangkan booth ini ke armada.
        </p>

        {/* Success Banner */}
        {successInfo && (
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10B981',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            color: '#34D399',
            fontSize: '15px',
            fontWeight: 600,
          }}>
            ✓ Aktivasi Berhasil! Terhubung ke {successInfo.boothName || 'Booth'} ({successInfo.branchName || 'Branch'})
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '20px',
            color: '#F87171',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {/* Token Display Box */}
        <div style={{
          backgroundColor: '#0F172A',
          borderRadius: '16px',
          border: '2px dashed #475569',
          padding: '18px 24px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '4px',
            fontFamily: 'monospace',
            color: token ? '#38BDF8' : '#64748B',
          }}>
            {token || 'ACT-____-____'}
          </span>
          <button
            onClick={handleClear}
            disabled={isLoading || !token}
            style={{
              backgroundColor: '#334155',
              color: '#94A3B8',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>

        {/* On-Screen Touch Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          marginBottom: '24px',
        }}>
          {keypadChars.flat().map((char) => (
            <button
              key={char}
              onClick={() => handleKeyPress(char)}
              disabled={isLoading || !!successInfo}
              style={{
                backgroundColor: '#334155',
                color: '#F8FAFC',
                border: '1px solid #475569',
                borderRadius: '12px',
                padding: '14px 0',
                fontSize: '18px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background-color 0.1s',
              }}
              onPointerDown={(e) => { (e.currentTarget as any).style.backgroundColor = '#475569'; }}
              onPointerUp={(e) => { (e.currentTarget as any).style.backgroundColor = '#334155'; }}
            >
              {char}
            </button>
          ))}
          <button
            onClick={handleBackspace}
            disabled={isLoading || !!successInfo || !token}
            style={{
              gridColumn: 'span 4',
              backgroundColor: '#475569',
              color: '#F8FAFC',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 0',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ⌫ Hapus Karakter
          </button>
        </div>

        {/* Action Button */}
        <button
          onClick={handleActivate}
          disabled={isLoading || !!successInfo || token.length < 10}
          style={{
            width: '100%',
            backgroundColor: token.length >= 10 ? '#0284C7' : '#334155',
            color: token.length >= 10 ? '#FFFFFF' : '#64748B',
            border: 'none',
            borderRadius: '16px',
            padding: '18px 0',
            fontSize: '18px',
            fontWeight: 800,
            cursor: token.length >= 10 ? 'pointer' : 'not-allowed',
            boxShadow: token.length >= 10 ? '0 10px 25px -5px rgba(2, 132, 199, 0.5)' : 'none',
            transition: 'all 0.15s ease-in-out',
          }}
        >
          {isLoading ? 'Menghubungkan ke Backend...' : 'PASANGKAN BOOTH INI'}
        </button>

        {/* Advanced Config Fold (API URL) */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <details style={{ fontSize: '12px', color: '#64748B', cursor: 'pointer' }}>
            <summary>Pengaturan Server API Backend ({apiBaseUrl})</summary>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              style={{
                marginTop: '8px',
                width: '100%',
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#CBD5E1',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </details>
        </div>
      </div>
    </div>
  );
};

export default ActivationScreen;
