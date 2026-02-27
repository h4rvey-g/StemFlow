import React from 'react';
import { useTranslation } from 'react-i18next';

interface EmptyCanvasOverlayProps {
  onGetStarted: () => void;
}

export const EmptyCanvasOverlay: React.FC<EmptyCanvasOverlayProps> = ({
  onGetStarted,
}) => {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 pointer-events-auto flex flex-col items-center gap-4 max-w-md text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('onboarding.emptyCanvas.title')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('onboarding.emptyCanvas.description')}
        </p>
        <button
          data-testid="empty-canvas-get-started"
          onClick={onGetStarted}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          {t('onboarding.emptyCanvas.getStartedButton')}
        </button>
      </div>
    </div>
  );
};
