import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Leaf, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { validateIndianMobile } from '../utils/commerceRules.ts';
import { RESEND_OTP_COOLDOWN_SECONDS, formatE164IndianPhone } from '../utils/phoneAuth.ts';
import { signInWithPhoneOtp, verifyPhoneOtp } from '../lib/supabase.ts';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { signInWithPopup } from 'firebase/auth';
import { UserProfile } from '../types/commerce.ts';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [selectedRole] = useState<'customer' | 'seller' | 'admin'>('customer');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(RESEND_OTP_COOLDOWN_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStep('phone');
      setError('');
      setInfoMessage('');
      setOtpDigits(['', '', '', '', '', '']);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step !== 'otp' || resendTimer <= 0) return;
    const t = setInterval(() => {
      setResendTimer((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [step, resendTimer]);

  if (!isOpen) return null;

  const isPhoneValid = validateIndianMobile(phone);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    setLoading(true);
    setError('');
    setInfoMessage('');
    try {
      const fullPhone = formatE164IndianPhone(phone);
      await signInWithPhoneOtp(fullPhone);
      setStep('otp');
      setResendTimer(RESEND_OTP_COOLDOWN_SECONDS);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 60);
    } catch (err: any) {
      setError(err?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || resending || loading) return;
    setResending(true);
    setError('');
    setInfoMessage('');
    try {
      const fullPhone = formatE164IndianPhone(phone);
      await signInWithPhoneOtp(fullPhone);
      setResendTimer(RESEND_OTP_COOLDOWN_SECONDS);
      setOtpDigits(['', '', '', '', '', '']);
      setInfoMessage(`A new OTP has been sent to ${fullPhone}.`);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 60);
    } catch (err: any) {
      setError(err?.message || 'Could not resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const submitOtpCode = async (code: string) => {
    if (code.length !== 6) return;
    setLoading(true);
    setError('');
    setInfoMessage('');
    try {
      const fullPhone = formatE164IndianPhone(phone);
      const result = await verifyPhoneOtp(fullPhone, code, selectedRole);
      onLoginSuccess(result.user, result.token);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired OTP. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpBoxChange = (index: number, value: string) => {
    setError('');
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    // Handle paste of full 6-digit OTP
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        next[i] = chars[i] || '';
      }
      setOtpDigits(next);
      if (chars.length === 6) {
        submitOtpCode(chars.join(''));
      } else {
        otpInputRefs.current[chars.length]?.focus();
      }
      return;
    }

    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const combined = next.join('');
    if (combined.length === 6) {
      submitOtpCode(combined);
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fullName: cred.user.displayName || 'Bharat Organic Member',
          role: selectedRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google Auth sync failed');
      onLoginSuccess(data.user, idToken);
      onClose();
    } catch (err: any) {
      setError(
        err.message || 'Popup closed or blocked. You can log in immediately using Mobile + OTP above.'
      );
    } finally {
      setLoading(false);
    }
  };

  const formattedPhone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Log in or Sign up"
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative">
        {/* Top Controls */}
        <div className="flex items-center justify-between mb-4">
          {step === 'otp' ? (
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setError('');
                setInfoMessage('');
              }}
              aria-label="Back to phone number"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close login modal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Centered Brand Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 flex items-center justify-center text-amber-300 shadow-md mb-3">
            <Leaf className="w-8 h-8 fill-amber-300/20" />
          </div>

          {step === 'phone' ? (
            <>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                Log in or Sign up
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                21-minute farm-to-door organic delivery across India
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                OTP Verification
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Enter the 6-digit code sent to{' '}
                <span className="font-bold text-slate-900">{formattedPhone}</span>
              </p>
            </>
          )}
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            {/* +91 Mobile Number Field */}
            <div>
              <label
                htmlFor="bharat-mobile-input"
                className="sr-only"
              >
                Enter mobile number
              </label>
              <div className="flex items-center h-12 rounded-2xl border-2 border-slate-200 focus-within:border-emerald-700 bg-slate-50/60 focus-within:bg-white px-3.5 transition-colors">
                <span className="text-sm font-extrabold text-slate-800 pr-3 border-r border-slate-200 select-none">
                  +91
                </span>
                <input
                  id="bharat-mobile-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setError('');
                  }}
                  placeholder="Enter mobile number"
                  className="w-full pl-3 bg-transparent text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Continue Button: Grey when invalid, Emerald when valid 10-digit Indian number */}
            <button
              type="submit"
              disabled={!isPhoneValid || loading}
              className={`w-full h-12 rounded-2xl font-extrabold text-sm transition-all ${
                isPhoneValid && !loading
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Sending OTP...' : 'Continue'}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400">
                OR
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-11 rounded-2xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Continue with Google Account
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
              By continuing, you agree to our Terms of service &amp; Privacy policy
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            {/* 6 Individual OTP Boxes */}
            <div className="flex items-center justify-center gap-2 sm:gap-2.5">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpInputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  aria-label={`OTP digit ${idx + 1}`}
                  onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-11 h-12 sm:w-12 sm:h-13 rounded-xl border-2 border-slate-200 focus:border-emerald-700 text-center font-mono-tabular text-lg font-extrabold text-slate-900 focus:outline-none"
                />
              ))}
            </div>

            {/* Resend OTP with 60-second cooldown */}
            <div className="flex items-center justify-center px-1 text-xs">
              {resendTimer > 0 ? (
                <span className="text-slate-500 font-mono-tabular">
                  Resend OTP in {resendTimer}s
                </span>
              ) : (
                <button
                  type="button"
                  disabled={resending || loading}
                  onClick={handleResendOtp}
                  className="text-emerald-700 font-bold hover:underline cursor-pointer disabled:opacity-50"
                >
                  {resending ? 'Sending OTP...' : 'Resend OTP'}
                </button>
              )}
            </div>

            {infoMessage && (
              <p className="text-xs font-semibold text-emerald-700 text-center">
                {infoMessage}
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              disabled={otpDigits.join('').length !== 6 || loading}
              onClick={() => submitOtpCode(otpDigits.join(''))}
              className={`w-full h-12 rounded-2xl font-extrabold text-sm transition-all ${
                otpDigits.join('').length === 6 && !loading
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? 'Verifying OTP...' : 'Verify & Proceed'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
