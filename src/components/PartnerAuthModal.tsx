import React, { useState } from 'react';
import { 
  Lock, Shield, Car, X, AlertCircle, Sparkles, ArrowRight,
  ShieldCheck, Eye, EyeOff
} from 'lucide-react';
import { AppRole } from '../types';
import { sounds } from '../services/audio';
import { isFirebaseConfigured, signInAdmin } from '../services/firebase';

interface PartnerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (role: AppRole) => void;
}

export const PartnerAuthModal: React.FC<PartnerAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticate
}) => {
  const [selectedRole, setSelectedRole] = useState<'DRIVER' | 'ADMIN'>('DRIVER');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedRole === 'DRIVER') {
      if (pin === '1234' || pin === '0000' || pin.trim() === '') {
        sounds.playSuccess();
        onAuthenticate('DRIVER_APP');
        onClose();
      } else {
        sounds.playAlert();
        setErrorMsg('Invalid Captain PIN. Try 1234 or tap quick demo below.');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      await signInAdmin(email, password);
      sounds.playSuccess();
      onAuthenticate('ADMIN_APP');
      onClose();
    } catch (error) {
      sounds.playAlert();
      setErrorMsg(error instanceof Error ? error.message : 'Admin sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemo = (role: AppRole) => {
    sounds.playSuccess();
    onAuthenticate(role);
    onClose();
  };

  const handleKeypadDigit = (digit: string) => {
    if (pin.length < 6) {
      sounds.playTap();
      setPin(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    sounds.playPop();
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800/90 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-slate-100 ring-1 ring-blue-500/20">
        
        {/* Glowing Top Ambient Pill */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/30 flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" />
          <span>Restricted Portal Access</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-blue to-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">Partner Authentication</h3>
              <p className="text-xs text-slate-400">Captain portal & Firebase-protected operations</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/90">
          <button
            type="button"
            onClick={() => {
              setSelectedRole('DRIVER');
              setPin('');
              setPassword('');
              setErrorMsg(null);
              sounds.playPop();
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs transition-all ${
              selectedRole === 'DRIVER'
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Captain Driver</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('ADMIN');
              setPin('');
              setPassword('');
              setErrorMsg(null);
              sounds.playPop();
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs transition-all ${
              selectedRole === 'ADMIN'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Fleet Ops Admin</span>
          </button>
        </div>

        {/* Partner credentials */}
        <form onSubmit={handleVerify} className="space-y-3.5">
          {selectedRole === 'DRIVER' ? <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1.5">
              <span>Captain 4-Digit Security PIN</span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
              >
                {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPin ? 'Hide' : 'Show'}</span>
              </button>
            </div>

            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="e.g. 1234"
                className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-center text-base tracking-[0.4em] text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 mt-2 font-semibold animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div> : <div className="space-y-3">
            {isFirebaseConfigured ? (
              <>
                <label className="block text-xs font-bold text-slate-300">
                  Admin email
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                    placeholder="admin@example.com"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-300">
                  Password
                  <input
                    type={showPin ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                    placeholder="Firebase Authentication password"
                  />
                </label>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
                Firebase is not configured. You can explore the admin console in local demo mode; records will not persist.
                Add the <code>VITE_FIREBASE_*</code> values to <code>.env.local</code> to enable secure sign-in and live data.
              </div>
            )}
            {errorMsg && (
              <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>}

          {/* Interactive Modern Keypad for Quick Mobile Input */}
          {selectedRole === 'DRIVER' && <div className="grid grid-cols-3 gap-1.5 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(btn => (
              <button
                key={btn}
                type="button"
                onClick={() => {
                  if (btn === 'C') {
                    sounds.playPop();
                    setPin('');
                  } else if (btn === '⌫') {
                    handleBackspace();
                  } else {
                    handleKeypadDigit(btn);
                  }
                }}
                className={`py-2 rounded-xl text-xs font-mono font-black transition active:scale-95 ${
                  btn === 'C' 
                    ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/40' 
                    : btn === '⌫'
                    ? 'bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-100 hover:bg-slate-800'
                }`}
              >
                {btn}
              </button>
            ))}
          </div>}

          {(selectedRole === 'DRIVER' || isFirebaseConfigured) && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand-blue to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-60 text-white font-black text-sm shadow-xl shadow-blue-600/30 transition flex items-center justify-center gap-2 active:scale-98"
            >
              <span>{isSubmitting ? 'Authenticating…' : 'Authenticate & Launch Portal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* 1-Click Demo Badges for Instant Evaluation */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isFirebaseConfigured ? 'Driver demo access' : 'Local demo access'}</span>
            </span>
            <span className="text-[10px] text-slate-500">{isFirebaseConfigured ? 'Driver only' : 'No persistence'}</span>
          </div>

          <div className={`grid ${isFirebaseConfigured ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
            <button
              onClick={() => handleQuickDemo('DRIVER_APP')}
              className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 text-left transition group"
            >
              <div className="text-xs font-black text-white group-hover:text-blue-400 flex items-center gap-1">
                <span>Captain Cockpit</span>
                <span className="text-blue-400">→</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">PIN 1234 • Ready to drive</div>
            </button>

            {!isFirebaseConfigured && (
              <button
                onClick={() => handleQuickDemo('ADMIN_APP')}
                className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-800/90 border border-slate-800 text-left transition group"
              >
                <div className="text-xs font-black text-white group-hover:text-indigo-400 flex items-center gap-1">
                  <span>Admin Console</span>
                  <span className="text-indigo-400">→</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Local demo • Changes are temporary</div>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
