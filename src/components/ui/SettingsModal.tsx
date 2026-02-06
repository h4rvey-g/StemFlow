"use client"

import React, { useState, useEffect } from 'react'

import { saveApiKeys, loadApiKeys, type ApiKeyState, type ApiProvider } from '@/lib/api-keys'
import { fetchProviderModels } from '@/lib/fetch-provider-models'
import { useStore } from '@/stores/useStore'

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OPENAI_MODELS = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] as const
const ANTHROPIC_MODELS = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] as const
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-3-pro-preview'] as const

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [provider, setProvider] = useState<ApiProvider | null>(null);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState<string>(OPENAI_MODELS[0]);
  const [anthropicModel, setAnthropicModel] = useState<string>(ANTHROPIC_MODELS[0]);
  const [geminiModel, setGeminiModel] = useState<string>(GEMINI_MODELS[0]);
  const [fetchedModelOptions, setFetchedModelOptions] = useState<Partial<Record<ApiProvider, string[]>>>({});
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const globalGoal = useStore(state => state.globalGoal);
  const setGlobalGoal = useStore(state => state.setGlobalGoal);
  const [localGoal, setLocalGoal] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setLocalGoal(globalGoal);
      setFetchedModelOptions({});
      setModelFetchMessage('');
      loadApiKeys().then((keys) => {
        if (keys.provider) setProvider(keys.provider);
        if (keys.openaiKey) setOpenaiKey(keys.openaiKey);
        if (keys.anthropicKey) setAnthropicKey(keys.anthropicKey);
        if (keys.geminiKey) setGeminiKey(keys.geminiKey);
        if (keys.openaiBaseUrl) setOpenaiBaseUrl(keys.openaiBaseUrl);
        if (keys.anthropicBaseUrl) setAnthropicBaseUrl(keys.anthropicBaseUrl);
        if (keys.openaiModel) setOpenaiModel(keys.openaiModel);
        if (keys.anthropicModel) setAnthropicModel(keys.anthropicModel);
        if (keys.geminiModel) setGeminiModel(keys.geminiModel);
        setIsLoading(false);
      });
    }
  }, [isOpen, globalGoal]);

  const handleSave = async () => {
    setStatus('idle');
    setErrorMessage('');

    if (!provider) {
      setStatus('error');
      setErrorMessage('Provider is required');
      return;
    }

    if (provider === 'openai-compatible' && !openaiBaseUrl.trim()) {
      setStatus('error');
      setErrorMessage('Custom base URL is required for OpenAI-compatible provider');
      return;
    }

    const newState: ApiKeyState = {
      provider,
      openaiKey: openaiKey || null,
      anthropicKey: anthropicKey || null,
      geminiKey: geminiKey || null,
      openaiBaseUrl: openaiBaseUrl.trim() || null,
      anthropicBaseUrl: anthropicBaseUrl.trim() || null,
      openaiModel,
      anthropicModel,
      geminiModel,
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

  const currentKey =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiKey
      : provider === 'anthropic'
        ? anthropicKey
        : provider === 'gemini'
          ? geminiKey
        : '';
  const setCurrentKey = (val: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiKey(val);
    else if (provider === 'anthropic') setAnthropicKey(val);
    else if (provider === 'gemini') setGeminiKey(val);
  };

  const currentModel =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiModel
      : provider === 'anthropic'
        ? anthropicModel
      : provider === 'gemini'
        ? geminiModel
      : '';

  const currentBaseUrl =
    provider === 'openai' || provider === 'openai-compatible'
      ? openaiBaseUrl
      : provider === 'anthropic'
        ? anthropicBaseUrl
        : '';

  const setCurrentBaseUrl = (value: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiBaseUrl(value);
    else if (provider === 'anthropic') setAnthropicBaseUrl(value);
  };

  const setCurrentModel = (value: string) => {
    if (provider === 'openai' || provider === 'openai-compatible') setOpenaiModel(value);
    else if (provider === 'anthropic') setAnthropicModel(value);
    else if (provider === 'gemini') setGeminiModel(value);
  };

  const fallbackModelOptions =
    provider === 'openai' || provider === 'openai-compatible'
      ? OPENAI_MODELS
      : provider === 'anthropic'
        ? ANTHROPIC_MODELS
      : provider === 'gemini'
        ? GEMINI_MODELS
      : [];

  const modelOptions =
    provider && fetchedModelOptions[provider] && fetchedModelOptions[provider]!.length > 0
      ? fetchedModelOptions[provider]!
      : fallbackModelOptions;

  const handleFetchModels = async () => {
    if (!provider) {
      setModelFetchMessage('Select a provider first');
      return;
    }

    if (provider === 'gemini') {
      setModelFetchMessage('Fetching models is not supported for Gemini yet');
      return;
    }

    if (!currentKey) {
      setModelFetchMessage('Enter an API key before fetching models');
      return;
    }

    if (provider === 'openai-compatible' && !currentBaseUrl.trim()) {
      setModelFetchMessage('Enter a custom base URL before fetching models');
      return;
    }

    setIsFetchingModels(true);
    setModelFetchMessage('');

    const result = await fetchProviderModels(provider, currentKey, currentBaseUrl || undefined);

    if (!result.success) {
      setModelFetchMessage(result.error || 'Failed to fetch models');
      setIsFetchingModels(false);
      return;
    }

    const fetched = Array.from(new Set((result.models ?? []).map((model) => model.id).filter(Boolean)));

    if (fetched.length === 0) {
      setModelFetchMessage('No models returned by provider');
      setIsFetchingModels(false);
      return;
    }

    setFetchedModelOptions((prev) => ({ ...prev, [provider]: fetched }));

    if (!fetched.includes(currentModel)) {
      setCurrentModel(fetched[0]);
    }

    setModelFetchMessage(`Loaded ${fetched.length} models`);
    setIsFetchingModels(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
      data-testid="settings-modal"
    >
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
              <label htmlFor="settings-provider" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                AI Provider
              </label>
              <select
                id="settings-provider"
                value={provider ?? ''}
                onChange={(e) => setProvider(e.target.value ? (e.target.value as ApiProvider) : null)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select provider...</option>
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">OpenAI-Compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-api-key" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                API Key for {provider === 'openai' ? 'OpenAI' : provider === 'openai-compatible' ? 'OpenAI-Compatible' : provider === 'anthropic' ? 'Anthropic' : provider === 'gemini' ? 'Gemini' : 'Provider'}
              </label>
              <div className="relative">
                <input
                  id="settings-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={currentKey}
                  onChange={(e) => setCurrentKey(e.target.value)}
                  placeholder={`Enter ${provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'AIza...' : 'sk-...'}`}
                  disabled={!provider}
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

            {provider === 'openai-compatible' ? (
              <div>
                <label htmlFor="settings-base-url" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom Base URL
                </label>
                <input
                  id="settings-base-url"
                  type="url"
                  value={currentBaseUrl}
                  onChange={(e) => setCurrentBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for OpenAI-compatible endpoints.
                </p>
              </div>
            ) : null}

            <div>
              <label htmlFor="settings-model" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Model
              </label>
              <select
                id="settings-model"
                value={currentModel}
                onChange={(e) => setCurrentModel(e.target.value)}
                disabled={!provider}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {modelOptions.map((modelOption) => (
                  <option key={modelOption} value={modelOption}>
                    {modelOption}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={!provider || !currentKey || isFetchingModels || provider === 'gemini'}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {isFetchingModels ? 'Fetching...' : 'Fetch Models'}
                </button>
                {modelFetchMessage ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{modelFetchMessage}</span>
                ) : null}
              </div>
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
                disabled={!provider || !currentKey || (provider === 'openai-compatible' && !openaiBaseUrl.trim())}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
