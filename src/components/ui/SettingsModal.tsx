'use client'

import React, { useState, useEffect } from 'react';
import { saveApiKeys, loadApiKeys, type ApiKeyState, type ApiProvider } from '@/lib/api-keys';
import { useStore } from '@/stores/useStore';
import { fetchModelsDevData, getProviderModels, type FlatModel } from '@/lib/models-dev';
import type { ModelsDevSnapshot } from '@/types/models-dev';
import { fetchProviderModels, type ProviderModel } from '@/lib/fetch-provider-models';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [provider, setProvider] = useState<ApiProvider>('openai');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [anthropicModel, setAnthropicModel] = useState('');
  const globalGoal = useStore(state => state.globalGoal);
  const setGlobalGoal = useStore(state => state.setGlobalGoal);
  const [localGoal, setLocalGoal] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [modelsSnapshot, setModelsSnapshot] = useState<ModelsDevSnapshot | null>(null);
  const [availableModels, setAvailableModels] = useState<FlatModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [isFetchingProviderModels, setIsFetchingProviderModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState('');
  const [useManualInput, setUseManualInput] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setLocalGoal(globalGoal);
      loadApiKeys().then((keys) => {
        if (keys.provider) setProvider(keys.provider);
        if (keys.openaiKey) setOpenaiKey(keys.openaiKey);
        if (keys.anthropicKey) setAnthropicKey(keys.anthropicKey);
        if (keys.openaiBaseUrl) setOpenaiBaseUrl(keys.openaiBaseUrl);
        if (keys.anthropicBaseUrl) setAnthropicBaseUrl(keys.anthropicBaseUrl);
        if (keys.openaiModel) setOpenaiModel(keys.openaiModel);
        if (keys.anthropicModel) setAnthropicModel(keys.anthropicModel);
        setIsLoading(false);
      });

      setIsLoadingModels(true);
      fetchModelsDevData()
        .then((snapshot) => {
          setModelsSnapshot(snapshot);
          setIsLoadingModels(false);
        })
        .catch((error) => {
          console.error('Failed to fetch models:', error);
          setIsLoadingModels(false);
        });
    }
  }, [isOpen, globalGoal]);

  useEffect(() => {
    if (modelsSnapshot && provider) {
      const providerIdMap: Record<ApiProvider, string> = {
        'openai': 'openai',
        'anthropic': 'anthropic',
        'openai-compatible': 'openai'
      };
      
      const providerId = providerIdMap[provider];
      const models = getProviderModels(modelsSnapshot, providerId);
      setAvailableModels(models);
    }
  }, [modelsSnapshot, provider]);

  const handleFetchModels = async () => {
    if (!currentKey) {
      setFetchModelsError('API key is required');
      return;
    }

    setIsFetchingProviderModels(true);
    setFetchModelsError('');
    setProviderModels([]);

    const result = await fetchProviderModels(provider, currentKey, currentBaseUrl || undefined);

    setIsFetchingProviderModels(false);

    if (result.success && result.models) {
      setProviderModels(result.models);
      setUseManualInput(false);
    } else {
      setFetchModelsError(result.error || 'Failed to fetch models');
      setUseManualInput(true);
    }
  };

  const handleSave = async () => {
    setStatus('idle');
    setErrorMessage('');
    const newState: ApiKeyState = {
      provider,
      openaiKey: openaiKey || null,
      anthropicKey: anthropicKey || null,
      openaiBaseUrl: openaiBaseUrl || null,
      anthropicBaseUrl: anthropicBaseUrl || null,
      openaiModel: openaiModel || null,
      anthropicModel: anthropicModel || null,
    };

    const result = await saveApiKeys(newState);
    
    if (result.success) {
      setGlobalGoal(localGoal);
      setStatus('saved');
      setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 2000);
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Failed to save settings');
    }
  };

  const currentKey = provider === 'openai' || provider === 'openai-compatible' ? openaiKey : anthropicKey;
  const setCurrentKey = (val: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiKey(val);
    else setAnthropicKey(val);
  };

  const currentBaseUrl = provider === 'openai' || provider === 'openai-compatible' ? openaiBaseUrl : anthropicBaseUrl;
  const setCurrentBaseUrl = (val: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiBaseUrl(val);
    else setAnthropicBaseUrl(val);
  };
  const defaultBaseUrl = provider === 'openai' || provider === 'openai-compatible'
    ? 'https://api.openai.com/v1' 
    : 'https://api.anthropic.com/v1';

  const currentModel = provider === 'openai' || provider === 'openai-compatible' ? openaiModel : anthropicModel;
  const setCurrentModel = (val: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiModel(val);
    else setAnthropicModel(val);
  };
  const defaultModel = provider === 'openai' || provider === 'openai-compatible' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20241022';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                AI Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ApiProvider)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai-compatible">OpenAI-Compatible</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                API Key for {provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'OpenAI-Compatible Provider'}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentKey}
                  onChange={(e) => setCurrentKey(e.target.value)}
                  placeholder={`Enter ${provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}`}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Keys are stored locally and encrypted.
              </p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model
                </label>
                <div className="flex items-center gap-2">
                  {providerModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUseManualInput(!useManualInput)}
                      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {useManualInput ? 'Use dropdown' : 'Type manually'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={!currentKey || isFetchingProviderModels}
                    className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isFetchingProviderModels ? 'Fetching...' : 'Fetch Models'}
                  </button>
                </div>
              </div>
              {isFetchingProviderModels ? (
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  Fetching models from provider...
                </div>
              ) : fetchModelsError ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {fetchModelsError}
                  </div>
                  <input
                    type="text"
                    value={currentModel}
                    onChange={(e) => setCurrentModel(e.target.value)}
                    placeholder={defaultModel}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              ) : providerModels.length > 0 && !useManualInput ? (
                <select
                  value={currentModel}
                  onChange={(e) => setCurrentModel(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">{defaultModel} (default)</option>
                  {currentModel && !providerModels.some(m => m.id === currentModel) && (
                    <option value={currentModel}>{currentModel} (saved)</option>
                  )}
                  {providerModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name || model.id}
                    </option>
                  ))}
                </select>
              ) : isLoadingModels ? (
                <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  Loading models...
                </div>
              ) : availableModels.length > 0 && !useManualInput ? (
                <select
                  value={currentModel}
                  onChange={(e) => setCurrentModel(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">{defaultModel} (default)</option>
                  {currentModel && !availableModels.some(m => m.modelId === currentModel) && (
                    <option value={currentModel}>{currentModel} (saved)</option>
                  )}
                  {availableModels.map((flatModel) => (
                    <option key={flatModel.modelId} value={flatModel.modelId}>
                      {flatModel.model.name || flatModel.modelId}
                      {flatModel.model.limit?.context ? ` (${(flatModel.model.limit.context / 1000).toFixed(0)}k ctx)` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={currentModel}
                  onChange={(e) => setCurrentModel(e.target.value)}
                  placeholder={defaultModel}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {providerModels.length > 0 
                  ? `${providerModels.length} models fetched from provider`
                  : availableModels.length > 0 
                    ? `${availableModels.length} models available for ${provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'OpenAI-Compatible'}`
                    : 'Click "Fetch Models" or type model name manually'}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Base URL (Optional)
              </label>
              <input
                type="text"
                value={currentBaseUrl}
                onChange={(e) => setCurrentBaseUrl(e.target.value)}
                placeholder={defaultBaseUrl}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Leave empty to use default endpoint. Use for proxies or compatible APIs.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Research Goal (Optional)
              </label>
              <textarea
                value={localGoal}
                onChange={(e) => setLocalGoal(e.target.value)}
                placeholder="Describe your overarching research question..."
                className="h-24 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <span className={`text-sm text-green-600 transition-opacity ${status === 'saved' ? 'opacity-100' : 'opacity-0'}`}>
                Saved!
              </span>
              <span className={`text-sm text-red-600 transition-opacity ${status === 'error' ? 'opacity-100' : 'opacity-0'}`}>
                {errorMessage || 'Error saving'}
              </span>
              <button
                onClick={onClose}
                className="rounded-md border border-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-200 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!currentKey}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
