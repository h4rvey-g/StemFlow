import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface OnboardingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNode: (type: 'OBSERVATION' | 'MECHANISM', textContent: string) => void;
}

export const OnboardingPopup: React.FC<OnboardingPopupProps> = ({
  isOpen,
  onClose,
  onCreateNode,
}) => {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<'OBSERVATION' | 'MECHANISM' | null>(null);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Reset state when opening/closing
  // Store previous focus and manage focus when opening/closing
  useEffect(() => {
    if (isOpen) {
      // Store current focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Move focus into dialog
      setTimeout(() => {
        const firstFocusable = dialogRef.current?.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as HTMLElement;
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }, 0);
    } else {
      // Reset state when closing
      setSelectedType(null);
      setContent('');
      setIsSubmitting(false);
      // Restore previous focus
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Handle Escape key
  // Handle Escape key and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      // Focus trap: keep Tab within dialog
      if (e.key === 'Tab' && isOpen && dialogRef.current) {
        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ) as HTMLElement[];
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement;
        
        if (e.shiftKey) {
          // Shift+Tab on first element → focus last
          if (activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab on last element → focus first
          if (activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (selectedType && content.trim() && !isSubmitting) {
      setIsSubmitting(true);
      onCreateNode(selectedType, content.trim());
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      data-testid="onboarding-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 
            id="onboarding-title" 
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            {t('onboarding.popup.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('onboarding.popup.closeAriaLabel')}
            data-testid="onboarding-close-btn"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!selectedType ? (
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => setSelectedType('MECHANISM')}
                className="flex flex-col items-center p-8 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group text-center"
                data-testid="onboarding-card-hypothesis"
              >
                <div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-blue-600 dark:text-blue-400">
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {t('onboarding.popup.hypothesis.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('onboarding.popup.hypothesis.description')}
                </p>
              </button>

              <button
                onClick={() => setSelectedType('OBSERVATION')}
                className="flex flex-col items-center p-8 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group text-center"
                data-testid="onboarding-card-observation"
              >
                <div className="p-4 bg-emerald-100 dark:bg-emerald-900/50 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-emerald-600 dark:text-emerald-400">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                  {t('onboarding.popup.observation.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('onboarding.popup.observation.description')}
                </p>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label 
                  htmlFor="node-content" 
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {selectedType === 'MECHANISM' ? t('onboarding.popup.contentLabel.mechanism') : t('onboarding.popup.contentLabel.observation')}
                </label>
                <button 
                  onClick={() => setSelectedType(null)}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
                >
                  {t('onboarding.popup.changeType')}
                </button>
              </div>
              
              <textarea
                id="node-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={selectedType === 'MECHANISM' ? t('onboarding.popup.contentPlaceholder.mechanism') : t('onboarding.popup.contentPlaceholder.observation')}
                className="w-full h-32 p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none"
                autoFocus
                data-testid="onboarding-textarea"
              />

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleCreate}
                  disabled={!content.trim() || isSubmitting}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="onboarding-create-btn"
                >
                  {isSubmitting ? t('onboarding.popup.creatingButton') : t('onboarding.popup.createButton')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
